# MetaForge Docker 部署规划

> 适用阶段：协议库 + 出码示例已具备，Spring Boot BFF 尚未落地。
> 本文是上线目标形态与实施顺序；标注「待补」的部分需要先写代码，再按本文部署。

## 1. 结论先行

| 决策 | v1 选择 | 理由 |
|---|---|---|
| 部署形态 | 单台 ECS + Docker Compose | 团队小、流量低，先把业务闭环跑通 |
| 数据层 | 阿里云 RDS PostgreSQL + Redis | 备份、补丁、主从切换不自己扛 |
| 对象存储 | 阿里云 OSS + STS 直传 | 文件字节不经过应用服务器 |
| 应用进程 | nginx（静态资源）+ bff（Spring Boot，内嵌 Flowable） | 业务与流程同事务，少一个引擎服务 |
| 多副本 | v2：2 台 ECS + SLB | JWT 无状态，天然可水平扩展 |
| Kubernetes | 暂不上 | Compose 足够；模块和团队规模上来再迁 |

私有化或预算敏感的场景，可以用本文的 `postgres` / `redis` 容器替代托管服务，其余不变。

## 2. 目标拓扑

生产（推荐）：

```text
用户
  │ 443
  ▼
SLB / WAF
  │
  ▼
ECS · Docker Compose
  ├─ nginx + web 静态资源
  │    /      → dist（history fallback）
  │    /api   → bff:8080
  └─ bff（Spring Boot / Flowable / Actuator）
       ├─ RDS PostgreSQL（元数据 + 业务数据，JSONB）
       ├─ Redis（会话、缓存、分布式锁）
       └─ OSS（STS 临时凭证，客户端直传）
```

测试 / 私有化（全容器）：

```text
nginx+web → bff → postgres + redis（同一 compose，数据网络不对外）
```

## 3. 容器清单

| 服务 | 基础镜像 | 端口 | 对外 | 持久化 | 健康检查 |
|---|---|---|---|---|---|
| `web` | `node:22-alpine` → `nginx:1.27-alpine` | 80/443 | 是 | nginx cache | `GET /healthz` |
| `bff` | `maven:3.9-eclipse-temurin-21` → `eclipse-temurin:21-jre` | 8080 | 否 | 仅日志 | `/actuator/health/readiness` |
| `postgres` | `postgres:16-alpine` | 5432 | 否 | `pg_data` | `pg_isready` |
| `redis` | `redis:7-alpine` | 6379 | 否 | `redis_data` | `redis-cli ping` |
| `migrate` | `postgres:16-alpine` | - | 否 | - | 一次性任务 |

约定：

- 只有 `web` 发布宿主机端口；`bff`、`postgres`、`redis` 只在内部网络。
- `bff` 不写本地磁盘；上传文件只进 OSS，附件表只存 objectKey。
- 所有容器 `restart: unless-stopped`、日志轮转、非 root 运行。
- 镜像标签用不可变版本：`v1.4.0`、`sha-<7位>`，禁止线上使用 `latest`。

## 4. 镜像构建

### 4.1 web（Vite 静态资源 + nginx）

```dockerfile
# deploy/web/Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY codegen/leave_approval/web/package*.json ./
RUN npm ci
COPY codegen/leave_approval/web/ ./
ARG VITE_API_BASE=""
ARG VITE_STS_URL="/api/v1/platform/oss/sts"
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN adduser -D -H -u 10001 web && chown -R web:web /usr/share/nginx/html /var/cache/nginx
USER web
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/healthz || exit 1
```

注意：`VITE_*` 是**构建期**变量。多环境要么按环境分别构建，要么改成容器启动时生成
`/config.js` 的运行时配置；后者可以一份镜像跑 staging/prod，推荐尽早做。

### 4.2 bff（待补 Spring Boot 应用后启用）

```dockerfile
# deploy/bff/Dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml ./
COPY bff/pom.xml bff/pom.xml
RUN mvn -q -pl bff -am dependency:go-offline
COPY . .
RUN mvn -q -pl bff -am -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd -r -u 10002 app
WORKDIR /app
COPY --from=build /src/bff/target/*.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=Asia/Shanghai"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

## 5. Compose 关键约束

```yaml
# deploy/compose.yaml（示意，BFF 落地后补全）
services:
  web:
    image: ghcr.io/guiwen-cpu/metaforge-web:${TAG:?}
    ports: ["80:80", "443:443"]
    depends_on: { bff: { condition: service_healthy } }
    networks: [edge]
    read_only: true
    tmpfs: [/var/cache/nginx, /var/run]
    logging: { driver: json-file, options: { max-size: "20m", max-file: "5" } }

  bff:
    image: ghcr.io/guiwen-cpu/metaforge-bff:${TAG:?}
    env_file: [.env]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    networks: [edge, data]
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/actuator/health/readiness"]
      interval: 15s
      timeout: 3s
      retries: 10
      start_period: 60s

  migrate:
    image: postgres:16-alpine
    profiles: [tools]
    env_file: [.env]
    volumes: ["./migrations:/migrations:ro"]
    networks: [data]

networks:
  edge: {}
  data: { internal: true }

volumes:
  pg_data: {}
  redis_data: {}
```

要点：

- `data` 网络 `internal: true`，数据库和 Redis 不可能被公网直连。
- `bff` 等 `postgres`/`redis` 健康后再启动，避免启动风暴。
- `read_only` + `tmpfs`，容器被入侵后不可写文件系统。
- 资源限制建议：`bff` 2G、`web` 256M、`postgres` 2G、`redis` 512M（按 4C8G 单机起步）。
- 密钥不要放 `.env` 提交到仓库；用 Docker secrets 挂 `/run/secrets/`，Spring 侧
  用 `spring.config.import=optional:configtree:/run/secrets/` 读取。

## 6. 配置项

| 变量 | 说明 |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<rds>:5432/metaforge?sslmode=require` |
| `SPRING_DATASOURCE_USERNAME` / `PASSWORD` | 应用角色 `metaforge_app` |
| `SPRING_DATA_REDIS_HOST` / `PASSWORD` | 托管 Redis 内网地址 |
| `LCP_OSS_STS_ROLE_ARN` | STS AssumeRole 的 RAM 角色 |
| `LCP_OSS_BUCKET` / `LCP_OSS_REGION` | OSS 桶与地域 |
| `LCP_AUTH_JWT_SECRET` | 至少 32 字节，走 secret |
| `LCP_TENANT_HEADER` | 默认 `X-Tenant-Id`，只信任网关/鉴权后的值 |
| `MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE` | `health,info,prometheus` |
| `TZ` | `Asia/Shanghai`（数据库建议存 UTC / `timestamptz`） |

安全边界：`X-Tenant-Id` 只能由网关在 JWT 校验后注入；不能直接信任浏览器传来的租户头，
否则等于绕过租户隔离。

## 7. 数据库与迁移（最容易踩坑）

### 7.1 双角色

```sql
-- 迁移账号：建表、建索引、改策略
create role metaforge_owner login password :'owner_pw';
-- 运行账号：只有 DML，RLS 才会对它生效
create role metaforge_app   login password :'app_pw';

grant usage on schema public to metaforge_app;
grant select, insert, update, delete on all tables in schema public to metaforge_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to metaforge_app;
```

`bff` 永远用 `metaforge_app` 连接；`migrate` 用 `metaforge_owner`。这样 `90_rls.sql`
的租户兜底才真正生效。若应用角色就是表 owner，RLS 默认**不生效**（需要 `force row level security`）。

### 7.2 RLS 与租户上下文

生成的 `90_rls.sql` 依赖会话变量 `lcp.tenant_id`。当前出码运行时是按 `tenant_id = :_tenant`
显式过滤，**没有**设置该会话变量。因此：

- 只启用 `90_rls.sql`、又用非 owner 角色连接 → 所有查询返回 0 行；
- 正确做法：BFF 在每个事务开始时执行 `set local lcp.tenant_id = :tenant`（`SET LOCAL`
  随事务结束自动清理），再配合非 owner 角色；
- 在会话变量注入实现之前，生产可只使用 owner 角色并**不启用** RLS（租户过滤仍由 SQL 承担），
  但这是降级方案，要列入 P1 补掉。

连接池用 HikariCP 时，务必在事务内设置；PgBouncer 用 transaction 模式，`SET LOCAL` 仍可用，
但不要用会话级 `SET`。

### 7.3 迁移执行器

生成的 SQL 里有 `create index concurrently`，**不能在事务块内执行**。Flyway 默认给 SQL
迁移开事务，直接用会失败。推荐：

```sh
# deploy/migrations/run.sh（migrate 容器入口）
{ echo "select pg_advisory_lock(918273645);";
  cat /migrations/*.sql;
  echo "select pg_advisory_unlock(918273645);"; } > /tmp/migrate.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/migrate.sql
```

- 按文件名排序执行：`00_extensions.sql` → `10_*.sql` → `90_rls.sql`。
- 不要包 `BEGIN/COMMIT`；psql 默认逐条自动提交。
- 用 advisory lock 防止两个发布任务并发迁移。
- 元数据版本表（`lcp_schema_version` 等）后续由平台自身管理，迁移脚本只负责物理结构。

### 7.4 发布顺序

1. 备份（`pg_dump -Fc` 或 RDS 快照）；
2. 跑 `migrate`；
3. 滚动替换 `bff`；
4. 健康检查通过后再切流量；
5. 出问题回滚镜像标签，数据结构按 expand-contract 兼容（先加列、后删列）。

## 8. CI/CD

GitHub Actions，触发 `v*` tag：

```text
validate ──┬─ build-web ──┐
           └─ build-bff ──┴─ docker buildx push (GHCR) ── trivy scan ── deploy
```

- 镜像：`ghcr.io/guiwen-cpu/metaforge-web:<tag>`、`metaforge-bff:<tag>`，同时打 `sha-*`。
- 构建缓存：`type=gha`；平台 `linux/amd64`，需要 ARM 再加 `linux/arm64`。
- 部署：GitHub Environments（prod 需人工批准）→ SSH 到 ECS →
  `docker compose pull && docker compose run --rm migrate && docker compose up -d`。
- 回滚：保留上一版 `TAG`，`TAG=<prev> docker compose up -d`；数据库迁移保持向后兼容。
- 本地验证：`docker compose config` 必须进 CI，防止 YAML/变量错误上生产。

## 9. 上线检查清单

- [ ] 域名 A 记录指向 SLB/ECS，证书自动续期（certbot 或云证书）
- [ ] 只暴露 80/443；22 端口限制办公网 IP
- [ ] 数据库/Redis 无公网地址，安全组只放行 ECS
- [ ] `.env` 权限 600，secret 不进 Git、不进镜像层
- [ ] `bff` 用非 owner 数据库角色；RLS 策略与 `SET LOCAL` 已验证
- [ ] 迁移脚本在 staging 全量跑过，并做过回滚演练
- [ ] `pg_dump` 每日备份到 OSS，保留 30 天，季度恢复演练
- [ ] 健康检查、5xx 告警、磁盘/连接数告警接入
- [ ] nginx：`client_max_body_size`、gzip/brotli、静态资源 immutable 缓存、`index.html` no-cache
- [ ] 安全头：HSTS、`X-Content-Type-Options`、`Referrer-Policy`、合理 CSP
- [ ] OSS：私有桶、STS 最小权限、上传类型/大小限制、生命周期规则
- [ ] 日志 JSON 化并集中收集，禁止打印身份证等敏感字段
- [ ] 压测一遍列表分页与导出接口，确认连接池与慢查询

## 10. 运维基线

- 备份：RDS 自动备份 + 每日逻辑备份到 OSS；恢复演练比备份本身更重要。
- 监控：Actuator + Prometheus + Grafana；前端接 Sentry；日志走 Loki/SLS。
- 容量：起步 4C8G ECS、RDS 2C4G、Redis 1G；先观察 P95 与连接数再扩。
- 安全：容器非 root、`no-new-privileges`、只读根文件系统；镜像每周重建打补丁。
- 上传：STS 直传后异步做病毒扫描；附件下载走 7 天签名 URL，不暴露 bucket。

## 11. 分阶段实施

### P0 · 可部署骨架（BFF 落地时一起做）

1. 新建 `bff/` Spring Boot 模块：`@SpringBootApplication`、DataSource、Redis、
   Actuator、统一异常、`LcpPrincipal` 解析、租户过滤器。
2. 接入生成的 `codegen/<app>/api` 源码与 `sql/`，跑通本地 `mvn test`。
3. 写 `deploy/web/Dockerfile`、`deploy/bff/Dockerfile`、`deploy/nginx/nginx.conf`、
   `deploy/compose.yaml`、`deploy/.env.example`。
4. `migrate` 容器与迁移脚本；staging 跑通一次全量建库。
5. GitHub Actions 构建并推送 GHCR。

### P1 · 上线必备

TLS、域名、备份、监控告警、密钥管理、RLS 会话变量、STS 真实联调、压测。

### P2 · 规模化

2 台 ECS + SLB、RDS 高可用版、Redis 集群版、蓝绿/滚动发布；
只有出现多团队、多环境、强隔离需求时再评估 K8s。

## 12. 当前缺口（阻塞上线的部分）

- 没有可启动的 Spring Boot BFF：目前只有生成的 Controller / Runtime 源码和 Maven 协议库。
- 没有认证与租户上下文实现：`LcpPrincipal` 只有接口，没有从 JWT/SSO 填充的 Bean。
- 没有迁移执行器：`sql/` 尚未接入任何发布流程。
- 没有平台主应用：现在的前端是 `leave_approval` 示例，不是设计器/工作台。
- 生成前端使用 demo 会话与 localStorage token，不能直接用于生产鉴权。
- Flowable、Redis 尚未接入运行时。