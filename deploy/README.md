# MetaForge Docker 部署

> 状态：P0 可部署骨架已落地并实测通过（单机 Docker Compose：nginx + BFF + PostgreSQL + Redis）。
> 平台主应用、Flowable 运行时、OSS STS、JWT/SSO 仍属 P1，见文末「已知缺口」。

## 1. 组成

```text
浏览器
  │ :${WEB_PORT}
  ▼
web（nginx-unprivileged）
  ├─ /      → Vite 构建产物（history fallback）
  └─ /api/  → bff:8080
                ├─ PostgreSQL 16（元数据 + 业务数据）
                └─ Redis 7（缓存 / 会话 / 分布式锁）
```

- `web` 是唯一发布宿主机端口的服务；`bff`、`postgres`、`redis` 只在 `data` 内网。
- 所有容器非 root、只读根文件系统（`web`/`bff`）、`no-new-privileges`、健康检查、日志可轮转。
- BFF 是普通 Spring Boot 进程，生成的 `codegen/<app>/api` 源码通过 `build-helper` 一起编译。

## 2. 目录

| 路径 | 用途 |
|---|---|
| `deploy/compose.yaml` | 本地/单机全栈编排 |
| `deploy/compose.prod.yaml` | 生产覆盖层：镜像改为 GHCR |
| `deploy/web/Dockerfile` | Node 构建 + nginx 非特权镜像 |
| `deploy/bff/Dockerfile` | Alpine Maven 构建 + JRE 21 运行 |
| `deploy/nginx/nginx.conf` | 静态资源、`/api` 反代、`/healthz` |
| `deploy/migrate/` | `00_role.sql`、`99_grants.sql`、`run.sh`（advisory lock + `ON_ERROR_STOP`） |
| `deploy/release.sh` | pull → migrate → up |
| `deploy/smoke.sh` | 端到端冒烟（CRUD + 租户隔离） |
| `deploy/.env.example` | 环境变量模板 |

## 3. 本地一键启动

要求：Docker Desktop（含 Compose v2）。Windows 用 PowerShell：

```powershell
Copy-Item deploy/.env.example deploy/.env
# 修改 deploy/.env 中的三个密码

docker compose --env-file deploy/.env -f deploy/compose.yaml up -d postgres redis
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile tools run --rm migrate
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

打开 <http://localhost:8080>。示例应用是 `leave_approval`（人员 / 请假单 / 附件）。

验证：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs -f bff
```

Linux/macOS 上冒烟脚本：

```bash
BASE_URL=http://localhost:8080 sh deploy/smoke.sh
```

脚本覆盖：`/healthz`、缺失租户头 400、创建、更新、跨租户不可见、删除 204。

## 4. 环境变量

`deploy/.env` 已被 `.gitignore` 排除，不要提交。

| 变量 | 必填 | 说明 |
|---|---|---|
| `POSTGRES_PASSWORD` | 是 | `metaforge_owner` 密码，仅迁移/运维使用 |
| `META_FORGE_APP_PASSWORD` | 是 | `metaforge_app` 密码，BFF 使用 |
| `REDIS_PASSWORD` | 是 | Redis `requirepass` |
| `WEB_PORT` | 否 | 宿主机端口，默认 `8080` |
| `TAG` | 生产必填 | 镜像标签，本地默认 `dev` |

生产建议把密码放进云密钥管理，由发布流水线写入 `/opt/metaforge/deploy/.env`（权限 `600`）。

## 5. 数据迁移与租户隔离

迁移顺序由 `run.sh` 固定：

1. `deploy/migrate/00_role.sql`：创建/更新 `metaforge_app`（`NOSUPERUSER NOBYPASSRLS`）
2. `codegen/<app>/sql/*.sql`：`00_extensions` → `10_*` → `90_rls`
3. `deploy/migrate/99_grants.sql`：DML 权限与默认权限

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

## 6. 请求契约

- 租户：`X-Tenant-Id`；操作人：`X-User-Id`。缺失租户返回 `400 tenant_required`。
- **当前 BFF 信任网关注入的请求头，没有 JWT 校验**。生产必须在 SLB/WAF 或 BFF 前置鉴权，
  并由网关注入这两个头，禁止客户端直连 BFF。
- JSON 命名：BFF 配置 `spring.jackson.property-naming-strategy: SNAKE_CASE`，
  请求/响应字段统一蛇形（`employee_no`、`dept_id`、`hire_date`）。
- 未在 DTO 中声明的字段会被忽略；`PUT` 用完整必填字段替换（`name`、`dept_id` 必填）。

## 7. 镜像与发布

本地构建（带源码）：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml build
```

生产：GitHub Actions 在 `v*` tag 上构建并推送 GHCR：

- `ghcr.io/guiwen-cpu/metaforge/web:<tag>` 与 `:sha-<sha>`
- `ghcr.io/guiwen-cpu/metaforge/bff:<tag>` 与 `:sha-<sha>`

服务器首次准备：

```bash
sudo mkdir -p /opt/metaforge
# 放入仓库的 deploy/ 目录（或只放 compose 文件 + nginx 配置）
cd /opt/metaforge
cp deploy/.env.example deploy/.env && vi deploy/.env
```

发布：

```bash
TAG=v1.0.0 sh deploy/release.sh
# 等价于：pull → --profile tools run --rm migrate → up -d
```

回滚：改回上一个 `TAG` 重新 `up -d`。数据库变更遵循 expand-contract（先加列、后删列），
保证旧镜像仍可运行。

CI（`.github/workflows/ci.yml`）覆盖：协议校验、前端构建、BFF 打包、`compose config -q`。

## 8. 上线检查清单

- [ ] 只暴露 80/443（或 `WEB_PORT`），22 端口限制来源 IP
- [ ] 数据库/Redis 无公网地址；生产优先用 RDS / 托管 Redis
- [ ] `deploy/.env` 权限 600，secret 不进 Git、不进镜像层
- [ ] 网关鉴权 + 注入 `X-Tenant-Id` / `X-User-Id`，BFF 不直接暴露
- [ ] TLS 证书、HSTS、`X-Content-Type-Options`、`Referrer-Policy`
- [ ] `pg_dump -Fc` 每日备份到 OSS，保留 30 天并做恢复演练
- [ ] Actuator 健康检查、5xx 与连接数告警接入
- [ ] 镜像定期重建打补丁，线上禁止 `latest`
- [ ] OSS 私有桶 + STS 最小权限 + 上传类型/大小限制

## 9. 已知缺口（P1）

- 认证：无 JWT/SSO，`X-User-Id` 仅是占位；权限快照尚未在服务端强制执行。
- Flowable 未接入 BFF；审批流页面与运行时尚未落地。
- OSS STS 接口未实现，上传字段当前不可用。
- 平台主应用（页面设计器、数据模型设计器、逻辑编排）尚未开始。
- 前端仍是生成示例应用；演示会话写入 `localStorage`，不能用于生产鉴权。
- 示例库为空表；如需演示数据，另加 `deploy/seed/`（不要混入生产迁移）。
