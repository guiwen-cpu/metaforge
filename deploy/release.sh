#!/bin/sh
# 发布到指定环境：staging | prod
# 用法：sh deploy/release.sh <staging|prod> [TAG]
#   TAG 优先级：命令行参数 > 环境变量 > deploy/.env.<env>
#
# 流程：校验参数与环境文件 → 解析 TAG → 拉取镜像 → 执行迁移 → 启动服务 → 健康门禁
# 调用方：.github/workflows/staging.yml（push dev，TAG=sha-<commit>）
#         .github/workflows/release.yml（push main，TAG=sha-<commit>）
# 镜像：阿里云 ACR，地址与命名空间可用 ACR_REGISTRY / ACR_NAMESPACE 覆盖；
#       私有仓库需先登录，凭据可放环境变量或 .env.<env>。
# 脚本以 deploy/ 为工作目录，需与 compose*.yaml、.env.<env> 放在同一目录。
set -eu

# 从任意目录调用都切到 deploy/，保证后面的相对路径稳定
cd "$(dirname "$0")"

# 环境名必填；TAG 可选，缺省时再回退到环境变量或 env 文件
ENV_NAME="${1:-}"
TAG_ARG="${2:-}"

usage() {
  printf '用法：sh deploy/release.sh <staging|prod> [TAG]\n' >&2
}

case "$ENV_NAME" in
  staging|prod) ;;
  *) usage; exit 2 ;; # 参数错误用 2，与运行失败区分
esac

# 每个环境使用独立 env 文件：密码、端口与默认 TAG 互不影响，且不入 Git
ENV_FILE=".env.$ENV_NAME"
if [ ! -f "$ENV_FILE" ]; then
  printf '缺少 %s：先执行 cp %s.example %s 并填写密码\n' "$ENV_FILE" "$ENV_FILE" "$ENV_FILE" >&2
  exit 1
fi

# 按 key 读取 env 文件的值。不做 source，避免密码里的 $ 或反引号被 shell 展开。
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tr -d '\r' | tail -n 1
}

# env 文件中的 TAG 只作兜底；显式参数优先，便于 CI 固定到某次构建
file_tag=$(env_value TAG)
TAG="${TAG_ARG:-${TAG:-$file_tag}}"
[ -n "$TAG" ] || { printf 'TAG 未设置\n' >&2; exit 1; }
# 导出后 compose 文件里的 ${TAG} 才能解析
export TAG

# 镜像库：环境变量 > env 文件 > 默认值；默认值与 compose.<env>.yaml 保持一致
ACR_REGISTRY="${ACR_REGISTRY:-$(env_value ACR_REGISTRY)}"
ACR_REGISTRY="${ACR_REGISTRY:-registry.cn-hangzhou.aliyuncs.com}"
ACR_NAMESPACE="${ACR_NAMESPACE:-$(env_value ACR_NAMESPACE)}"
ACR_NAMESPACE="${ACR_NAMESPACE:-metaforge}"
export ACR_REGISTRY ACR_NAMESPACE

# 入口端口：宿主机 HTTP / HTTPS；compose 会从 env 文件读取，这里显式导出用于自检。
# 旧版只配置 WEB_PORT（映射到 8443），新编排拆成 HTTP 健康端口与 HTTPS 业务端口；
# 缺少新变量时直接失败，避免默认回退到 80/443 与宿主机既有站点冲突。
http_port="${NGINX_HTTP_PORT:-$(env_value NGINX_HTTP_PORT)}"
https_port="${NGINX_HTTPS_PORT:-$(env_value NGINX_HTTPS_PORT)}"
legacy_port="$(env_value WEB_PORT)"
if [ -z "$http_port" ] || [ -z "$https_port" ]; then
  if [ -n "$legacy_port" ]; then
    printf '检测到旧变量 WEB_PORT=%s，但缺少 NGINX_HTTP_PORT / NGINX_HTTPS_PORT；请先迁移 env 文件\n' "$legacy_port" >&2
  else
    printf '缺少 NGINX_HTTP_PORT / NGINX_HTTPS_PORT；请在 env 文件中设置入口宿主机端口\n' >&2
  fi
  exit 1
fi
export NGINX_HTTP_PORT="$http_port" NGINX_HTTPS_PORT="$https_port"

# 私有镜像需要先登录 ACR。凭据缺失时假定目标机已经执行过 docker login。
acr_user="${ACR_USERNAME:-$(env_value ACR_USERNAME)}"
acr_pass="${ACR_PASSWORD:-$(env_value ACR_PASSWORD)}"
if [ -n "$acr_user" ] && [ -n "$acr_pass" ]; then
  printf '%s' "$acr_pass" | docker login "$ACR_REGISTRY" -u "$acr_user" --password-stdin
fi

# Compose 项目名带环境后缀：容器、网络、数据卷按环境隔离，
# 对应 deploy/README.md 中的 metaforge-staging / metaforge-prod。
PROJECT="metaforge-$ENV_NAME"

# 统一拼装 compose 命令：基础编排 + 环境覆盖层。
# 各步骤只传子命令，避免漏掉 -p 或 --env-file 而操作到别的环境。
compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f compose.yaml -f "compose.$ENV_NAME.yaml" "$@"
}

# 健康检查函数：depends_on 只保证启动顺序，不代表进程可用。
wait_healthy() {
  service=$1
  attempt=0
  while [ $attempt -lt 60 ]; do
    container=$(compose ps -q $service 2>/dev/null || true)
    case $container in
      '')
        ;;
      *)
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $container 2>/dev/null || printf 'unknown')
        case $status in
          healthy) return 0 ;;
          unhealthy|exited|dead)
            printf '%s 状态为 %s，停止发布\n' $service $status >&2
            return 1
            ;;
        esac
        ;;
    esac
    attempt=$((attempt + 1))
    sleep 5
  done
  printf '%s 在 5 分钟内未变为 healthy，停止发布\n' $service >&2
  return 1
}

# 先输出最终参数，CI 日志里可直接确认环境与镜像版本
printf '发布 %s（镜像=%s/%s，TAG=%s，project=%s）\n' \
  "$ENV_NAME" "$ACR_REGISTRY" "$ACR_NAMESPACE" "$TAG" "$PROJECT"
# 打印实际镜像清单：staging/prod 的 postgres/redis 也应来自 ACR，不能落回 Docker Hub
compose config --images
# 只拉取当前 TAG 对应镜像，不在发布机上重新构建
compose pull
# 入口配置与证书都在运行时挂载；nginx-unprivileged 以 uid 101 读取，先做一次真实可读性检查，
# 避免 compose up 成功返回但 nginx 容器反复重启。
if ! compose run --rm -T --no-deps --entrypoint sh nginx -c \
  'test -r /etc/nginx/certs/www.devshare.bond.pem && test -r /etc/nginx/certs/www.devshare.bond.key'; then
  printf '证书不可用：确认 ../certs/www.devshare.bond.pem 与 .key 存在，且容器内 nginx（uid 101）可读\n' >&2
  exit 1
fi
# 迁移必须先于新服务启动；tools profile 只在本次 run 中启用
compose --profile tools run --rm migrate
# --remove-orphans 清理覆盖层变更后遗留的旧服务，避免端口/网络残留
compose up -d --remove-orphans
# 五个长期服务都必须健康；否则部署任务直接失败，避免“启动了但不可用”被误判成功
for service in postgres redis bff web nginx; do
  wait_healthy $service
done

# 容器健康不等于入口可用：再从宿主机走一次真实 HTTPS，验证 nginx 与证书链路
if command -v curl >/dev/null 2>&1; then
  if ! curl -fsSk --resolve www.devshare.bond:${https_port}:127.0.0.1 \
    "https://www.devshare.bond:${https_port}/healthz" >/dev/null; then
    printf 'HTTPS 健康检查失败：127.0.0.1:%s/healthz\n' "$https_port" >&2
    exit 1
  fi
  printf 'HTTPS 健康检查通过：127.0.0.1:%s/healthz\n' "$https_port"
fi

# 输出最终状态，便于确认发布结果
compose ps
