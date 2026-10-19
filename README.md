# MetaForge

通用型低代码开发平台。面向学校教务信息化系统与公司办公系统的**元数据驱动**低代码平台：
可视化搭建 + 少量代码扩展，快速交付管理系统。

## 当前进度

| 模块 | 状态 |
|---|---|
| 统一 Schema 协议（6 份 JSON Schema + 2 份注册表） | 完成 |
| L1~L4 校验流水线 `tools/validate.mjs` | 完成 |
| TS / Java 双端类型绑定 | 已生成；Java 协议库尚未编译验证 |
| 出码 · 第一步：DataSchema → PG DDL + TS / Java 实体 | 完成 |
| 出码 · 第二步：DataSchema → BFF CRUD + TS 客户端 + 权限清单 | 完成 |
| 出码 · 第三步：DataSchema → Vue3 CRUD 页面 + OSS 直传 | 完成，前端已通过 typecheck / build |
| Spring Boot BFF（租户上下文 + RLS 会话变量） | 完成，CRUD 与租户隔离已实测 |
| 平台控制平面：应用 / 草稿 / 发布 / 内容去重 / diff / 回滚 / 恢复草稿（见 `PLATFORM.md`） | 完成，16 步冒烟通过 |
| Docker Compose 部署骨架（web + bff + PG + Redis） | 完成，本地全栈已跑通 |
| 可视化页面设计器、数据模型设计器 | 规划中（元数据与版本底座已就绪） |
| 逻辑编排引擎、审批流页面、多端发布 | 规划中 |
| AI 辅助生成、模板市场 / 应用市场 | 规划中 |

## 目录

- `schema/` —— 6 份 JSON Schema（159 个 `$defs`）+ 表达式注册表
- `registry/` —— FieldType 四向映射（19 个类型）、38 个内置组件契约
- `ts/` —— TypeScript 协议绑定（204 个导出类型）
- `java/` —— Java 协议绑定（Maven 工程，含随包发布的 Schema 资源副本）
- `bff/` —— Spring Boot BFF：租户过滤器、RLS 事务切面、Actuator、统一错误
- `deploy/` —— Docker Compose、镜像、迁移、冒烟与发布脚本（见 `deploy/README.md`）
- `tools/` —— 校验器与出码引擎：`validate.mjs`、`gen-ts.mjs`、`gen-java.mjs`、`gen-entity.mjs`、`gen-api.mjs`、`gen-page.mjs`
  - `tools/dev/` —— 本地联调：`mock-bff.mjs`（内存 CRUD）与 `dev.mjs`（同时拉起 Mock 与示例前端）
  - `tools/archive/` —— 早期 bootstrap 与一次性修补脚本（仅追溯，不作为日常入口）
- `examples/` —— 请假审批参考 Bundle（含 BPMN 20 XML）；`probes/` 为校验探针
- `codegen/<appKey>/` —— 出码产物：`sql/`、`ts/`、`java/`、`api/`、`web/`（生成物，不要手改）
- `PROTOCOL.md` —— 协议总览：分层模型、表达式 DSL、快照与回滚、组件契约、沙箱、扩展指南
- `PLATFORM.md` —— 控制平面：应用 / 草稿 / 发布 / 回滚 API 与版本语义
- `项目提示词.txt` —— 产品定位、技术栈与模块清单

## 技术栈

- 前端：Vue3 + Vite + TypeScript、Element Plus、Pinia、TailwindCSS，阿里云 OSS 直传（STS 临时凭证）
- 后端：Java + Spring Boot、Flowable（BPMN 工作流）、BFF 聚合层
- 数据：PostgreSQL（元数据 + 业务数据，善用 JSONB）、Redis（缓存 / 会话 / 分布式锁）

## 架构原则

- 元数据驱动：控制平面 + 数据平面 + 运行时引擎共享同一份 Schema
- 前后端通过统一 Schema 协议通信；所有业务表带租户标识
- 元数据变更版本化、可回滚；Schema 全量预留 `Semantic` 语义字段，为 AI 接入做准备

## 快速开始

要求 Node >= 18。校验器与生成器零第三方依赖，在仓库根目录执行：

```bash
npm run validate            # 等价于 node tools/validate.mjs
node tools/gen-ts.mjs       # 重新生成 ts/
node tools/gen-java.mjs     # 重新生成 java/

# 出码引擎（以请假审批 Bundle 为例）
node tools/gen-entity.mjs examples/leave-approval.bundle.json
node tools/gen-api.mjs    examples/leave-approval.bundle.json
node tools/gen-page.mjs   examples/leave-approval.bundle.json
```

## Docker 运行（推荐）

需要 Docker Desktop / Docker Engine + Compose v2。首次启动：

```powershell
Copy-Item deploy/.env.example deploy/.env   # 修改 POSTGRES_PASSWORD / META_FORGE_APP_PASSWORD / REDIS_PASSWORD
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d postgres redis
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile tools run --rm migrate
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

打开 http://localhost:8080 进入控制平面工作台；出码示例应用在 http://localhost:8080/demo/ 。
RLS 在事务内生效。端到端校验：

```bash
BASE_URL=http://localhost:8080 sh deploy/smoke.sh
```

环境划分：

| 环境 | 模板 | Compose 覆盖层 | 项目名 |
|---|---|---|---|
| local | `.env`（由 `.env.example` 复制） | — | `metaforge` |
| staging | `.env.staging` | `compose.staging.yaml` | `metaforge-staging` |
| prod | `.env.prod` | `compose.prod.yaml` | `metaforge-prod` |

staging 由 `main` 推送触发，prod 由 `v*` tag 触发；发布、回滚与检查清单见 `deploy/README.md`。

## 本地运行示例前端（Mock BFF）

控制平面工作台位于 `platform/`；`codegen/leave_approval/web` 是出码引擎生成的示例前端。
不依赖 Docker 时，可以用 Mock BFF 把示例跑成可点击的 CRUD 页面：

```bash
# 首次：安装示例前端依赖
npm install --prefix codegen/leave_approval/web

# 启动 Mock BFF（:8080）+ 示例前端（:5174）
npm run dev
```

打开 http://localhost:5174 ，可以看到「人员 / 请假单 / 附件」三张表，支持分页、搜索、排序、
新增、编辑、删除，以及乐观锁版本冲突提示。

- `npm run dev:studio`：只启动控制平面工作台（:5175），`/api` 代理到真实 BFF。
- `npm run dev:web`：只启动前端，默认把 `/api` 代理到 `http://localhost:8080`。
- 上传字段会调用 `/api/v1/platform/oss/sts`；Mock 返回 501，需接真实 BFF 的阿里云 STS 才能验证。
- Mock 只用于本地联调，不实现租户、权限、Flowable 与事务语义，不是生产后端。

## Java 侧

仓库有两个 Maven 工程：

 - `java/`：Schema 协议绑定（Jackson DTO + 资源文件），作为库发布。
 - `bff/`：可启动的 Spring Boot BFF，编译时并入 `codegen/<app>/api`，提供租户过滤器、
   RLS 事务切面、Actuator 与统一异常。

```bash
mvn -q -f java/pom.xml compile
mvn -q -f bff/pom.xml -DskipTests package
```

完整启动走 Docker（见上）；没有本地 JDK/Maven 时可直接用 `deploy/bff/Dockerfile` 构建。

## 已知边界

- 页面设计器、数据模型设计器、逻辑编排 UI、Flowable 运行时、OSS STS、JWT/SSO 尚未实现。
 - `bff/` 已在 Docker 构建中编译通过；本机直接 `mvn` 需要 JDK 21 + Maven。
 - 生成前端使用演示会话（默认租户取 Bundle 的 `tenantId`），不能用于生产鉴权。
 - 校验器残留 warn：内联枚举与共享枚举取值不一致；流程监听器未限定 `taskKey`。

协议细节见 `PROTOCOL.md`。
