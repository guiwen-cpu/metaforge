#!/bin/sh
# 控制平面冒烟：应用 → 草稿 → 发布 → 去重 → diff → 回滚 → 恢复草稿 → 租户隔离。
# 用法：BASE_URL=http://localhost:8080 sh deploy/smoke-platform.sh
# 依赖：curl、grep、sed。脚本创建的应用会在结束时删除。
set -eu

BASE_URL="${BASE_URL:-http://localhost:8080}"
TENANT="${SMOKE_TENANT:-tenant_demo_school}"
OTHER_TENANT="${SMOKE_OTHER_TENANT:-tenant_other}"
API="$BASE_URL/api/v1/platform/apps"
RUN_ID="$(date +%s)"
APP_KEY="smoke_platform_$RUN_ID"

say() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
json_of() { printf '%s' "$1" | grep -o "$2" | head -1 | sed 's/^[^:]*:"//; s/"$//'; }
num_of() { printf '%s' "$1" | grep -o "$2" | head -1 | sed 's/^[^:]*://'; }

command -v curl >/dev/null 2>&1 || fail "需要 curl"

say "[1/16] 创建应用"
created=$(curl -sS -X POST "$API" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary "{\"key\":\"$APP_KEY\",\"name\":\"Smoke App\",\"description\":\"platform smoke\",\"type\":\"education\"}")
APP_ID=$(json_of "$created" '"id":"[^"]*"')
[ -n "$APP_ID" ] || fail "创建失败：$created"
cleanup() {
  curl -s -o /dev/null -X DELETE "$API/$APP_ID" \
    -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" || true
}
trap cleanup EXIT
case "$created" in
  *"\"status\":\"draft\""*) ;;
  *) fail "新建应用状态不是 draft：$created" ;;
esac

draft() {
  curl -sS -X PUT "$API/$APP_ID/draft" \
    -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data-binary "$1"
}

publish() {
  curl -sS -X POST "$API/$APP_ID/versions" \
    -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data-binary "$1"
}

bundle_v1='{"bundle":{"protocolVersion":"0.1","tenantId":"'"$TENANT"'","app":{"id":"01J00000000000000000000000","key":"'"$APP_KEY"'","name":"Smoke V1","description":"version one"},"artifacts":{"dataSchemas":[],"uiSchemas":[],"logicSchemas":[]}}}'
bundle_v2='{"bundle":{"protocolVersion":"0.1","tenantId":"'"$TENANT"'","app":{"id":"01J00000000000000000000000","key":"'"$APP_KEY"'","name":"Smoke V2","description":"version two"},"artifacts":{"dataSchemas":[],"uiSchemas":[],"logicSchemas":[]}}}'

say "[2/16] 保存草稿 v1"
saved=$(draft "{\"bundle\":$bundle_v1}")
case "$saved" in
  *"\"revision\":2"*) ;;
  *) fail "草稿 revision 不是 2：$saved" ;;
esac

say "[3/16] 发布 v1"
v1=$(publish '{"message":"v1"}')
V1=$(num_of "$v1" '"version_no":[0-9]*')
[ "$V1" = "1" ] || fail "v1 version_no 不是 1：$v1"
case "$v1" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "v1 bundle 缺少 Smoke V1：$v1" ;;
esac
case "$v1" in
  *"\"rollback_of_version\""*) fail "v1 不应有 rollback_of_version：$v1" ;;
esac
case "$v1" in
  *"\"unchanged\":false"*) ;;
  *) fail "首次发布 unchanged 应为 false：$v1" ;;
esac

say "[4/16] 保存草稿 v2"
saved=$(draft "{\"bundle\":$bundle_v2}")
case "$saved" in
  *"\"revision\":3"*) ;;
  *) fail "草稿 revision 不是 3：$saved" ;;
esac

say "[5/16] 发布 v2（based_on 应为 1）"
v2=$(publish '{"message":"v2"}')
V2=$(num_of "$v2" '"version_no":[0-9]*')
[ "$V2" = "2" ] || fail "v2 version_no 不是 2：$v2"
case "$v2" in
  *"\"based_on_version\":1"*) ;;
  *) fail "v2 的 based_on_version 不是 1：$v2" ;;
esac

say "[6/16] 内容未变时发布返回 unchanged（不产生 v3）"
code=$(curl -s -o /tmp/mf-unchanged.json -w '%{http_code}' -X POST "$API/$APP_ID/versions" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary '{"message":"repeat"}')
[ "$code" = "200" ] || fail "内容未变应返回 200，实际 $code：$(cat /tmp/mf-unchanged.json)"
case "$(cat /tmp/mf-unchanged.json)" in
  *"\"unchanged\":true"*) ;;
  *) fail "未命中内容去重：$(cat /tmp/mf-unchanged.json)" ;;
esac
case "$(cat /tmp/mf-unchanged.json)" in
  *"\"version_no\":2"*) ;;
  *) fail "未变化时应返回当前版本 2：$(cat /tmp/mf-unchanged.json)" ;;
esac

say "[7/16] 强制发布会生成 v3"
forced=$(publish '{"message":"force republish","force":true}')
V3=$(num_of "$forced" '"version_no":[0-9]*')
[ "$V3" = "3" ] || fail "force 发布 version_no 不是 3：$forced"

say "[8/16] 版本 diff：v1 → v2"
diff=$(curl -sS "$API/$APP_ID/versions/1/diff/2" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$diff" in
  *"\"identical\":false"*) ;;
  *) fail "diff 未识别内容变化：$diff" ;;
esac
case "$diff" in
  *"\"path\":\"app.name\""*) ;;
  *) fail "diff 缺少 app.name 变化：$diff" ;;
esac
case "$diff" in
  *"\"changed\":2"*) ;;
  *) fail "diff 变更数量不是 2：$diff" ;;
esac

say "[9/16] 读取历史版本 v1"
got1=$(curl -sS "$API/$APP_ID/versions/1" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$got1" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "历史版本 v1 内容不正确：$got1" ;;
esac
case "$got1" in
  *"\"content_checksum\":\""*) ;;
  *) fail "版本详情缺少 content_checksum：$got1" ;;
esac

say "[10/16] 回滚到 v1（生成 v4）"
v4=$(curl -sS -X POST "$API/$APP_ID/versions/1/rollback" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary '{"message":"rollback to v1"}')
V4=$(num_of "$v4" '"version_no":[0-9]*')
[ "$V4" = "4" ] || fail "回滚后 version_no 不是 4：$v4"
case "$v4" in
  *"\"rollback_of_version\":1"*) ;;
  *) fail "回滚版本缺少 rollback_of_version=1：$v4" ;;
esac
case "$v4" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "回滚后内容不是 v1：$v4" ;;
esac

say "[11/16] 应用索引已指向 v4"
app=$(curl -sS "$API/$APP_ID" -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$app" in
  *"\"current_version\":4"*) ;;
  *) fail "current_version 不是 4：$app" ;;
esac
case "$app" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "回滚后应用名称未同步为 Smoke V1：$app" ;;
esac

say "[12/16] 版本列表共 4 条且倒序"
versions=$(curl -sS "$API/$APP_ID/versions" -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$versions" in
  *"\"total\":4"*) ;;
  *) fail "版本总数不是 4：$versions" ;;
esac
first=$(printf '%s' "$versions" | grep -o '"version_no":[0-9]*' | head -1)
[ "$first" = '"version_no":4' ] || fail "版本列表未按版本号倒序：$versions"

say "[13/16] 把 v1 恢复成草稿"
restored=$(curl -sS -X POST "$API/$APP_ID/versions/1/restore-draft" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary '{"revision":3}')
case "$restored" in
  *"\"revision\":4"*) ;;
  *) fail "恢复草稿后 revision 不是 4：$restored" ;;
esac
case "$restored" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "恢复草稿内容不是 v1：$restored" ;;
esac
case "$restored" in
  *"\"snapshot\""*) fail "草稿不应携带 snapshot：$restored" ;;
esac

say "[14/16] 恢复草稿后再次发布命中内容去重"
again=$(publish '{"message":"restored"}')
case "$again" in
  *"\"unchanged\":true"*) ;;
  *) fail "恢复草稿后发布应命中内容去重：$again" ;;
esac
case "$again" in
  *"\"version_no\":4"*) ;;
  *) fail "去重应返回当前版本 4：$again" ;;
esac

say "[15/16] 草稿乐观锁"
code=$(curl -s -o /tmp/mf-draft-conflict.json -w '%{http_code}' -X PUT "$API/$APP_ID/draft" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary "{\"bundle\":$bundle_v1,\"revision\":1}")
[ "$code" = "409" ] || fail "过期 revision 应返回 409，实际 $code"
case "$(cat /tmp/mf-draft-conflict.json)" in
  *"draft_conflict"*) ;;
  *) fail "错误码不是 draft_conflict：$(cat /tmp/mf-draft-conflict.json)" ;;
esac

say "[16/16] 租户隔离并删除"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/$APP_ID" \
  -H "X-Tenant-Id: $OTHER_TENANT" -H "X-User-Id: smoke")
[ "$code" = "404" ] || fail "其他租户读取应用应返回 404，实际 $code"
other=$(curl -sS "$API?q=$APP_KEY" -H "X-Tenant-Id: $OTHER_TENANT" -H "X-User-Id: smoke")
case "$other" in
  *"\"total\":0"*) ;;
  *) fail "其他租户看到了应用：$other" ;;
esac
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/$APP_ID" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
[ "$code" = "204" ] || fail "删除返回 $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/$APP_ID" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
[ "$code" = "404" ] || fail "删除后读取应返回 404，实际 $code"
trap - EXIT

say "PASS · 租户 $TENANT · 应用 $APP_KEY 已清理"