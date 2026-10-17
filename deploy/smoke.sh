#!/bin/sh
# 冒烟测试：验证 nginx → BFF → PostgreSQL 的完整链路与租户隔离。
# 用法：BASE_URL=http://localhost:8080 sh deploy/smoke.sh
# 依赖：curl。脚本会创建一条临时员工记录，结束时删除。
# 载荷全部使用 ASCII，避免不同终端/代码页把请求体转码。
set -eu

BASE_URL="${BASE_URL:-http://localhost:8080}"
TENANT="${SMOKE_TENANT:-tenant_demo_school}"
OTHER_TENANT="${SMOKE_OTHER_TENANT:-tenant_other}"
API="$BASE_URL/api/v1/leave_approval/employee"
RUN_ID="$(date +%s)"
EMP_NO="SMOKE-$RUN_ID"

say() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "需要 curl"

say "[1/6] web /healthz"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/healthz")
[ "$code" = "200" ] || fail "web /healthz 返回 $code"

say "[2/6] 缺少租户头应被拒绝"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API")
[ "$code" = "400" ] || fail "缺少 X-Tenant-Id 应返回 400，实际 $code"

say "[3/6] 创建员工"
body="{\"employee_no\":\"$EMP_NO\",\"name\":\"Smoke Test\",\"dept_id\":\"dept_smoke\",\"dept_name\":\"Smoke Dept\",\"phone\":\"13800138000\",\"position\":\"teacher\",\"hire_date\":\"2024-09-01\"}"
created=$(curl -sS -X POST "$API" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary "$body")
id=$(printf '%s' "$created" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$id" ] || fail "创建失败：$created"
cleanup() {
  curl -s -o /dev/null -X DELETE "$API/$id" \
    -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" || true
}
trap cleanup EXIT
case "$created" in
  *"\"tenant_id\":\"$TENANT\""*) ;;
  *) fail "创建结果的 tenant_id 不是 $TENANT：$created" ;;
esac

say "[4/6] 更新员工"
updated=$(curl -sS -X PUT "$API/$id" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary '{"name":"Smoke Updated","dept_id":"dept_smoke_2","dept_name":"Smoke Dept 2","position":"staff"}')
case "$updated" in
  *'"name":"Smoke Updated"'*) ;;
  *) fail "更新失败：$updated" ;;
esac

say "[5/6] 租户隔离"
other=$(curl -sS "$API?q=$EMP_NO" \
  -H "X-Tenant-Id: $OTHER_TENANT" -H "X-User-Id: smoke")
case "$other" in
  *'"total":0'*) ;;
  *) fail "其他租户看到了本租户数据：$other" ;;
esac
own=$(curl -sS "$API?q=$EMP_NO" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
case "$own" in
  *"$EMP_NO"*) ;;
  *) fail "本租户搜索不到刚创建的数据：$own" ;;
esac

say "[6/6] 删除员工"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/$id" \
  -H "X-Tenant-Id: $TENANT" -H "X-User-Id: smoke")
[ "$code" = "204" ] || fail "删除返回 $code"
trap - EXIT

say "PASS · 租户 $TENANT · 记录 $EMP_NO 已清理"
