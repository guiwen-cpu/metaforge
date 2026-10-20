# 请假审批 · 独立出码工程

本目录由 `tools/gen-project.mjs` 组装，包含前端、Spring Boot CRUD 服务、
PostgreSQL 迁移脚本与 Docker Compose。业务 Schema 变更后按顺序重跑：

```powershell
node tools/gen-entity.mjs examples/leave-approval.bundle.json
node tools/gen-api.mjs examples/leave-approval.bundle.json
node tools/gen-page.mjs examples/leave-approval.bundle.json
node tools/gen-project.mjs examples/leave-approval.bundle.json
```

## 一键启动

```powershell
docker compose up -d --build
```

- Web：http://localhost:8091
- API：http://localhost:8090
- 健康检查：http://localhost:8090/actuator/health
- PostgreSQL：localhost:5433

## 演示账号

租户固定为 `tenant_demo_school`，密码默认 `demo123`（`LCP_DEMO_PASSWORD` 可覆盖）。
账号：admin（全部角色）、student（学生）、teacher（教职工）、dept_manager（部门负责人）、school_admin（院级管理员）、hr_admin（人事专员）、system（系统）。

账号由 Bundle 角色生成，只用于独立工程联调；接入正式身份中心后替换
`AuthController` 与令牌校验即可，生成 CRUD 无需改动。

## 数据与迁移

- 首次启动由 PostgreSQL 执行 `sql/` 下的脚本：扩展、逐表 DDL、RLS。
- `sql/95_force_rls.sql` 强制表 owner 也受 RLS 约束；服务端每个请求事务内设置 `lcp.tenant_id`。
- 表：`edu_employee`、`edu_leave_request`、`edu_attachment`。
- 迁移脚本使用 `create index concurrently`，必须像 `docker-entrypoint-initdb.d` 一样逐文件、非事务执行。

## 本地开发

```powershell
# 只起数据库
docker compose up -d db

# 启动后端
cd server
mvn spring-boot:run

# 启动前端（Vite 代理到 8080）
cd ../web
npm run dev
```

## 安全边界

- 演示令牌是 HMAC 签名的无状态令牌，密钥来自 `LCP_DEMO_TOKEN_SECRET`，生产必须替换。
- `LCP_DEMO_DEV_HEADERS=true` 允许 `X-Tenant-Id` / `X-User-Id` 兜底；生产必须关闭。
- CRUD 表名、列名与排序白名单来自生成期常量，请求参数不参与 SQL 标识符拼接。
