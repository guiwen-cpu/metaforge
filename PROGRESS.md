# MetaForge · 进度快照

> 最后更新：2026-10-20
> 分支：`dev` ｜ 最新提交：`b457c8e docs: 同步字段改名修复提交号`
> 用途：新会话接手时，读完本文件即可恢复上下文。

## 环境快照

| 项 | 值 |
|---|---|
| 设计器地址 | `http://localhost:8080` |
| CDP 调试 | `http://127.0.0.1:9222` |
| 演示应用 | `eb84d4bd-461f-4945-9f76-7d69ce732d8b`（请假审批 / `leave_approval_demo`） |
| 租户 / 用户 | `tenant_demo_school` / `alice` |
| 容器 | `metaforge-web` / `metaforge-bff` / `metaforge-postgres` / `metaforge-redis` |
| 当前草稿 | `r8`：3 个页面、1 个自定义组件 `biz-card`、逻辑编排完整 |
| 发布版本 | `v7`（内容等同 `v1`；`v2/v4/v6` 为冒烟临时版本，`v3/v5/v7` 为回滚快照） |
| 演示数据 | 请假实例若干（已通过 / 已驳回 / 待审批）；冒烟实例 `ef3ea1e4-cbbe-11f1-ab05-eac30cd331c5` 含 3 条动作日志；`/leave/requests` 底部挂有 `biz-card` 联调节点 |
| 审批入口 | `/apps/<appId>/approvals`；详情 `/approvals/:taskId`，实例 `/instances/:instanceId` |
| 动作执行 | `POST /api/v1/runtime/apps/{appId}/actions/{actionKey}/execute` |
| 动作日志 | `GET /api/v1/runtime/apps/{appId}/action-runs`（按 `processInstanceId` / `actionKey` / `status` 过滤）；详情 `GET .../action-runs/{id}` |
| 失败重放 | `POST /api/v1/runtime/apps/{appId}/action-runs/{id}/replay` |
| 站内通知 | `GET /notifications`、`GET /notifications/unread-count`；`POST /notifications/{id}/read`、`POST /notifications/read-all` |
| 登录入口 | `http://localhost:8080/login`；账号 `alice/alice123`、`bob/bob123`、`principal/principal123`、`hr/hr123` |
| 身份 API | `POST /api/v1/auth/login`、`GET /api/v1/auth/me`、`GET /api/v1/platform/identity/overview?appId=<id>` |
| 认证安全 API | `GET /api/v1/auth/password-policy`、`POST /api/v1/auth/password`、`GET /api/v1/platform/identity/auth-audits`（管理员，支持 `eventType` / `username` / `success` / `limit`） |
| 登录保护 | 连续失败 5 次锁定 15 分钟；密码 8–128 位，须含小写字母与数字，禁止空白及登录名/显示名 |
| 权限模式 | 开发：`LCP_AUTH_DEV_HEADERS=true`、`LCP_IDENTITY_ALLOW_ALL=true`；staging/prod 覆盖层已置 `false` |

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
| 本轮提交 | 认证安全：密码策略 / 登录锁定 / 认证审计 | typecheck / build + 弱密码 400 + 锁定与重置 + 审计 403 + CDP 改密 |

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

### 2. 出码引擎（部分）
- `tools/gen-*.mjs`：DataSchema → PG DDL、TS/Java 实体、BFF CRUD、TS 客户端、Vue3 CRUD 页面（含 OSS 直传代码）。
- 示例产物：`codegen/leave_approval/`。
- **未完成**：Bundle 整体 → 可运行工程导出、CLI、压缩包与版本对比。

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

## 剩余路线图

### 阶段 4 · 运行时与工作流（进行中）
- [x] 4.1 Flowable 运行时：发布时部署 BPMN（来自 `logicSchemas.flows`），实例启动/查询已通；挂起/激活未做。
- [x] 4.2 任务 API：待办/已办/我发起、签收、完成、转办、变量、历史时间线已完成；加签未做。
- [x] 4.3 逻辑执行器：动作步骤同步执行（assign / branch / loop / parallel 串行兼容 / callAction / transaction 顺序 / delay / log / emit / fail），REST 与 mock API 已接入，支持超时、重试、路径/查询/头/体、`successWhen`、响应映射、`resultPath` / `assignTo`；内部/数据库 API 与脚本类步骤明确失败。
- [x] 4.4 表达式引擎：按注册表白名单求值 97 个函数、14 个取值根；支持 `$lit/$ref/$fn/$tpl/$if`、路径、`filter/map` 子作用域、`$now` 冻结；未知函数、错误元数、未知根均抛错。
- [x] 4.5 审批页：审批中心（待办/已办/我发起）、详情（表单 + 时间线 + 审批动作）已完成；办理人解析已接组织架构，静态目录仅作兜底。
- [x] 4.6 运行时事件与回调：流程状态回写已完成；站内通知（任务分派 / 转办 / 退回 / 驳回 / 通过）落库，支持未读数、单条已读、全部已读；审批中心增加通知面板与未读角标。邮件 / webhook 通道未接入。
- [x] 4.7 动作回写与运行日志：动作结果可回写流程变量/业务字段并按成功/失败声明推进任务；运行日志持久化，支持实例/动作/状态查询、详情与失败重放；结束实例变量可从历史表读取。

### 阶段 5 · 权限体系
- [x] 5.1 用户、角色、组织架构（部门/岗位）：身份表 + 演示数据 + BFF CRUD + `IdentityPage`。
- [x] 5.2 按钮权限与字段权限：提交 / 审批 / 动作执行按 Bundle 授权；DataSchema 字段白名单过滤读与写。
- [x] 5.3 行级数据权限：本人 / 部门 / 部门子树 / 全校 / 自定义条件。
- [x] 5.4 JWT 登录与 Bearer 会话，替换演示会话头；请求头仅保留开发兜底。
- [ ] 5.5 菜单权限：Bundle `menu/page` 授权已建模，控制平面入口已按角色显隐；运行时菜单渲染待阶段 6。
- [ ] 5.6 SSO（OIDC / CAS）接入。
- [x] 5.7 密码策略、登录锁定与认证审计：策略校验、失败锁定、自助改密与管理员审计查询已完成。

### 阶段 6 · 多端发布与运行时
- [ ] 发布态运行时渲染器（读 Bundle 渲染，不依赖设计器）。
- [ ] Web / H5 应用壳与路由、登录态。
- [ ] 小程序端（Taro 或原生）。
- [ ] 自定义组件远程模块加载（`runtime=remote` + SRI 校验）。

### 阶段 7 · 出码引擎完整化
- [ ] Bundle → 完整可运行工程（前端 + BFF + 迁移脚本）。
- [ ] 出码 CLI、参数化、增量导出。
- [ ] 导出包与在线版本的 diff。

### 阶段 8 · 集成与扩展
- [ ] 连接器注册表（HTTP / 数据库 / 第三方服务）。
- [ ] 租户级密钥与凭证管理。
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
- **动作执行边界**：运行时只读发布件 `logicSchemas`；前端交互与校验步骤跳过，脚本类步骤明确失败，不做静默降级。
- **动作回写两段式**：动作只产出 `writeback` 声明，`ActionRunService` 统一求值并执行变量/业务回写；任务推进仅在声明 outcome 且办理人匹配时发生，回写与推进各自记录 applied 结果。
- **动作日志与重放**：每次执行落一行 `lcp_action_run`，保存原始入参/上下文/事件与 trace；重放复用原始输入并写 `replayed_from`，不撤销上一次副作用。
- **API 单点收口**：动作不内联 URL，只引用 Api 工件；REST 直连，内部/数据库等待连接器与密钥库。
- **表达式安全**：白名单函数 + 注册取值根，叠加步数、调用层级、动作超时与延迟上限。
- **通知首版只做站内信**：通知与审批动作同事务写入，按「租户 + 用户 + 类型 + 业务对象」对未读去重；邮件 / webhook 需要连接器与密钥库，暂不阻塞审批。
- **通知触发点跟随业务事务**：任务分派、转办、退回、驳回、通过由 `ProcessRuntimeService` 显式触发，不在 Flowable 监听器里直接写库。
- **JWT 是唯一生产身份源**：`TenantFilter` 校验 Bearer JWT 后写入 `TenantContext`；`X-Tenant-Id` / `X-User-Id` 只在 `lcp.auth.dev-headers=true` 时兜底，staging/prod 覆盖层显式关闭。
- **角色绑定与权限定义分离**：组织表只回答「谁拥有哪个角色」，角色、权限、字段白名单与行级条件全部来自发布件；运行时不在代码里硬编码角色。
- **字段权限取并集**：同一用户命中多个授权时，可读字段取并集；显式字段白名单优先于角色默认范围；写入同样过白名单，避免审批表单放大权限。
- **动作授权**：流程启动校验 `onSubmit` 对应 action 的 `execute`，审批校验 `onApprove` 的 outcome；动作执行器校验 action 的 `execute`，越权统一 403。
- **密码与锁定参数化**：策略长度/字符要求与失败阈值、锁定时长走 `lcp.auth.password-policy.*` / `lcp.auth.lockout.*` 配置，默认值可直接用于演示环境。
- **审计与认证同事务**：登录成功、失败与改密在同一事务写入 `lcp_auth_audit`，失败记录不阻断原异常返回；审计读取仅限管理员并受租户隔离。

## 已知边界

- 三个设计器只负责元数据编辑、校验与发布，不含运行时执行。
- 动作执行器已支持同步 REST / mock 与分支、循环、子动作；`parallel` 仍顺序执行，`transaction` 未包数据库事务。
- 内部 / 数据库 / GraphQL / SOAP API 尚未接连接器，调用时明确返回 `UNSUPPORTED_API`，不执行裸 SQL；带密钥库的鉴权方式同样未开放。
- `validate` 与前端交互步骤在服务端记为 skipped；`code` / `custom` / `startFlow` / `completeTask` 明确报未接入。
- 动作日志按租户隔离并可按实例/动作/状态查询，暂无跨应用全局检索与保留期策略；重放不撤销已发生的业务/流程副作用。
- 办理人解析优先查组织架构（部门负责人 / 角色成员），静态目录仅在 `LCP_RUNTIME_FALLBACK_DIRECTORY=true` 时兜底。
- 提交 / 审批 / 动作执行已做按钮级授权；加签尚未实现，任务归属仍由 Flowable `assignee` 控制。
- SSO 未接入，控制平面登录仍是账号密码 + JWT；已有 JWT 在改密后不会服务端撤销，需等待过期或前端主动退出。
- 认证审计暂无分页与保留期策略，`limit` 上限内一次返回。
- Bundle 的 `menu/page` 授权尚未在运行时渲染器消费；当前只影响控制平面入口显隐。
- 通知仅覆盖任务分派、转办、退回、驳回、通过；邮件 / webhook 通道、`Rule.kind=notification` 规则挂载、SLA 超时提醒与全局未读入口未接入。
- 自定义组件只有设计器内联沙箱预览；发布态远程组件加载未实现。
- OSS STS 临时凭证服务未实现，生成代码里只有直传骨架。
- 生成前端示例仍使用演示会话；控制平面已切 JWT，但出码模板未同步。
- 校验器残留警告：内联枚举与共享枚举取值不一致；流程监听器未限定 `taskKey`。

## 下一步（建议直接开工）

阶段 4 与阶段 5 主体已完成，按以下顺序推进：

1. 阶段 5 收尾：SSO（OIDC / CAS）；把 Bundle `menu/page` 授权接到运行时菜单。
2. 补连接器注册表与租户密钥库，再开放 internal / database / GraphQL / SOAP 与 bearer/apiKey 鉴权。
3. 扩展通知：邮件 / webhook 通道、`Rule.kind=notification` 规则挂载、SLA 超时提醒与全局未读入口。
4. 阶段 6 发布态运行时渲染器与自定义组件远程加载。
5. 出码模板同步 JWT 会话与组织权限，替换生成前端的演示会话。

## 恢复上下文的顺序

1. `AGENTS.md` —— 工作约定与命令。
2. 本文件 —— 进度与下一步。
3. `git log --oneline -8` —— 最近模块。
4. `docker ps` + `PROGRESS.md` 的环境快照 —— 确认服务在线。
