# MetaForge Docker 部署

> 状态：P0 可部署骨架已落地并实测通过，支持 `staging` / `prod` 两套环境。
> 平台主应用、Flowable 运行时、OSS STS、JWT/SSO 仍属 P1，见文末「已知缺口」。

## 1. 组成

```text
浏览器
  │ :${WEB_PORT}
  ▼
web（nginx-unprivileged）
  ├─ /       → 控制平面工作台（Vite 构建产物，history fallback）
  ├─ /demo/  → 出码示例应用（构建时 base=/demo/）
                ├─ PostgreSQL 16（元数据 + 业务数据）
                └─ Redis 7（缓存 / 会话 / 分布式锁）
```

- `web` 是唯一发布宿主机端口的服务；`bff`、`postgres`、`redis` 只在 `data` 内网。
- 所有容器非 root、只读根文件系统（`web`/`bff`）、`no-new-privileges`、健康检查、日志可轮转。
- BFF 是普通 Spring Boot 进程，生成的 `codegen/<app>/api` 源码通过 `build-helper` 一起编译。

## 2. 环境划分

| 环境 | 用途 | Compose 组合 | env 文件 | 项目名 | 默认端口 | 镜像来源 |
|---|---|---|---|---|---|---|
| local | 本机开发 | `compose.yaml` | `.env` | `metaforge` | 8080（HTTP） | 本地构建 |
| staging | 预发 / 验收 | `compose.yaml` + `compose.staging.yaml` | `.env.staging` | `metaforge-staging` | 8081（HTTPS） | 阿里云 ACR `:staging`、`:sha-*` |
| prod | 生产 | `compose.yaml` + `compose.prod.yaml` | `.env.prod` | `metaforge-prod` | 8080（HTTPS） | 阿里云 ACR `:prod`、`:sha-*` |

- 项目名不同 → 容器名、网络、数据卷全部隔离（`metaforge-staging_pg_data` 与
  `metaforge-prod_pg_data` 互不影响），因此两套环境可以部署在同一台机器；
  端口需错开（示例 staging 用 8081）。
- 分机器部署时，两边都可以用 8080。
- prod 覆盖层额外限制 CPU/内存；staging 不限制，便于压测与调试。
- local 直接监听容器 8080（HTTP）；staging / prod 的 `WEB_PORT` 映射到容器 8443，
  由 `deploy/nginx/nginx.tls.conf` 提供 HTTPS，证书放在仓库根目录的 `certs/`（不入 Git）。

## 3. 目录

| 路径 | 用途 |
|---|---|
| `deploy/compose.yaml` | 基础编排（构建 + 全栈服务） |
| `deploy/compose.staging.yaml` | staging 覆盖层：ACR 镜像 |
| `deploy/compose.prod.yaml` | prod 覆盖层：ACR 镜像 + 资源上限 |
| `deploy/compose.bff-dev.yaml` | 本地开发可选覆盖层：BFF 映射宿主机 `BFF_DEV_PORT`（默认 8081） |
| `deploy/.env.example` | 本地开发模板 |
| `deploy/.env.staging.example` | staging 模板 |
| `deploy/.env.prod.example` | prod 模板 |
| `deploy/web/Dockerfile` | Node 构建 + nginx 非特权镜像 |
| `deploy/bff/Dockerfile` | Alpine Maven 构建 + JRE 21 运行 |
| `deploy/nginx/nginx.conf` | 静态资源、`/api` 反代、`/healthz` |
| `deploy/nginx/nginx.tls.conf` | staging / prod 的 HTTPS 站点（8080 仅健康检查，8443 承载业务） |
| `deploy/migrate/` | `00_role.sql`、`10_platform.sql`、`99_grants.sql`、`run.sh`（advisory lock + `ON_ERROR_STOP`） |
| `deploy/release.sh` | 按环境发布：pull → migrate → up |
| `deploy/smoke.sh` | 出码 CRUD 冒烟（CRUD + 租户隔离） |
| `deploy/smoke-platform.sh` | 控制平面冒烟（草稿 / 发布 / 去重 / diff / 回滚 / 恢复草稿 / 乐观锁 / 租户隔离） |

## 4. 本地一键启动

要求：Docker Desktop（含 Compose v2）。Windows 用 PowerShell：

```powershell
Copy-Item deploy/.env.example deploy/.env
# 修改 deploy/.env 中的三个密码

docker compose --env-file deploy/.env -f deploy/compose.yaml up -d postgres redis
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile tools run --rm migrate
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

打开 <http://localhost:8080> 进入控制平面工作台；出码示例应用在 <http://localhost:8080/demo/>（人员 / 请假单 / 附件）。

Linux/macOS 上冒烟：

```bash
BASE_URL=http://localhost:8080 sh deploy/smoke.sh
```

脚本覆盖：`/healthz`、缺失租户头 400、创建、更新、跨租户不可见、删除 204。

## 5. staging / prod 部署

### 5.1 服务器首次准备

```bash
sudo mkdir -p /srv/metaforge
sudo chown "$USER" /srv/metaforge
git clone git@github.com:guiwen-cpu/metaforge.git /srv/metaforge
cd /srv/metaforge

cp deploy/.env.staging.example deploy/.env.staging
cp deploy/.env.prod.example  deploy/.env.prod
chmod 600 deploy/.env.staging deploy/.env.prod
vi deploy/.env.staging deploy/.env.prod   # 改密码与 TAG

# 私有仓库：先在目标机登录阿里云 ACR（也可以把凭据写进上面的 env 文件）
# 个人版示例：crpi-xxxx.cn-guangzhou.personal.cr.aliyuncs.com
docker login crpi-xxxx.cn-guangzhou.personal.cr.aliyuncs.com   # 换成实际 ACR_REGISTRY

# TLS 证书（staging / prod 必需；文件名需与 deploy/nginx/nginx.tls.conf 一致）
sudo mkdir -p /srv/metaforge/certs
sudo cp /path/to/www.devshare.bond.pem /srv/metaforge/certs/
sudo cp /path/to/www.devshare.bond.key /srv/metaforge/certs/
# nginx-unprivileged 以 uid 101 运行：私钥只给该组读，避免 chmod 644
sudo chgrp 101 /srv/metaforge/certs/*.key
sudo chmod 640 /srv/metaforge/certs/*.key
```

同一台机器跑两套时，确认 `WEB_PORT` 不冲突（staging 8081 / prod 8080）。
分机器部署则都可用 8080。

### 5.2 手动发布

```bash
cd /srv/metaforge

sh deploy/release.sh staging            # TAG 取 .env.staging，默认 staging
sh deploy/release.sh staging sha-1a2b3c4   # 指定不可变版本
sh deploy/release.sh prod sha-1a2b3c4   # 生产推荐使用不可变 sha 标签
```

`release.sh` 做的事：`pull` → 证书可读性检查 → `--profile tools run --rm migrate` → `up -d` → 打印状态。
TAG 优先级：命令行参数 > 环境变量 `TAG` > `.env.<env>`。
生产发布同样使用不可变 sha 标签；CI 会显式传入 TAG，手动发布时请避免 `latest`。
镜像地址优先级：环境变量 `ACR_REGISTRY` / `ACR_NAMESPACE` > `.env.<env>` > 默认值
`registry.cn-hangzhou.aliyuncs.com/metaforge`。

### 5.3 CI/CD 流程

| 触发 | 工作流 | 产物 | 部署方式 |
|---|---|---|---|
| push `dev` / 手动 | `.github/workflows/staging.yml` | ACR `:staging`、`:sha-<sha>` | 自动部署预发 |
| push `main` | `.github/workflows/release.yml` | ACR `:prod`、`:sha-<sha>` | 自动部署生产 |
| PR | `.github/workflows/ci.yml` | 校验 + 构建 + compose config | — |

推荐流程：`dev` 推送自动上 staging → 验收后合并 `main` 自动上 prod。
`ci.yml` 的 `push` 触发已关闭，因此推送 `dev` / `main` 只会启动对应的部署工作流，
不会同时再跑一遍 CI；PR 仍由 `ci.yml` 把关。

需要配置的 GitHub 密钥：

| 名称 | 类型 | 用途 |
|---|---|---|
| `STAGING_HOST` / `STAGING_USER` / `STAGING_SSH_KEY` | secret | staging 服务器 SSH |
| `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY` | secret | prod 服务器 SSH |
| `ACR_USERNAME` / `ACR_PASSWORD` | secret | 推送镜像到阿里云 ACR（建议用仅有制品仓库权限的 RAM 用户） |
| `ACR_REGISTRY` / `ACR_NAMESPACE` | variable | 可选；默认 `registry.cn-hangzhou.aliyuncs.com` / `metaforge` |
| `staging` / `production` environment | Environment | 可配置审批人与环境保护规则 |

部署脚本会在服务器上按 `github.sha` 执行 `git fetch origin <sha>` 与 `git checkout --force <sha>`（若 `/srv/metaforge` 是 git 仓库），
因此目标机不会因为分支又前进了而部署到错误版本。若服务器不是 git 仓库，请自行同步 `deploy/` 目录。目标机必须能登录 ACR：
提前执行 `docker login`，或在 `.env.<env>` 中填写 `ACR_USERNAME` / `ACR_PASSWORD`。
首次使用前需在 ACR 控制台创建命名空间（默认 `metaforge`），并按需预建 `web` / `bff` 仓库。
目标机还需在 `/srv/metaforge/certs/` 放好证书；`release.sh` 会先用发布镜像验证
nginx（uid 101）能否读取证书，失败时在 `pull` 之后立即退出，不会把坏配置带上线。

### 5.4 回滚

```bash
cd /srv/metaforge
sh deploy/release.sh prod sha-1a2b3c4   # 回到旧的不可变镜像
# 自建/企业版 ACR 地址不同时：
ACR_REGISTRY=metaforge-registry.cn-hangzhou.cr.aliyuncs.com sh deploy/release.sh prod sha-1a2b3c4
```

数据库变更遵循 expand-contract（先加列、后删列），保证旧镜像仍可运行。

## 6. 环境变量

`deploy/.env`、`deploy/.env.staging`、`deploy/.env.prod` 均被 `.gitignore` 排除。
模板文件（`*.example`）可以提交。

| 变量 | 必填 | 说明 |
|---|---|---|
| `POSTGRES_PASSWORD` | 是 | `metaforge_owner` 密码，仅迁移/运维使用 |
| `META_FORGE_APP_PASSWORD` | 是 | `metaforge_app` 密码，BFF 使用 |
| `REDIS_PASSWORD` | 是 | Redis `requirepass` |
| `WEB_PORT` | 否 | 宿主机端口，local/staging/prod 模板分别为 8080/8081/8080；staging/prod 映射到容器 8443（HTTPS） |
| `WEB_CONTAINER_PORT` | 否 | 容器内 `web` 端口；staging/prod 为 8443（HTTPS），local 默认 8080；`release.sh` 会强制导出 8443 |
| `ACR_REGISTRY` | 否 | 镜像库地址，默认 `registry.cn-hangzhou.aliyuncs.com` |
| `ACR_NAMESPACE` | 否 | ACR 命名空间，默认 `metaforge` |
| `ACR_USERNAME` / `ACR_PASSWORD` | 否 | 目标机拉取私有镜像的凭据；留空则假定已 `docker login` |
| `TAG` | 生产必填 | 镜像标签；CI 传 `sha-<commit>`，staging 模板默认 `staging`，prod 模板为 `sha-placeholder`，手动发布需替换 |

生产建议把密码放进云密钥管理，由发布流水线写入 `/srv/metaforge/deploy/.env.prod`（权限 `600`）。

## 7. 数据迁移与租户隔离

迁移顺序由 `run.sh` 固定：

1. `deploy/migrate/00_role.sql`：创建/更新 `metaforge_app`（`NOSUPERUSER NOBYPASSRLS`）
2. `deploy/migrate/10_platform.sql`：控制平面表（应用 / 版本）+ RLS + append-only 触发器
3. `codegen/<app>/sql/*.sql`：`00_extensions` → `10_*` → `90_rls`
4. `deploy/migrate/99_grants.sql`：DML 权限与默认权限

要点：

- 整个脚本用 `pg_advisory_lock` 串行化，`psql -v ON_ERROR_STOP=1`，**不包事务**
  （生成的 DDL 含 `create index concurrently`）。
- 可重复执行；角色与授权使用 `DO $$ ... $$` 幂等写法。
- BFF 以 `metaforge_app` 连接，该角色不是 owner、不能 `BYPASSRLS`。
- 每个请求由 `TenantTransactionAspect` 在事务内执行
  `select set_config('lcp.tenant_id', ?, true)`；RLS 策略读 `current_setting('lcp.tenant_id', true)`。
  未设置会话变量时策略恒不成立，查询返回 0 行。

实测（3 条断言）：

```sql
-- 以 metaforge_app 连接，未设置 lcp.tenant_id
select count(*) from edu_employee;            -- 0
begin; select set_config('lcp.tenant_id','tenant_demo_school',true);
select count(*) from edu_employee; commit;    -- > 0
begin; select set_config('lcp.tenant_id','tenant_other',true);
select count(*) from edu_employee; commit;    -- 0
```

## 8. 请求契约

- 租户：`X-Tenant-Id`；操作人：`X-User-Id`。缺失租户返回 `400 tenant_required`。
- **当前 BFF 信任网关注入的请求头，没有 JWT 校验**。生产必须在 SLB/WAF 或 BFF 前置鉴权，
  并由网关注入这两个头，禁止客户端直连 BFF。
- JSON 命名：BFF 配置 `spring.jackson.property-naming-strategy: SNAKE_CASE`，
  请求/响应字段统一蛇形（`employee_no`、`dept_id`、`hire_date`）。
- 未在 DTO 中声明的字段会被忽略；`PUT` 用完整必填字段替换（`name`、`dept_id` 必填）。

## 9. 上线检查清单

- [ ] staging 与 prod 使用不同的数据库、Redis、`.env` 与 SSH 密钥
- [ ] 只暴露 443（或 `WEB_PORT` 映射的 HTTPS 端口），22 端口限制来源 IP
- [ ] 证书覆盖 `server_name`（`meta.devshare.bond` / `www.devshare.bond`），且私钥对 nginx 的 uid 101 可读
- [ ] 数据库/Redis 无公网地址；生产优先用 RDS / 托管 Redis
- [ ] `.env*` 权限 600，secret 不进 Git、不进镜像层
- [ ] 目标机已登录 ACR，RAM 用户只有制品仓库读写权限
- [ ] 网关鉴权 + 注入 `X-Tenant-Id` / `X-User-Id`，BFF 不直接暴露
- [ ] TLS 证书、HSTS、`X-Content-Type-Options`、`Referrer-Policy`
- [ ] `pg_dump -Fc` 每日备份到 OSS，保留 30 天并做恢复演练
- [ ] Actuator 健康检查、5xx 与连接数告警接入
- [ ] 镜像定期重建打补丁，线上禁止 `latest`
- [ ] OSS 私有桶 + STS 最小权限 + 上传类型/大小限制

## 10. 已知缺口（P1）

- 认证：无 JWT/SSO，`X-User-Id` 仅是占位；权限快照尚未在服务端强制执行。
- Flowable 未接入 BFF；审批流页面与运行时尚未落地。
- OSS STS 接口未实现，上传字段当前不可用。
- 控制平面已完成应用 / 草稿 / 发布 / 内容去重 / diff / 回滚 / 恢复草稿；页面设计器、数据模型设计器、逻辑编排的 UI 尚未开始。
- 控制平面工作台的租户 / 操作人写入 `localStorage`，不能用于生产鉴权；接入网关或 SSO 后应移除。
- 示例库为空表；如需演示数据，另加 `deploy/seed/`（不要混入生产迁移）。
