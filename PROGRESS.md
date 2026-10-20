# MetaForge · 进度快照

> 最后更新：2026-10-21
> 分支：`dev` ｜ 最新功能提交：`0b3afaa`（`feat(codegen): 增加导出包与在线版本 diff`）
> 用途：新会话接手时，读完本文件即可恢复上下文。

## 环境快照

| 项 | 值 |
|---|---|
| 设计器地址 | `http://localhost:8080` |
| CDP 调试 | `http://127.0.0.1:9222` |
| 演示应用 | `eb84d4bd-461f-4945-9f76-7d69ce732d8b`（请假审批 / `leave_approval_demo`） |
| 租户 / 用户 | `tenant_demo_school` / `alice` |
| 容器 | `metaforge-web` / `metaforge-bff` / `metaforge-postgres` / `metaforge-redis` |
| 当前草稿 | `r10`：3 个页面、1 个自定义组件 `biz-card`、逻辑编排完整；已恢复可编辑状态 |
| 发布版本 | `v9`：中文内容正常、动作权限 35 条；`v2/v4/v6` 为冒烟临时版本，`v3/v5/v7` 为回滚快照 |
| 演示数据 | 请假实例若干（已通过 / 已驳回 / 待审批）；冒烟实例 `ef3ea1e4-cbbe-11f1-ab05-eac30cd331c5` 含 3 条动作日志；`/leave/requests` 底部挂有 `biz-card` 联调节点；运行时闭环单 `01M5D95H48A2VFJHTFQ5BSZK4Q` 已验证提交与撤回（`cancelled`）；`01M5DP7862K31BADGVQKVGSVNE` / `01M5DP77QA2CJPYN3R66MVNHP9` 用于 `leave_batch_recall` 并行撤回验证（`cancelled`） |
| 审批入口 | `/apps/<appId>/approvals`；详情 `/approvals/:taskId`，实例 `/instances/:instanceId` |
| 动作执行 | `POST /api/v1/runtime/apps/{appId}/actions/{actionKey}/execute` |
| 动作日志 | `GET /api/v1/runtime/apps/{appId}/action-runs`（按 `processInstanceId` / `actionKey` / `status` 过滤）；详情 `GET .../action-runs/{id}` |
| 失败重放 | `POST /api/v1/runtime/apps/{appId}/action-runs/{id}/replay` |
| 站内通知 | 应用内：`/api/v1/runtime/apps/{appId}/notifications`（含 `unread-count`、`{id}/read`、`read-all`）；全局：`/api/v1/runtime/notifications` 同组接口，跨应用聚合 |
| 外部通知 | `lcp_notification_delivery` outbox：`webhook` / `email` 复用连接器 `connectionRef`，15 秒轮询、指数退避（上限 1 小时，5 次后 `dead`） |
| SLA 提醒 | `lcp_sla_reminder` 按 `(tenant, task, stage)` 幂等；warning / escalate 定时扫描并按通知模板发送 |
| 通知规则 | 发布件 `logicSchemas[].rules[].kind=notification`：`when` 过滤、目标用户表达式、渠道与模板；规则失败只记日志 |
| 登录入口 | `http://localhost:8080/login`；账号 `alice/alice123`、`bob/bob123`、`principal/principal123`、`hr/hr123` |
| 身份 API | `POST /api/v1/auth/login`、`GET /api/v1/auth/me`、`GET /api/v1/platform/identity/overview?appId=<id>` |
| 认证安全 API | `GET /api/v1/auth/password-policy`、`POST /api/v1/auth/password`、`GET /api/v1/platform/identity/auth-audits`（管理员，支持 `eventType` / `username` / `success` / `limit`） |
| 统一身份 API | `GET /api/v1/auth/sso/config`、`GET /api/v1/auth/sso/start?redirect=/...`、`GET /api/v1/auth/sso/callback`、`POST /api/v1/auth/sso/exchange` |
| SSO 配置 | `LCP_SSO_ENABLED`、`LCP_SSO_MODE`（`oidc` / `cas`）及 `LCP_SSO_*`；本地默认关闭，staging/prod 通过环境变量注入 |
| 微信登录 API | `GET /api/v1/auth/wechat/config`、`POST /api/v1/auth/wechat/login`（`{code,tenant?}`）；配置只返回 `enabled/app_id/tenant/display_name` |
| 微信登录配置 | `LCP_WECHAT_ENABLED`、`LCP_WECHAT_APP_ID`、`LCP_WECHAT_APP_SECRET`、`LCP_WECHAT_TENANT`、`LCP_WECHAT_LINK_BY`、`LCP_WECHAT_AUTO_CREATE`；默认关闭 |
| 连接器 API | `GET/POST /api/v1/platform/connections`；`PATCH/DELETE /api/v1/platform/connections/{id}` |
| 连接器审计 | `GET /api/v1/platform/connections/{id}/audits`（`create` / `update` / `delete`，请求头与凭据脱敏） |
| 密钥 API | `GET/POST /api/v1/platform/secrets`；`PATCH/DELETE /api/v1/platform/secrets/{id}`（密钥只写不读） |
| 连接器配置 | `LCP_SECRET_MASTER_KEY`、`LCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS`、`LCP_CONNECTOR_ALLOW_INSECURE_HTTP`；本地冒烟临时开启私网与 HTTP |
| 节假日服务 | 默认 `https://timor.tech/api/holiday/year/{year}`；`LCP_HOLIDAY_ENABLED`、`LCP_HOLIDAY_URL_TEMPLATE`、`LCP_HOLIDAY_TIMEOUT_MS`、`LCP_HOLIDAY_CACHE_TTL_SECONDS`；Redis 键 `lcp:holiday:v1:<year>` |
| 独立出码工程 | `codegen/leave_approval/docker-compose.yml`：Web `http://localhost:8091`、API `http://localhost:8090`、PostgreSQL `5433`；租户 `tenant_demo_school`、密码 `demo123`，账号为 Bundle 角色键与 `admin` |
| 出码 CLI | `node tools/codegen.mjs <bundle...> [--out dir] [--dry-run] [--no-incremental] [--app-key k] [--app-name n] [--tenant id] [--clean] [--json]`；默认增量写入 |
| 导出包 | `node tools/codegen.mjs <bundle> --export dist/<app>.zip`；包内含 `bundle.json`、`MANIFEST.json`、`README.md`、`generated/` |
| 版本对比 | `node tools/version-diff.mjs --export <zip> --online <appId> [--version n] [--tenant id] [--username u --password p]`；也支持 `--left/--right` 比两个本地包 |
| 登录保护 | 连续失败 5 次锁定 15 分钟；密码 8–128 位，须含小写字母与数字，禁止空白及登录名/显示名 |
| 权限模式 | 开发：`LCP_AUTH_DEV_HEADERS=true`、`LCP_IDENTITY_ALLOW_ALL=true`；staging/prod 覆盖层已置 `false` |
| 运行时导航 | `GET /api/v1/runtime/apps/{appId}/navigation`（发布态菜单 + 可访问页面 + 默认路由） |
| 运行时页面 | `GET /api/v1/runtime/apps/{appId}/pages/{pageKey}`（按页面 ACL 返回 200 / 403，含动作白名单） |
| 运行时数据源 | `POST /api/v1/runtime/apps/{appId}/pages/{pageKey}/data-sources/{dataSourceId}/query`（分页 / 搜索 / 排序 / 行级权限） |
| H5 运行时 | `/m/apps/<appId>/<发布页路径>`；与设计器共用 JWT 会话，独立移动壳、底部导航与更多抽屉，非法路径回退默认路由 |

启动与重建：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
cd platform; npm run typecheck; npm run build
```

本地直连 BFF（跳过 Nginx，可选）：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.bff-dev.yaml up -d bff
# 宿主机 http://localhost:8081/actuator/health/readiness；业务接口仍需租户/用户头
```

`compose.bff-dev.yaml` 只追加 `BFF_DEV_PORT`（默认 8081）端口映射，PostgreSQL/Redis 仍留在 `data` 内网。

## 里程碑提交

| 提交 | 模块 | 验证 |
|---|---|---|
| `29c22e8` | 控制平面工作台（草稿/发布/版本/diff/回滚） | 16 步冒烟通过 |
| `5b55e98` | 数据模型设计器 | typecheck / build / CDP 实测 |
| `51b4c89` | 页面设计器 | 模板、画布、数据源、校验实测 |
| `a318495` | 逻辑编排设计器 | 14 动作 / 87 步骤 / 11 API / 1 流程 / 3 规则实测 |
| `547916f` | 自定义组件注册与 iframe 沙箱 | CDP：沙箱属性、CSP、页面设计器联动、r7/r8 保存 |
| `bb628fb` | 接手上下文文档 | — |
| `b069720` | 动作回写与运行日志 | API 回写/失败重放 + CDP 动作日志面板 |
| `644b473` | 身份与权限：JWT / 组织架构 / 行级与字段权限 | 四账号登录 + 403 越权 + 字段白名单 + CDP 登录/退出 |
| `d35afe5` | 认证安全：密码策略 / 登录锁定 / 认证审计 | typecheck / build + 弱密码 400 + 锁定与重置 + 审计 403 + CDP 改密 |
| `1565955` | 运行时菜单与页面权限 | 四账号导航过滤 + 页面 200/403 + CDP 菜单切换与动态路由 |
| `20e3eb9` | 统一身份登录（OIDC / CAS） | OIDC 端到端 + 票据/state 重放 + 未绑定 403 + CDP 登录 |
| `3327c49` | 连接器注册表与租户密钥库 | 四种鉴权真实 HTTP 链路 + 权限 403 + CDP 连接器/密钥/引用保存 |
| `4c7a971` | 外部通知通道、通知规则与 SLA 提醒 | webhook / email outbox + 规则挂载 + SLA 幂等 + 全局通知入口 |
| `0737829` | 发布态运行时渲染器 | typecheck / build / 容器重建 + v9 列表、详情时间线、动作权限 CDP 实测 |
| `16507a3` | H5 应用壳与移动端适配 | typecheck / build / 容器重建 + 深链登录回跳、非法路径回退、发起页、底部导航与桌面回归 CDP 实测 |
| `3bee549` | uni-app 小程序运行时壳 | typecheck + H5 / mp-weixin 构建 + H5 390×844 登录、列表、搜索、分页、详情与表单回填 CDP 实测 |
| `f5bcd54` | 连接器扩展（GraphQL / SOAP / database / OAuth2 / 签名 / 审计） | typecheck / build / BFF 测试 + 审计落库与脱敏 + 私网 HTTP 链路冒烟 |
| `4d28ed6` | 出码模板 JWT 会话与组织权限 | 生成工程 typecheck / build + 登录、刷新恢复、退出登录 CDP 实测 |
| `2ae386c` | 小程序受控 apiCall | typecheck + H5 / mp-weixin 构建 + 受控调用与 ACL 冒烟 |
| `ad477be` | 小程序附件上传与附件列表 | typecheck + H5 / mp-weixin 构建 + 上传/列表/下载/软删/类型与页面校验冒烟 |
| `cd4bd8e` | 小程序审批时间线 | typecheck + H5 实测待办/已办时间线与审批意见 |
| `621319a` | 小程序微信登录 | BFF 编译 + typecheck + H5/mp-weixin 构建 + 假微信服务成功/未绑定/关闭降级 |
| `4fa5d64` | 小程序真机与体验版发布说明 | 文档命令/产物/配置核对 + `git diff --check` |
| `03fd438` | 运行时 transaction 真事务 | BFF 单测 + 真实 API `leave_submit` 草稿落库 |
| `ea19eb3` | 运行时 parallel 受控并发 | BFF 单测 + 真实 API `leave_batch_recall` 两单撤回 |
| `dcedacf` | 运行时 custom 注册式处理器 | BFF 单测 + 真实发布件 API 执行 `platform.uuid` / `platform.now` |
| `54ae546` | 运行时 code 白名单入口 | BFF 单测 + 真实发布件 API 执行 `calcWorkdays` 与未注册入口 |
| `3ce8342` | 运行时 findStale / findOverlap 内部 API | BFF 47 个测试 + 临时发布件真实 API 冒烟 |
| `b87a62a` | 真实节假日服务 | BFF 测试 + 真实页面 API + 请假工作日计算 + Redis 缓存 |
| `de7b00a` | 出码完整可运行工程 | 独立 server 编译 + Compose 端到端 CRUD + RLS 租户隔离 |
| `604d3d8` | 出码 CLI、参数化与增量导出 | dry-run / 参数覆盖 / 二次生成 0 变更 + 生成工程编译 |
| `0b3afaa` | 导出包与在线版本 diff | zip 外部解压校验 + 平台 v8↔v9 diff 200 条逐条一致 |

## 文档维护

- 每个模块完成后同步更新本文件：已完成项、环境快照、下一步、里程碑提交表。
- 影响架构的决策补到「设计决策」；范围变化直接改「剩余路线图」的勾选项。
- 本文件只记事实与状态，不写过程日志。

## 已完成

### 1. 协议与校验（地基）
- `schema/`：bundle / data / ui / logic / component / common 六份 JSON Schema + 表达式注册表。
- `registry/`：内置组件、表达式注册表。
- `tools/validate.mjs`：L1~L4 校验流水线。
- `ts/` + `java/`：TS / Java 双端类型绑定。

### 2. 出码引擎
- `tools/gen-*.mjs`：DataSchema → PG DDL、TS/Java 实体、BFF CRUD、TS 客户端、Vue3 CRUD 页面（含 OSS 直传代码）。
- 示例产物：`codegen/leave_approval/`。
- 生成前端已接入平台 JWT：登录页、路由守卫、`/auth/me` 会话恢复、角色 / 部门展示与退出登录。
- `tools/gen-project.mjs`：补齐独立 Spring Boot 启动类、演示身份、HMAC 令牌、请求级租户事务与强制 RLS，并生成 Docker Compose、Web/Nginx 与运行说明。
- **未完成**：统一 CLI 参数化、增量导出、压缩包与版本对比。

### 3. BFF 与控制平面
- `bff/`：租户过滤器、RLS 事务切面、统一异常、Actuator。
- 平台 API：应用 CRUD、草稿读写（乐观锁 revision）、发布、内容去重、版本列表/详情、diff、回滚、恢复草稿。
- 文档：`PLATFORM.md`。
- 前端：`AppListPage.vue`、`AppDetailPage.vue`。

### 4. 数据模型设计器
- `platform/src/pages/ModelDesignerPage.vue`
- `platform/src/lib/dataModel.ts`、`platform/src/types/dataModel.ts`
- 实体、字段、关系、存储策略、语义描述、校验、草稿与发布。
- 字段 key 改名时同步标题字段、主键、索引列、关系端点与 `refField`（`remapFieldKey`），避免改名后留下悬空引用挡住发布。

### 5. 页面设计器
- `platform/src/pages/PageDesignerPage.vue`
- `platform/src/lib/uiModel.ts`、`platform/src/components/preview/UiNodeRenderer.vue`、`platform/src/components/designer/NodeOutline.vue`
- 页面类型模板（列表/表单/详情/看板/审批/报表）、画布、属性面板、数据源、结构树、校验、JSON、草稿与发布。
- 组件注册表动态注入：`registerCustomComponents()`。
- `x-search-form` 画布同时渲染 `searchFieldList` 与默认插槽/子节点，结构树与画布保持一致。
- 画布预览控件统一点击穿透（`pointer-events: none`），禁用输入框/下拉框不再吞点击，选中落到对应 `x-*` 节点。

### 6. 逻辑编排设计器
- `platform/src/pages/LogicDesignerPage.vue`
- `platform/src/lib/logicModel.ts`、`platform/src/components/logic/*`
- 动作、API、Flowable 流程、规则；23 种步骤、嵌套步骤、表达式、校验、JSON、草稿与发布。
- 设计器只编辑元数据；运行时执行器由 `ActionRunService` 读取发布态 `logicSchemas` 执行。

### 7. 自定义组件与沙箱（刚完成）
- `platform/src/pages/ComponentDesignerPage.vue`
- `platform/src/lib/componentModel.ts`
- `platform/src/components/component/SandboxFrame.vue`
- `platform/src/types/uiModel.ts`（ComponentDef / SandboxPolicy / ComponentIssue）
- 4 个预设：`biz-card`、`metric-stat`、`field-upload`、`data-table`。
- 契约编辑：属性、插槽、事件、能力、容器规则、沙箱策略、`x-previewHtml` / `x-previewScript`。
- 沙箱：`iframe srcdoc` + `sandbox="allow-scripts"`，无 same-origin，CSP 默认 `default-src 'none'`。
- 与页面设计器打通：物料面板、`createNode`、`canAccept`、画布渲染、校验。
- 远程运行时：`lib/remoteComponent.ts` + `RemoteComponentHost.vue`；`source` 必须含 `{version}` 占位，加载前按 integrity 校验 SHA-256/384/512，模块可导出 `meta.name` / `meta.version` 做二次核对；缓存按 URL + SRI + 版本隔离，失败不缓存；设计器“生成 integrity”会下载真实模块内容计算。

### 8. 部署
- `deploy/compose.yaml`（dev）、`compose.staging.yaml`、`compose.prod.yaml`。
- `deploy/.env`、`.env.staging.example`、`.env.prod.example`、`release.sh`、`smoke.sh`、`smoke-platform.sh`。
- Nginx 同域托管设计器与 `/demo/` 示例应用。

### 9. 运行时与审批中心
- BFF `runtime` 模块：Flowable schema 初始化、发布时自动部署 BPMN、实例启动、待办/已办/我发起、任务详情/签收/完成/转办、历史时间线、业务表状态回写。
- 运行时只读线上发布件：`/api/v1/runtime/apps/{appId}/flows|tasks|instances`；不读取草稿。
- 字段视图由 DataSchema 生成，返回类型、值、`options`、`widget`；`enumRef` 从 `dataSchemas[].enums` 解析。
- 已办只保留审批办理记录，自动完成的申请人提交节点不再混入。
- 前端：`ApprovalCenterPage`、`ApprovalDetailPage`、`InstanceDetailPage`、`RuntimeFields`、`ProcessTimeline`、`api/runtime.ts`、`lib/runtime.ts`、`types/runtime.ts`。
- 审批中心支持待办/已办/我发起、关键字过滤；详情支持字段编辑、审批意见、同意/驳回/退回/转办、签收、时间线、实例跳转。
- 站内通知：`lcp_notification` 表 + `NotificationService`；任务分派、转办、退回、驳回、通过分别通知办理人或发起人，未读通知按业务对象去重。
- 审批中心增加通知面板、未读角标、单条已读、全部已读；点击通知直达审批 / 实例详情。
- 验证：typecheck / build 通过；API 覆盖同意、驳回、退回后重提、转办；CDP 跑通 Alice 发起 → Bob 审批 → Principal 院级审批 → 归档；通知链路覆盖分派 → 已读 → 退回 → 重提 → 通过，以及转办通知。

### 10. 动作回写与运行日志（刚完成）
- `ActionRunService` 把动作结果接回流程变量与业务字段，按 `writeback.variables/business` 求值并落库 `lcp_action_run`。
- 成功/失败按 `writeback.success` / `writeback.failure` 推进任务；办理人不匹配时记录 `applied.advance.status=failed`，回写结果仍保留。
- 运行日志支持按实例、动作、状态查询；详情返回原始入参/上下文/事件、trace、回写与推进结果；失败记录可重放并写入 `replayed_from`。
- 前端 `ActionRunPanel.vue` 接入实例详情：状态、耗时、回写与推进结果、步骤轨迹、原始输入/结果、失败重放入口。
- 修复已结束实例变量读取：改用 `HistoricVariableInstance`，避免 `HistoricProcessInstance.getProcessVariables()` 返回空。
- 验证：成功动作写入 `smoke_decision=approved_smoke` / `smoke_score=88`，业务 `reason=writeback-ok` 并自动推进结束；失败动作写入 `smoke_failed=true` / `reason=writeback-failed`，重放保留失败并生成新日志；跨租户列表 0 条、详情 404；CDP 面板渲染与详情展开正常。

### 11. 身份与权限（刚完成）
- 数据库：`30_identity.sql` 建部门、岗位、用户、角色、用户角色绑定与 RLS；`31_identity_demo.sql` 写入示范学院、计算机系、数学系与四个演示账号。
- BFF：`auth` 提供 JWT 登录 / `me` / 退出、PBKDF2 口令校验；`identity` 提供组织、用户、角色绑定 CRUD；`RoleSyncService` 从发布件同步应用角色。
- 权限求值：`PermissionService` 以发布件 `artifacts.permissions` + `roles[].dataScope` 为准，支持本人、部门、部门子树、全校与自定义规则；条件用 `ExpressionEngine` 求值。
- 运行时：实例/任务详情按行级权限校验、按字段白名单过滤；提交与审批动作分别校验 `onSubmit` / `onApprove` 对应的 action 授权；签收、转办、完成同样校验权限。
- 前端：`LoginPage`、`IdentityPage`、路由守卫、Bearer 拦截器、401 跳登录；顶栏展示用户 / 角色 / 退出，院级管理员可见「组织与权限」。
- 开发兜底：`X-Tenant-Id` / `X-User-Id` 仅在 `LCP_AUTH_DEV_HEADERS=true` 时生效；`LCP_IDENTITY_ALLOW_ALL` 仅用于本地绕过管理员校验。
- 验证：四账号登录与 `me` 通过；Alice 仅见本人字段、Bob 部门范围、HR 全校但无 `reason`、Principal 完整字段；Carol（数学系教师）读 Alice 实例 403；Alice 签收 Bob 任务 403；`leave_cleanup_stale` 403；Alice 发起 → Bob 签收 → 通过全链路通过；CDP 登录、退出、受保护路由跳转通过。

### 12. 认证安全（刚完成）
- 数据库：`32_auth_security.sql` 为 `lcp_user` 增加失败次数、锁定截止、密码变更时间、最近登录时间/IP；新建 `lcp_auth_audit` 记录登录成功、登录失败与改密，启用租户 RLS。
- 密码策略：`PasswordPolicy` 默认 8–128 位，须含小写字母与数字，禁止空白字符，禁止包含登录名或显示名；策略可读接口供前端提示。
- 登录保护：同一账号连续失败 5 次锁定 15 分钟；成功登录、管理员重置、自助改密后清零失败计数与锁定。
- 审计：登录成功/失败与改密写入 `lcp_auth_audit`；`GET /api/v1/platform/identity/auth-audits` 仅管理员可读，支持事件类型、用户名、成功标记与条数过滤。
- 前端：`IdentityPage` 增加「认证审计」页签与筛选；顶栏新增「修改密码」弹窗并展示密码策略，改密成功后退出重登。
- 验证：弱密码新建用户返回 `400 password_policy_violation`；连续 5 次错误后正确密码仍 401，管理员重置后恢复；旧密码改密后 401、新密码 200；Principal 查审计 200、Alice 403；CDP 审计页签与改密弹窗正常。

### 13. 运行时菜单与页面权限（刚完成）
- `RuntimeNavigationService` 只读发布件 `navigation.menus` 与 `uiSchemas`：按 `roles`、`visible` 表达式、`page/menu` ACL 过滤，空分支自动剔除，`defaultRoute` 不可访问时回退首个可见路径。
- 新增 `GET .../navigation` 与 `GET .../pages/{pageKey}`；页面授权取 `route.roles` / `access.roles` 与显式 page ACL 的并集。
- `RuntimeShellPage` 提供发布态菜单、只读页面布局预览与角色标签；菜单优先按 `page_key` 打开页面，动态路由模板（如 `/leave/requests/:id?`）支持路径匹配。
- 表达式 `in` / `notIn` 支持左侧数组：`in($user.roleKeys, [...])` 按交集判断，修复角色菜单 `visible` 与按钮权限同一类写法。
- 验证：四账号导航过滤符合预期（Alice 仅本人 / 发起，Bob 增加审批与考勤，HR 无平台管理，Principal 全量）；Alice 访问审批页 403、Bob 200；CDP 从 `/leave/requests` 切到 `/leave/requests/new` 与 `/leave/approval`，标题与页面 key 正确。

### 14. 统一身份登录（刚完成）
- `SsoController` 提供配置、发起、回调与一次性票据兑换四个端点；OIDC 使用授权码 + PKCE，CAS 使用 3.0 `serviceValidate`。
- OIDC 校验 ID Token 的 RS256/384/512 签名、JWKS、issuer、audience、exp 与 nonce；CAS XML 禁止 DOCTYPE 与外部实体，避免 XXE。
- state 与前端兑换 ticket 存 Redis 并 `getAndDelete` 一次性消费；state 10 分钟、ticket 60 秒。前端票据只经 URL fragment 传递，兑换前立即清理地址栏。
- 外部身份按 `tenant_id + sso_provider + sso_subject` 绑定；首次登录可按 username / email 关联本地用户，默认不自动建号。审计区分 `sso_oidc` / `sso_cas`。
- 登录页在 SSO 启用时显示组织登录入口；已登录访问 `/login` 直接回到工作台。Nginx 使用 `Host $http_host` 与 `X-Forwarded-Host`，保留回调端口。
- 验证：typecheck / build、BFF/Web 镜像构建通过；假 OIDC 服务覆盖绑定登录、`/auth/me`、ticket/state 重放、未知 state、未绑定 403；CDP 完成按钮登录并确认租户与角色会话。

### 15. 连接器注册表与租户密钥库（刚完成）
- 数据库：`34_connections.sql` 新建 `lcp_connection` 与 `lcp_secret`，均带 `tenant_id`、唯一索引与 RLS；`99_grants.sql` 通用授权覆盖新表。
- 协议：`ArtifactRef.kind` 增加 `connection`；逻辑 Schema 新增 `SecretRef`，鉴权值统一写成 `secret:<key>`，Bundle 内不出现明文。
- BFF：`SecretCipher` 使用 AES-256-GCM，AAD 绑定 `tenant_id:secret_key`；主密钥由 `LCP_SECRET_MASTER_KEY` 注入，密钥接口只写不读，支持元数据更新与轮换。
- 出站策略：`OutboundUrlPolicy` 默认只允许 HTTP/HTTPS 与公网地址，拦截回环、私网、链路本地与云元数据地址；本地与 staging/prod 通过显式开关控制私网与 HTTP。
- 运行时：`ActionExecutor` 读取连接器的 `baseUrl`、超时、公共请求头与默认鉴权；支持 `bearer`、`apiKey`（header/query）、`basic`。API 未声明 `auth` 时继承连接器，显式 `{"type":"none"}` 才覆盖。
- 前端：新增 `/connections` 管理页（连接器与密钥双页签、编辑/删除/轮换）与管理员导航；逻辑设计器 API 设置支持选择连接器并写入 `connectionRef`。
- 健壮性：逻辑设计器加载草稿时归一化缺失的 `actions/apis/flows/rules` 数组，避免旧草稿或外部导入 Bundle 打开即报错。
- 验证：typecheck / build 与 BFF 镜像构建通过；管理员连接器/密钥接口 200，Alice 读连接器 200、写连接器与读密钥 403；密钥响应不含明文/密文/IV；四种鉴权真实 HTTP 链路分别返回预期结果，错误密钥 401 且日志无明文；CDP 验证连接器列表、密钥轮换状态、逻辑设计器连接器继承与草稿 r4 回读。

### 16. 外部通知、通知规则与 SLA 提醒（刚完成）
- 协议：`logic.schema.json` 增加 `NotificationChannel` / `NotificationEvent` / `NotificationSpec` / `NotificationRuleConfig`；`Flow.sla` 支持 warning / escalate 通知，`Rule` 增加 `kind=notification` 与 `notification` 载荷；TS / Java 双端类型同步。
- 数据库：`35_notification_channels.sql` 新建 `lcp_notification_delivery`（外部渠道 outbox）与 `lcp_sla_reminder`（任务阶段幂等），均启用租户 RLS；新增 `public.lcp_active_tenants()` 供无请求上下文的后台调度器发现租户。
- BFF：`NotificationRuleService` 读取发布件规则，按 `when` 求值并解析目标用户；站内信直接写 `lcp_notification`，webhook / email 写 outbox 后由 `NotificationDispatcher` 投递。
- 投递：复用连接器 `connectionRef` 与密钥库；15 秒轮询、`for update skip locked` 抢占、指数退避（上限 1 小时），成功 `sent`、可重试 `failed`、超限或不可重试 `dead`，payload 入队即冻结。
- SLA：`SlaReminderService` 定时扫描发布态流程的 `sla` 配置，warning / escalate 各提醒一次；提醒记录与通知关联，重复扫描不重复发送。
- 全局通知：新增 `GET /api/v1/runtime/notifications`、`/unread-count`、`/{id}/read`、`/read-all`；前端顶栏铃铛跨应用聚合，30 秒轮询、未读角标、点击直达业务页面。
- 修复：Flowable 会把连接 `search_path` 切到 `flowable`，SLA 与 outbox 调度器改为显式调用 `public.lcp_active_tenants()`。
- 验证：演示任务超期后生成 1 条 escalate 提醒与 1 条 `sla:escalate` 通知（接收人 `principal`），下一扫描周期仍各 1 条；手工插入无 `connectionRef` 的投递后转为 `dead`、`attempts=1`，错误为「外部通知未配置 connectionRef」；`node tools/validate.mjs examples/leave-approval.bundle.json` 通过（仅保留已知监听器警告）。

### 17. Web / H5 应用壳（刚完成）
- 新增 `/m/apps/:appId/:pathMatch(.*)*` 与 `RuntimeMobilePage`，不挂 `StudioLayout`；复用发布态导航、页面 ACL、数据源与 JWT 会话。
- 抽出 `runtimeNavigation.ts`，统一动态路由匹配、菜单查找、默认路由与参数拼装，桌面 `RuntimeShellPage` 与 H5 共用。
- H5 壳提供应用名 / 版本 / 当前页、底部主导航、更多抽屉、用户菜单（切换桌面版 / 退出登录）；未登录深链跳登录后回跳原 H5 地址，非法路径回退默认路由。
- 桌面运行预览与 H5 预览入口会保留当前发布页；移动端搜索区在 `<=640px` 改为两列，表格改为横向滚动，避免按钮与列被压缩。
- 验证：typecheck / build 与 web 容器重建通过；iPhone 390×844 下 `/leave/requests`、`/leave/requests/new`、底部导航、退出登录、深链登录回跳、非法路径回退均通过；桌面 `/runtime?path=/leave/requests/new` 正常，搜索区恢复四列，控制台无错误。

### 18. uni-app 小程序运行时（刚完成）
- 新增 `miniapp/`：uni-app Vue3 + TypeScript，独立登录页与运行时页；只消费发布件契约，不复制控制平面。
- 登录态：租户 / 用户名 / 密码登录，会话持久化到 `metaforge.miniapp.session.v1`，支持演示账号快捷填充、账号抽屉与退出登录。
- 运行时壳：读取 `navigation / page / data-source / action` 接口；底部主导航、更多菜单、下拉刷新、动态路由参数、默认路由回退与页面错误态。
- 组件渲染：`x-page / x-card / x-toolbar / x-btn / x-text / x-search-form / x-table / x-pagination / x-form / x-descriptions / x-status-tag / x-row-actions / x-dialog`；搜索支持 `like / eq / in / between`，表格在窄屏卡片化，表单覆盖枚举、单选、日期时间、开关、多行文本与数字。
- 插槽：`x-toolbar`、`x-search-form` 的左右插槽与自定义子节点都会渲染，避免设计器里添加的按钮/组件在小程序端丢失。
- 编辑态：表单页通过实体数据源预取回填；未实现的 `apiCall` 不再用空结果覆盖已回填表单。
- 编辑回填复核：`01M5BW2BV4V8PKPF7MG9GY70EX` 的 `reason` 正常回填；`01M5CYJK0E081KA588K6TREETD` 本身原因为空，不是渲染问题。
- 构建：`npm run build:h5` 产物在 `miniapp/dist/build/h5`；`npm run build:mp-weixin` 产物在 `miniapp/dist/build/mp-weixin`。
- 验证：`typecheck`、H5 构建、mp-weixin 构建均通过；H5 390×844 实测登录、列表 13 条、状态筛选 1 条、翻页到 2/2、详情抽屉、新建与编辑表单回填及底部按钮。

### 19. 连接器扩展：GraphQL / SOAP / 数据库 / OAuth2 / 签名（刚完成）
- 协议：`ApiAuth` 增加 `oauth2`（`tokenUrl`、`grant`、`clientIdRef`、`clientSecretRef`、`usernameRef`、`passwordRef`、`refreshTokenRef`、`clientAuth`、`refreshBeforeSec`）与 `signature`（`secretRef`、`algorithm`、`encoding`、`template`、`headerName`、`timestampHeader`、`timestampUnit`）；连接器 `kind` 扩展为 `rest` / `graphql` / `soap` / `database` / `internal`。
- 运行时：`ConnectorRuntime` 统一解析 none / tenant / bearer / apiKey / basic / oauth2 / signature；OAuth2 按租户与客户端缓存令牌并提前刷新；签名支持 HMAC-SHA256 / MD5 与 hex / base64；`ActionExecutor` 按 `kind` 分派 REST、GraphQL、SOAP、database、internal，GraphQL 检查 `errors`、SOAP 识别 Fault、`kind` 不匹配返回 `CONNECTION_KIND_MISMATCH`。
- 数据库连接器：仅允许 PostgreSQL JDBC；只读 `SELECT` / `WITH`、单条语句、参数化绑定、只读事务、超时与行数上限；连接地址不得带查询参数。
- 出站加固：`PinnedHttpTransport` 解析后固定 DNS 并直连 IP，防 DNS rebinding；禁止重定向、校验证书主机名、响应体上限 8 MB。`PinnedSocketFactory` 让 PostgreSQL JDBC 复用同一套地址校验。
- 审计：`36_connection_audits.sql` 新建 `lcp_connection_audit`（RLS + 索引 + 动作约束）；连接器创建 / 更新 / 删除写入前后快照，请求头与鉴权值脱敏为 `***`。
- 前端：连接器页支持 database / soap / oauth2 / signature 配置、审计弹窗与「其他配置 JSON」；`baseUrl` 对 REST / GraphQL / SOAP 改为可选（可由 API 自带地址）。
- 验证：`node tools/validate.mjs` 通过；`npm run typecheck` / `npm run build` 通过；BFF 测试覆盖 URL 策略、XML 安全解析、SOAP Fault、GraphQL 与连接器分派；审计冒烟产生 `create` / `update` / `delete` 三条记录，快照请求头值为 `***`。

### 20. 出码模板 JWT 会话与组织权限（刚完成）
- `tools/gen-page.mjs` 新增 `src/views/Login.vue`：租户 / 用户名 / 密码登录，错误信息来自 BFF，提交期间禁用按钮。
- `stores/session.ts` 移除 `ensureDemoSession` 与 `demo-user`，改为 `POST /api/v1/auth/login` + `GET /api/v1/auth/me`；保存 JWT、租户与用户快照，角色取 `role_keys`，部门取 `dept_id` / `dept_name`。
- 路由守卫：未登录访问业务页跳转 `/login?redirect=<原地址>`；已登录访问登录页回到目标页；刷新时用 Bearer 令牌恢复会话，令牌失效自动清空并回登录页。
- 布局：显示真实姓名、部门与角色，退出登录回到 `/login`；不再自动创建演示会话。
- 验证：生成工程 `typecheck` / `build` 通过；CDP 实测未登录深链跳转、`alice` 登录、跨刷新恢复（角色 `student`、部门 `计算机系`）、列表数据与退出登录回登录页。

### 21. 小程序受控 apiCall（刚完成）
- 新增 `POST /api/v1/runtime/apps/{appId}/pages/{pageKey}/apis/{apiKey}/invoke`：先校验页面 ACL，再沿页面 `apiRef` 与可执行 `actionRef` 引用链确认 API 归属，未引用直接 403。
- `ActionExecutor.invokeApi` 复用发布件、连接器、鉴权、mock、GraphQL / SOAP / database / internal 分派与 `resultPath`，小程序不接触连接器地址或密钥。
- 小程序 `runSteps` 的 `apiCall` 已执行真实请求，支持表达式参数、页面 / 路由 / 表单 / 行数据上下文、`resultPath` 与 `assignTo`；失败沿用动作错误提示，不再静默警告。
- 验证：`miniapp` typecheck 与 BFF 编译通过；受控入口将用演示页面 API 做 200 / 未引用 403 冒烟。
### 22. 小程序附件上传与附件列表（刚完成）
- BFF 新增页面级附件接口：`POST/GET /api/v1/runtime/apps/{appId}/pages/{pageKey}/attachments`、`GET .../{id}/content`、`DELETE .../{id}`；上传前校验页面 ACL，文件和元数据分离，内容落 `LCP_ATTACHMENT_DIR`，元数据写入发布件的 `attachment` 实体。
- 类型白名单按 `image` / `video` / `document` / `other` 分组，单文件上限 100MB；对象键含租户、应用、年月与 ULID，拒绝路径穿越；响应带 SHA-256 校验和与受控下载地址，删除为软删除。
- 小程序 `x-upload` 接入 `chooseImage` / `chooseVideo` / `chooseFile`（微信回退 `chooseMessageFile`），按控件 `uploadHints` 校验数量、大小与扩展名，上传后回填附件对象数组并支持预览/移除；`x-attachment-list` 按 `bizType + bizId` 加载、分组、预览与可选删除。
- 容器卷改为 `/app/data/attachments` 并由镜像预创建为 `app` 用户所有，避免命名卷以 root 拥有导致写入失败。
- 验证：`miniapp` typecheck 与 H5 / mp-weixin 构建通过；`alice` 上传 200、列表命中、下载 200、软删除后列表为空；`.exe` 返回 400 `file_type_not_allowed`，未知页面返回 404；数据库中仅登记元数据。
### 23. 小程序审批时间线（刚完成）
- BFF `TimelineItem` 增加 `comment`：按 `taskId` 关联 Flowable 流程实例审批意见，桌面与小程序共用同一响应。
- 小程序新增 `GET /tasks/{taskId}` / `GET /instances/{instanceId}` 客户端方法；`x-approval-timeline` 按 `processInstanceId` 表达式加载实例，渲染节点名称、办理人、开始/结束时间、耗时与进行中状态，支持 `showComment` / `showAssignee` / `order`。
- 小程序页面渲染器补上 `type=flow, kind=instance` 数据源：按路由 `taskId` 拉取任务详情并填充 `$process` 根，审批页可正常加载 表单 / 变量 / 附件 / 时间线；实体单条数据源在 `kind=approval` 下也会随任务加载。
- 空态区分“未发起流程”“暂无流转记录”“加载失败”；404 / 403 直接展示服务端消息。
- 验证：typecheck 通过；H5 实测 bob 打开待办详情，时间线展示“发起请假 / 申请人提交 / 部门负责人审批（进行中）”；已办实例展示审批意见 `cleanup stage5 smoke` 与耗时 4 分钟。
### 24. 小程序微信登录（刚完成）
- BFF 新增 `GET /api/v1/auth/wechat/config` 与 `POST /api/v1/auth/wechat/login`：服务端用 `jscode2session` 换取 `openid`（有 `unionid` 时优先），再复用 `loginExternal` 的租户绑定与账号映射；审计方法记为 `wechat_miniapp`。
- 配置接口只返回启用状态、AppID、租户与显示名，AppSecret 不进入响应；请求租户必须与 `LCP_WECHAT_TENANT` 一致。微信接口默认仅允许 HTTPS，本地假服务需显式 `LCP_WECHAT_ALLOW_INSECURE_HTTP=true`。
- 小程序登录页支持 `uni.login({provider:"weixin"})` 一键登录；配置未启用时保留账号密码入口并明确提示，不阻塞 H5 构建。
- 验证：BFF 镜像编译、`miniapp` typecheck 与 H5 / mp-weixin 构建通过；假 `jscode2session` 覆盖成功登录与 `/auth/me`、错误 code 400、未绑定 403、租户不匹配 403、关闭后 400，配置响应不含 secret。
### 25. 小程序真机与体验版发布说明（刚完成）
- 新增 `miniapp/RELEASE.md`：覆盖 AppID、HTTPS 合法域名（request / uploadFile / downloadFile）、服务端 `LCP_WECHAT_*`、局域网真机调试、体验版上传与正式发布、常见错误与上线清单。
- 新增 `miniapp/.env.example` 并重写 `miniapp/README.md`，修正已过期的能力边界（`apiCall`、附件、审批时间线与微信登录均已完成）。
- 验证：文档路径与实际命令、产物目录、配置项逐项核对；`git diff --check` 通过。
### 26. 运行时 transaction 真事务（已完成）
- `transaction` 步骤改由 `SpringRuntimeTransactionRunner` 执行：请求级事务内开 `PROPAGATION_NESTED` 保存点，支持 `readCommitted` / `repeatableRead` / `serializable` 与 `readOnly`。
- 进入保存点前设置 `search_path` 与 `lcp.tenant_id`；步骤失败只回滚当前段，外层仍可记录失败日志或走 `onError`。
- 验证：BFF 单元测试通过；真实 API 执行 `leave_submit` 草稿保存，`transaction` trace completed，`edu_leave_request` 落库成功。
### 27. 运行时 parallel 受控并发（已完成）
- `parallel` 改为固定大小守护线程池执行，单步并发上限 `MAX_PARALLEL=20`；`failFast=true` 取消其余分支并抛首个失败，`failFast=false` 保留失败分支 trace、其余分支正常完成。
- 每个分支使用父作用域根节点的深拷贝，`ctx.vars` / `form` / `page.state` 互相隔离；完成后按声明顺序做根节点 diff 合并，数组整体替换、后者覆盖前者，`events` 与 trace 同样按声明顺序合并。
- 分支内设置并清理 `TenantContext`，每个分支由 `SpringRuntimeTransactionRunner` 开启独立事务（`readCommitted`），保证 `search_path` 与 `lcp.tenant_id` 在 worker 线程生效；语义是“分支独立提交”，父动作后续失败不会回滚已提交分支。
- 步骤超时取动作 deadline 与 `timeoutMs` 的较早值；步骤计数器改为共享 `AtomicInteger`，并发分支共同受 `MAX_STEPS` 约束。
- 验证：BFF 16 个执行器测试通过（含并发耗时、变量隔离、事件顺序、failFast 取消、failFast=false、超时）；真实 API `leave_batch_recall` 并行撤回两张 pending 请假单成功，trace 两分支 completed，数据库状态均为 `cancelled`。

### 28. 运行时 custom 注册式处理器（已完成）
- 新增 `RuntimeCustomHandler` 接口与 `RuntimeCustomHandlerRegistry`，Spring 自动收集处理器并按 key 排序、拒绝重复注册；Bundle 只保存 handler 标识，不能携带或执行任意脚本。
- `ActionExecutor` 的 `custom` 步骤先对 `params` 做表达式求值，再把租户、用户、应用、版本、发布件、时区与 `$now` 传入处理器；结果写入 `assignTo`，未知或缺失 handler 返回 `UNKNOWN_HANDLER`。
- 内置 `platform.uuid`（支持 `prefix`）与 `platform.now`；处理器异常经运行时失败映射统一记录 trace 并触发回滚语义。
- 验证：BFF 38 个测试通过（含参数求值、`assignTo`、上下文透传、未知 handler 明确失败）；真实发布件 API 执行 `custom_check`，两条 custom trace 均为 completed，`state.generated.value` 带 `std-A1-` 前缀、`state.generatedAt` 为 Asia/Shanghai 时间。

### 29. 运行时 code 白名单入口（已完成）
- 新增 `RuntimeCodeEntry` 与 `RuntimeCodeEntryRegistry`，code 步骤只按 `entry` 查表执行平台注册回调；未注册入口返回 `UNSUPPORTED_STEP`，不会读取 Step 的 `source` 或执行任意脚本。
- 首个注册入口为 `calcWorkdays`，保留原有法定节假日/调休、周末跳过、年假超长告警与 `assignTo` 行为。
- 验证：BFF 40 个测试通过（含注册表键、未注册入口失败）；真实发布件 API 执行 `code_check` 返回 `days=5`、跳过 `2026-10-01` / `2026-10-04`，同发布件的 `bad_code` 返回 `UNSUPPORTED_STEP`。


### 30. 运行时 findStale / findOverlap 内部 API（已完成）
- `POST /bff/entity/{entity}/findStale`：`idleDays` 默认 30（1–3650），`limit` 默认 5000（1–5000），可按 `statuses` 过滤；返回 `{rows,total}`，按 `updated_at` 升序取超期单据。
- `POST /bff/entity/{entity}/findOverlap`：必填 `applicantId` / `startAt` / `endAt`，可选 `excludeId`，`activeStatuses` 默认 `pending,draft,approved`；按半开区间 `existing.start_at < new.end_at AND existing.end_at > new.start_at` 查询。
- 表名、主键、租户列、软删除列、更新时间列、`access.ownerField`、时间字段与状态字段全部来自实体元数据；任何值均通过绑定参数，租户与软删条件由服务端强制追加。
- 两个入口都先计算 `total` 再取最多 5000 行，JSONB `ext` 字段合并回业务行，非法实体/字段/参数明确返回错误。
- 验证：BFF 47 个测试通过；临时发布件真实 API 冒烟中 `findStale` 返回 8 条 approved 超期单据，`findOverlap` 命中 2026-11-09 至 11-10 的两张重叠单据（含 approved 与 draft），临时应用、运行日志与草稿单据均已清理。

### 31. 真实节假日服务（已完成）
- 新增 `HolidayCalendarProvider` 与 `HolidayCalendarService`：按年份读取 Redis 缓存，未命中时请求可配置的开放接口；支持 `{year}` URL 模板、连接/读取超时与 7 天默认 TTL。
- 兼容 `holiday` 对象（含 `holiday` 布尔值）与 `data` / `holidays` 数组格式；非法单日、未知类型和非 2xx 响应均不会中断动作。
- 非 2xx、超时或网络异常降级为空日历并记录 warning；`calcWorkdays` 会合并服务端日历与步骤输入，步骤输入优先，降级时额外返回“已仅按周末计算”提示。
- 发布件中的占位节假日 API 改由同一服务返回 `{code:0,data:[...]}`，不再直接返回空数组。
- 验证：BFF 测试通过；真实页面 API `page_leave_form/apis/api_holiday_list/invoke?year=2026` 返回 39 条节假日/调休，Redis `lcp:holiday:v1:2026` TTL 约 7 天；真实 `leave_submit` 以 `2026-10-01` 至 `10-10` 计算得到 3 个工作日（10-08、10-09、10-10 调休），临时草稿与动作日志已清理。

### 32. 出码完整可运行工程（已完成）
- 新增 `tools/gen-project.mjs`：在 `codegen/<app>/` 下生成独立 Spring Boot `server/`、`docker-compose.yml`、`Dockerfile.web`、`nginx.conf`、`.dockerignore`、`RUN.md` 与 `sql/95_force_rls.sql`。
- `server` 自动扫描生成 CRUD，提供 `LcpPrincipal` 请求作用域实现、HMAC 演示令牌、`/api/v1/auth/login` 与 `/api/v1/auth/me`；每个 Controller 调用包进事务并设置 `lcp.tenant_id`。
- 独立工程账号由 Bundle 角色键生成（另含 `admin`），密码默认 `demo123`；开发头 `X-Tenant-Id` / `X-User-Id` 仅作本地兜底。
- 迁移沿用 `sql/00_extensions.sql`、逐表 DDL 与 `90_rls.sql`，新增 `95_force_rls.sql` 强制表 owner 也受 RLS 约束；Compose 将 `sql/` 挂到 `docker-entrypoint-initdb.d`，按文件非事务执行 `create index concurrently`。
- 验证：`mvn -f server/pom.xml package` 通过；`docker compose up -d --build` 后 admin 登录、员工与请假单创建/查询成功；`tenant_other` 查询返回 `total=0`，`tenant_demo_school` 返回 `total=1`，RLS 生效；Web `/healthz` 返回 200。

### 33. 出码 CLI、参数化与增量导出（已完成）
- 新增 `tools/codegen.mjs`，顺序编排 `gen-entity → gen-api → gen-page → gen-project`；支持 `--out`、`--dry-run`、`--clean`、`--json`，以及 `--app-key` / `--app-name` / `--tenant` 覆盖 Bundle。
- 四个生成器统一读取 `LCP_CODEGEN_OUT`，本轮新增 `tools/codegen-fs.mjs`：落盘前比较内容，相同文件不再写入；`--no-incremental` / `LCP_CODEGEN_INCREMENTAL=false` 可强制全量。
- `gen-entity` 清理孤儿文件时显式跳过 `sql/95_force_rls.sql`，避免与 `gen-project` 共享目录时互相删除；dry-run 在系统临时目录跑完整生成，只打印文件清单，不污染目标目录。
- 验证：`--dry-run` 生成 94 个文件；`--app-key smoke_app --tenant tenant_smoke` 后包名、数据库名与租户配置均切换；连续两次生成第二次摘要为「变更 0 个」；生成工程 `mvn -DskipTests package` 通过。

### 34. 导出包与在线版本 diff（已完成）
- `tools/codegen.mjs --export <zip|dir>` 在出码后生成可移交包：`bundle.json`、`MANIFEST.json`（内容摘要 + 逐文件 SHA-256）、`README.md` 与 `generated/`；只收集四个生成器清单声明的文件，不再把 `package-lock.json` 或构建目录带进包。
- `gen-project` 新增 `PROJECT.txt` 清单并清理自己上一轮的孤儿文件；`tools/codegen-export.mjs` 可读取 zip / 目录 / 普通 bundle.json，`tools/zip.mjs` 提供无依赖的 zip 读写。
- 新增 `tools/version-diff.mjs`：支持本地包 ↔ 本地包、导出包 ↔ 在线版本；账号密码登录或复用 JWT，`--fail-on-diff` 可直接用于 CI。
- diff 口径复用平台规则：去掉 `snapshot`、规范化 JSON 计算 SHA-256、数组按 `key`/`id`/`name` 配对、最多 200 条并标记截断；单侧超大节点只保留定位字段。
- 验证：`version-diff --self-test` 5 条通过；导出包经 PowerShell `Expand-Archive` 解压成功，`MANIFEST.json` 的 95 个文件 SHA-256 全部匹配；本地工具对在线 v9 的内容摘要与平台返回一致；对 v8↔v9 的 200 条 diff，路径、类型、工件归属与摘要和平台 API 逐条一致。

## 剩余路线图

### 阶段 4 · 运行时与工作流（已完成）
- [x] 4.1 Flowable 运行时：发布时部署 BPMN（来自 `logicSchemas.flows`），实例启动/查询已通；挂起/激活未做。
- [x] 4.2 任务 API：待办/已办/我发起、签收、完成、转办、变量、历史时间线已完成；加签未做。
- [x] 4.3 逻辑执行器：动作步骤同步执行（assign / branch / loop / parallel 受控并发 / callAction / transaction 数据库保存点 / delay / log / emit / fail），REST 与 mock API 已接入，支持超时、重试、路径/查询/头/体、`successWhen`、响应映射、`resultPath` / `assignTo`；已接入 `kind=internal` 的实体增查改、流程终止、`findStale` / `findOverlap`，以及 `startFlow` / `completeTask`、注册入口表（当前 `calcWorkdays`）与真实节假日服务。
- [x] 4.4 表达式引擎：按注册表白名单求值 97 个函数、14 个取值根；支持 `$lit/$ref/$fn/$tpl/$if`、路径、`filter/map` 子作用域、`$now` 冻结；未知函数、错误元数、未知根均抛错。
- [x] 4.5 审批页：审批中心（待办/已办/我发起）、详情（表单 + 时间线 + 审批动作）已完成；办理人解析已接组织架构，静态目录仅作兜底。
- [x] 4.6 运行时事件与回调：流程状态回写；站内通知（任务分派 / 转办 / 退回 / 驳回 / 通过）与审批同事务落库，支持未读数、单条 / 全部已读；审批中心通知面板 + 顶栏全局铃铛（跨应用、30 秒轮询、点击跳转）。外部渠道（webhook / email）走 outbox，复用连接器、幂等、指数退避与 `dead` 终态；`Rule.kind=notification` 规则挂载与 SLA warning / escalate 幂等提醒已接入。
- [x] 4.7 动作回写与运行日志：动作结果可回写流程变量/业务字段并按成功/失败声明推进任务；运行日志持久化，支持实例/动作/状态查询、详情与失败重放；结束实例变量可从历史表读取。

### 阶段 5 · 权限体系
- [x] 5.1 用户、角色、组织架构（部门/岗位）：身份表 + 演示数据 + BFF CRUD + `IdentityPage`。
- [x] 5.2 按钮权限与字段权限：提交 / 审批 / 动作执行按 Bundle 授权；DataSchema 字段白名单过滤读与写。
- [x] 5.3 行级数据权限：本人 / 部门 / 部门子树 / 全校 / 自定义条件。
- [x] 5.4 JWT 登录与 Bearer 会话，替换演示会话头；请求头仅保留开发兜底。
- [x] 5.5 菜单权限：发布态导航按 `roles` / `visible` / ACL 过滤；运行预览按菜单 `page_key` 打开只读页面，直接页面访问受 403 保护。
- [x] 5.6 SSO（OIDC / CAS）接入：OIDC 授权码 + PKCE 与 CAS 3 `serviceValidate` 已实现；一次性 state/ticket、外部身份绑定、登录审计与前端回调完成。
- [x] 5.7 密码策略、登录锁定与认证审计：策略校验、失败锁定、自助改密与管理员审计查询已完成。

### 阶段 6 · 多端发布与运行时
- [x] 6.1 发布态运行时渲染器：读发布件渲染布局、数据源、搜索分页排序、行操作、详情抽屉与流程时间线；按 `allowedActions` 禁用越权动作，不依赖设计器状态。
- [x] 6.2 Web / H5 应用壳与路由、登录态：独立移动壳复用同一 SPA、JWT 会话与发布件导航；支持深链回跳、底部导航、桌面/H5 切换与移动端表格横滑。
- [x] 6.3 uni-app 小程序运行时：独立登录态与运行时壳，复用发布件导航、页面、数据源与动作契约；移动端列表卡片化、表单与详情抽屉已接入。
- [x] 6.4 运行时动作补齐：`kind=internal` 实体 save/get/patch、流程终止、`findStale` / `findOverlap`、`startFlow` / `completeTask`、注册入口 `calcWorkdays`、服务端 `validate` 已接入；请假“新建 → 提交 → 撤回”端到端通过。
- [x] 6.5 自定义组件远程模块加载：`runtime=remote` 的 https 模块按 `{version}` 锁定版本，加载前校验 SRI，模块 `meta` 与契约不一致时拒绝渲染；设计器按真实模块内容生成 integrity。
- [x] 6.6 运行时附件：页面级 ACL 上传 / 列表 / 受控下载 / 软删除，本地卷存储与类型白名单；小程序上传控件与附件列表已接入。
- [x] 6.7 小程序微信登录：`jscode2session`、外部身份绑定、配置脱敏与登录页一键登录；未配置时账号密码降级。
- [x] 6.8 小程序真机与体验版发布：AppID、合法域名、HTTPS、局域网调试、体验版/正式发布文档与排障清单。

### 阶段 7 · 出码引擎完整化
- [x] Bundle → 完整可运行工程（前端 + BFF + 迁移脚本）。
- [x] 出码 CLI、参数化、增量导出。
- [x] 导出包与在线版本的 diff。

### 阶段 8 · 集成与扩展
- [x] 连接器注册表：REST / GraphQL / SOAP / PostgreSQL database / internal；OAuth2、签名鉴权、变更审计与 DNS pinning 已接入。
- [x] 租户级密钥与凭证管理：AES-256-GCM 加密存储、只写不读、轮换与租户隔离。
- [ ] 自定义 TS 代码钩子（页面生命周期、逻辑步骤）。
- [ ] AI 辅助：自然语言生成表单/页面/流程（语义字段已预留）。

### 阶段 9 · 市场
- [ ] 内置页面模板市场。
- [ ] 应用市场（安装/升级/依赖）。
- [ ] 组件市场。

## 设计决策

- **单一 Bundle**：设计器、发布快照、运行时共享 `bundle.artifacts.*`；组件、页面、逻辑都不另建表。
- **组件存储**：只把租户自定义组件写入 `artifacts.components`；平台内建组件留在 `registry/`。
- **组件标识**：`name`（kebab-case）是稳定标识，创建后不可改；改名通过复制新组件完成。
- **沙箱策略**：设计器用 `iframe srcdoc` + `sandbox="allow-scripts"`，不授予 same-origin；CSP 默认 `default-src 'none'`。
- **策略字段**：`sandbox.*` 是运行时声明，设计器只做编辑与校验，真正执行在发布态渲染器（待实现）。
- **扩展键**：平台私有字段统一 `x-` 前缀（`x-previewHtml`、`x-previewScript`），随 Bundle 版本化。
- **草稿并发**：控制平面用 `revision` 乐观锁，冲突时提示加载最新草稿。
- **语义预留**：实体、页面、组件、流程均带 `semantic.intent`，为 AI 生成做准备。
- **运行时只读发布件**：审批中心与任务 API 只认 `current_version`，草稿变更不影响线上实例。
- **动作由流程声明驱动**：前端按 `Flow.taskForms[].buttons` 渲染动作，后端按同一份声明校验 `outcome` 与 `comment_required`。
- **已办口径**：排除 `assignee.type=initiator` 的自动提交节点，避免与「我发起」重复。
- **状态回写**：运行时服务在审批事务内把状态与当前节点写回业务表，业务表仍是 DataSchema 驱动的唯一业务真源。
- **动作执行边界**：运行时只读发布件 `logicSchemas`；前端交互步骤跳过，`validate` 在服务端执行；`code` 只放行注册入口（当前 `calcWorkdays`），`custom` 只分派到平台注册处理器，二者都不执行 Bundle 内的任意脚本。
- **动作回写两段式**：动作只产出 `writeback` 声明，`ActionRunService` 统一求值并执行变量/业务回写；任务推进仅在声明 outcome 且办理人匹配时发生，回写与推进各自记录 applied 结果。
- **动作日志与重放**：每次执行落一行 `lcp_action_run`，保存原始入参/上下文/事件与 trace；重放复用原始输入并写 `replayed_from`，不撤销上一次副作用。
- **API 单点收口**：动作不内联 URL，只引用 Api 工件；REST 直连，`kind=internal` 经 `RuntimeInternalApiService` 白名单分派，数据库类仍等待连接器与密钥库。
- **表达式安全**：白名单函数 + 注册取值根，叠加步数、调用层级、动作超时与延迟上限。
- **通知分通道落库**：站内信与审批动作同事务写入，按「租户 + 用户 + 类型 + 业务对象」对未读去重；webhook / email 只写 outbox，payload 入队即冻结，投递失败不回滚审批。
- **外部通知幂等与退避**：`(tenant_id, idempotency_key, channel, recipient)` 唯一；调度器 15 秒轮询，指数退避上限 1 小时，5 次后置 `dead`。
- **SLA 提醒幂等**：`lcp_sla_reminder` 以 `(tenant_id, task_id, stage)` 唯一，同一任务同一阶段只提醒一次；warning 与 escalate 复用通知模板，不重复写规则。
- **通知规则复用逻辑发布件**：`Rule.kind=notification` 与动作规则同在 `logicSchemas`，按 `when` 过滤、目标用户由表达式求值；单条规则失败只记日志，不阻断审批。
- **调度器显式限定 schema**：Flowable 会覆盖连接 `search_path`，后台调度器统一调用 `public.lcp_active_tenants()`，避免在不同 `search_path` 下找不到函数。
- **通知触发点跟随业务事务**：任务分派、转办、退回、驳回、通过由 `ProcessRuntimeService` 显式触发，不在 Flowable 监听器里直接写库。
- **JWT 是唯一生产身份源**：`TenantFilter` 校验 Bearer JWT 后写入 `TenantContext`；`X-Tenant-Id` / `X-User-Id` 只在 `lcp.auth.dev-headers=true` 时兜底，staging/prod 覆盖层显式关闭。
- **角色绑定与权限定义分离**：组织表只回答「谁拥有哪个角色」，角色、权限、字段白名单与行级条件全部来自发布件；运行时不在代码里硬编码角色。
- **字段权限取并集**：同一用户命中多个授权时，可读字段取并集；显式字段白名单优先于角色默认范围；写入同样过白名单，避免审批表单放大权限。
- **动作授权**：流程启动校验 `onSubmit` 对应 action 的 `execute`，审批校验 `onApprove` 的 outcome；动作执行器校验 action 的 `execute`，越权统一 403。
- **密码与锁定参数化**：策略长度/字符要求与失败阈值、锁定时长走 `lcp.auth.password-policy.*` / `lcp.auth.lockout.*` 配置，默认值可直接用于演示环境。
- **审计与认证同事务**：登录成功、失败与改密在同一事务写入 `lcp_auth_audit`，失败记录不阻断原异常返回；审计读取仅限管理员并受租户隔离。
- **运行时导航只读发布件**：菜单、默认路由与页面访问均基于 `current_version`；`defaultRoute` 失效时回退首个可见菜单，避免上线后指向越权页面。
- **角色与 ACL 取并集**：页面 `roles` 与显式 `page` ACL 任一命中即可访问；菜单 ACL 仅在该 key 存在授权声明时才作为额外门槛，避免稀疏授权误伤正常入口。
- **数组版 `in`**：`in` / `notIn` 左侧为数组时按交集判断，统一支持 `$user.roleKeys` 用于菜单、按钮与权限表达式。
- **SSO 票据一次性且不进入查询串**：OIDC state 与本地 exchange ticket 均存 Redis 并原子取出；回调只把 ticket 放在 fragment，避免 JWT 或 ticket 出现在服务端日志、Referer 与浏览历史。
- **外部身份以稳定 subject 绑定**：优先使用 `tenant_id + sso_provider + sso_subject`，首次登录才允许按 username / email 关联；默认不自动建号，避免 IdP 用户无边界地进入本地租户。
- **SSO 出站默认要求 HTTPS**：`LCP_SSO_ALLOW_INSECURE_HTTP` 只用于本地假 IdP；生产回调地址由反向代理的 `X-Forwarded-Host` 还原，保留对外端口。
- **连接器与密钥分离**：连接器只存地址、超时、公共头与鉴权引用；密钥值单独加密入库，Bundle 与 API 响应都只出现 `secret:<key>`。
- **出站地址默认收紧**：连接器默认拒绝私网、回环、链路本地与云元数据地址；本地冒烟通过 `LCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS` / `LCP_CONNECTOR_ALLOW_INSECURE_HTTP` 显式放宽。
- **鉴权继承显式覆盖**：API 的 `auth` 缺省或为 `null` 时继承连接器默认鉴权；只有显式 `{type:"none"}` 才关闭，避免误把空对象当成无鉴权。
- **密钥轮换即覆盖**：轮换在同一行更新密文、版本号与轮换时间，不保留历史密文；主密钥丢失不可恢复。

- **运行态查询服务端收口**：数据源只接受发布件声明的实体、字段、算子与排序字段；用户值全部参数绑定，行级权限编译为 SQL 条件，编译失败按拒绝处理。
- **动作能力随页面下发**：页面响应同时返回定义与当前用户可执行动作，前端仅做展示/禁用，后端执行时仍按同一份权限再次校验。
- **H5 与桌面共用运行时**：H5 只是独立路由壳，仍读同一发布件与 JWT 会话；不复制页面渲染器，移动适配集中在壳层与通用渲染器的断点样式。
- **小程序独立原生渲染**：使用 uni-app Vue3 重建移动端渲染层，不嵌入 H5 WebView；共享发布件与接口契约，登录态、导航与组件能力按小程序生命周期单独实现。

## 已知边界

- 三个设计器只负责元数据编辑、校验与发布，不含运行时执行。
- 动作执行器已支持同步 REST / mock 与分支、循环、子动作；`parallel` 已使用受控线程池并发执行，分支各自提交事务；`transaction` 已接入数据库保存点。
- 数据库连接器只支持 PostgreSQL 只读查询；不提供写入、事务脚本或多语句执行。
- 签名模板只提供常用占位符（`{method}` / `{path}` / `{body}` / `{timestamp}` / `{tenant}`），不支持自定义签名算法插件。
- 密钥没有历史版本，轮换会直接覆盖旧密文；主密钥丢失后已有密钥无法解密。连接器审计保留最近变更，暂无自动归档策略。
- `validate` 已在服务端执行；前端交互步骤仍记为 skipped。`code` 仅按注册入口表放行（当前 `calcWorkdays`），`custom` 仅分派平台注册处理器（当前内置 `platform.uuid` / `platform.now`）。`kind=internal` 已分派实体 save/get/patch、流程终止、`findStale` 与 `findOverlap`；其余内部 API 尚未接入。
- 动作日志按租户隔离并可按实例/动作/状态查询，暂无跨应用全局检索与保留期策略；重放不撤销已发生的业务/流程副作用。
- 办理人解析优先查组织架构（部门负责人 / 角色成员），静态目录仅在 `LCP_RUNTIME_FALLBACK_DIRECTORY=true` 时兜底。
- 提交 / 审批 / 动作执行已做按钮级授权；加签尚未实现，任务归属仍由 Flowable `assignee` 控制。
- SSO 已接入 OIDC / CAS，但未实现 SLO、刷新令牌、IdP 组同步与解绑管理界面；CAS 仅完成协议实现，尚未对真实 IdP 做链路测试。已有 JWT 在改密后不会服务端撤销，需等待过期或前端主动退出。
- 认证审计暂无分页与保留期策略，`limit` 上限内一次返回。
- 发布态渲染器已接入实体数据源、搜索/分页/排序、行操作、详情与流程时间线；菜单中的外部链接仍直接新开窗口。
- H5 应用壳复用同一 SPA 与 JWT 会话，尚未独立部署 / PWA，无离线缓存；窄屏表格采用横向滑动，暂未卡片化重排。
- 小程序端已执行交互步骤中的 `apiCall`（受页面引用链与 ACL 约束）；`x-upload` / `x-attachment-list` 已接入运行时附件接口（页面 ACL、类型白名单、大小上限、软删除）；审批时间线已接入流程实例接口。审批办理页的 `x-process-form` / `x-approval-actions` 仍为占位，小程序暂不能直接完成审批。
- 微信小程序构建需用微信开发者工具导入 `miniapp/dist/build/mp-weixin`；尚未配置 AppID、真机域名与体验版上传。非 H5 默认 API 为 `http://127.0.0.1:8080/api/v1`，真机联调需设置 `VITE_API_BASE_URL` 并使用可访问的局域网地址或 HTTPS 域名。
- “新建请假 → 提交 → 撤回”已跑通：`startFlow`、`completeTask`、内部实体读写与流程终止可用；节假日服务已接入真实日历并按年缓存，外部接口失败时降级为仅排除周末并返回 warning。`transaction` 已接入数据库保存点；`parallel` 已支持受控并发与声明顺序合并；`custom` 已接入注册式处理器。
- 通知已覆盖站内信、webhook / email outbox、`Rule.kind=notification` 与 SLA 提醒；`autoApprove` / `autoReject` 仍未实现，通知规则暂无实例规则做端到端实测，outbox 暂无管理界面与保留期策略。
- 自定义组件已支持内联沙箱与 `runtime=remote` 远程模块；远程模块需自行保证可跨域访问，且模块必须自包含（blob import 不解析相对依赖）。设计器仍以内联预览为主，远程模块在工作台无网络时回退为明确错误态。
- OSS STS 临时凭证服务未实现，生成代码里只有直传骨架；BFF 附件当前落本地卷（`LCP_ATTACHMENT_DIR`），多副本需共享存储或切换 OSS provider。
- 生成前端已使用平台 JWT；SSO 登录仍需按项目替换 `stores/session.ts` 的登录入口，生成器暂不产出 IdP 回调页。
- 导出包使用内置 ZIP 写入器，暂不支持 zip64；单个包超过 4GB 需拆分。版本对比只比较 Bundle 元数据，不比较生成代码或依赖锁文件。
- 校验器残留警告：内联枚举与共享枚举取值不一致；流程监听器未限定 `taskKey`。

## 下一步（建议直接开工）

阶段 4–7 已完成，按以下顺序推进：

1. 阶段 8 集成与扩展：自定义 TS 代码钩子、AI 辅助生成。
2. 阶段 9 市场：页面模板、应用与组件市场。

## 恢复上下文的顺序

1. `AGENTS.md` —— 工作约定与命令。
2. 本文件 —— 进度与下一步。
3. `git log --oneline -8` —— 最近模块。
4. `docker ps` + `PROGRESS.md` 的环境快照 —— 确认服务在线。
