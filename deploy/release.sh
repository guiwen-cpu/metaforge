#!/bin/sh
# 发布到指定环境：staging | prod
# 用法：sh deploy/release.sh <staging|prod> [TAG]
#   TAG 优先级：命令行参数 > 环境变量 > deploy/.env.<env>
set -eu

cd "$(dirname "$0")"

ENV_NAME="${1:-}"
TAG_ARG="${2:-}"

usage() {
  printf '用法：sh deploy/release.sh <staging|prod> [TAG]\n' >&2
}

case "$ENV_NAME" in
  staging|prod) ;;
  *) usage; exit 2 ;;
esac

ENV_FILE=".env.$ENV_NAME"
if [ ! -f "$ENV_FILE" ]; then
  printf '缺少 %s：先执行 cp %s.example %s 并填写密码\n' "$ENV_FILE" "$ENV_FILE" "$ENV_FILE" >&2
  exit 1
fi

file_tag=$(sed -n 's/^TAG=//p' "$ENV_FILE" | tail -n 1)
TAG="${TAG_ARG:-${TAG:-$file_tag}}"
[ -n "$TAG" ] || { printf 'TAG 未设置\n' >&2; exit 1; }
export TAG

if [ "$ENV_NAME" = "prod" ]; then
  case "$TAG" in
    v*) ;;
    *) printf 'prod 的 TAG 必须以 v 开头（当前：%s）\n' "$TAG" >&2; exit 1 ;;
  esac
fi

PROJECT="metaforge-$ENV_NAME"

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f compose.yaml -f "compose.$ENV_NAME.yaml" "$@"
}

printf '发布 %s（TAG=%s，project=%s）\n' "$ENV_NAME" "$TAG" "$PROJECT"
compose pull
compose --profile tools run --rm migrate
compose up -d --remove-orphans
compose ps
