#!/bin/sh
# 控制平面冒烟：应用 → 草稿 → 发布 v1 → 发布 v2 → 回滚 v1 → 租户隔离。
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

say "[1/12] 创建应用"
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

say "[2/12] 保存草稿 v1"
saved=$(draft "{\"bundle\":$bundle_v1}")
case "$saved" in
  *"\"revision\":2"*) ;;
  *) fail "草稿 revision 不是 2：$saved" ;;
esac

say "[3/12] 发布 v1"
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

say "[4/12] 保存草稿 v2"
saved=$(draft "{\"bundle\":$bundle_v2}")
case "$saved" in
  *"\"revision\":3"*) ;;
  *) fail "草稿 revision 不是 3：$saved" ;;
esac

say "[5/12] 发布 v2（based_on 应为 1）"
v2=$(publish '{"message":"v2"}')
V2=$(num_of "$v2" '"version_no":[0-9]*')
[ "$V2" = "2" ] || fail "v2 version_no 不是 2：$v2"
case "$v2" in
  *"\"based_on_version\":1"*) ;;
  *) fail "v2 的 based_on_version 不是 1：$v2" ;;
esac

say "[6/12] 读取历史版本 v1"
got1=$(curl -sS "$API/$APP_ID/versions/1" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$got1" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "历史版本 v1 内容不正确：$got1" ;;
esac

say "[7/12] 回滚到 v1（生成 v3）"
v3=$(curl -sS -X POST "$API/$APP_ID/versions/1/rollback" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary '{"message":"rollback to v1"}')
V3=$(num_of "$v3" '"version_no":[0-9]*')
[ "$V3" = "3" ] || fail "回滚后 version_no 不是 3：$v3"
case "$v3" in
  *"\"rollback_of_version\":1"*) ;;
  *) fail "回滚版本缺少 rollback_of_version=1：$v3" ;;
esac
case "$v3" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "回滚后内容不是 v1：$v3" ;;
esac

say "[8/12] 应用索引已指向 v3"
app=$(curl -sS "$API/$APP_ID" -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$app" in
  *"\"current_version\":3"*) ;;
  *) fail "current_version 不是 3：$app" ;;
esac
case "$app" in
  *"\"name\":\"Smoke V1\""*) ;;
  *) fail "回滚后应用名称未同步为 Smoke V1：$app" ;;
esac

say "[9/12] 版本列表共 3 条且倒序"
versions=$(curl -sS "$API/$APP_ID/versions" -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$versions" in
  *"\"total\":3"*) ;;
  *) fail "版本总数不是 3：$versions" ;;
esac
first=$(printf '%s' "$versions" | grep -o '"version_no":[0-9]*' | head -1)
[ "$first" = '"version_no":3' ] || fail "版本列表未按版本号倒序：$versions"

say "[10/12] 草稿乐观锁"
code=$(curl -s -o /tmp/mf-draft-conflict.json -w '%{http_code}' -X PUT "$API/$APP_ID/draft" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary "{\"bundle\":$bundle_v1,\"revision\":1}")
[ "$code" = "409" ] || fail "过期 revision 应返回 409，实际 $code"
case "$(cat /tmp/mf-draft-conflict.json)" in
  *"draft_conflict"*) ;;
  *) fail "错误码不是 draft_conflict：$(cat /tmp/mf-draft-conflict.json)" ;;
esac

say "[11/12] 租户隔离"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/$APP_ID" \
  -H "X-Tenant-Id: $OTHER_TENANT" -H "X-User-Id: smoke")
[ "$code" = "404" ] || fail "其他租户读取应用应返回 404，实际 $code"
other=$(curl -sS "$API?q=$APP_KEY" -H "X-Tenant-Id: $OTHER_TENANT" -H "X-User-Id: smoke")
case "$other" in
  *"\"total\":0"*) ;;
  *) fail "其他租户看到了应用：$other" ;;
esac

say "[12/12] 删除应用"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/$APP_ID" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
[ "$code" = "204" ] || fail "删除返回 $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/$APP_ID" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
[ "$code" = "404" ] || fail "删除后读取应返回 404，实际 $code"
trap - EXIT

say "PASS · 租户 $TENANT · 应用 $APP_KEY 已清理"