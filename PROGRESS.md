# MetaForge · 进度快照

> 最后更新：2026-10-19
> 分支：`dev` ｜ 最新提交：`547916f feat(studio): 自定义组件注册与 iframe 沙箱`
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
| 演示数据 | `/leave/requests` 页面底部已挂一个 `biz-card` 节点（自定义组件联调产物） |

启动与重建：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
cd platform; npm run typecheck; npm run build
```

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

### 5. 页面设计器
- `platform/src/pages/PageDesignerPage.vue`
- `platform/src/lib/uiModel.ts`、`platform/src/components/preview/UiNodeRenderer.vue`、`platform/src/components/designer/NodeOutline.vue`
- 页面类型模板（列表/表单/详情/看板/审批/报表）、画布、属性面板、数据源、结构树、校验、JSON、草稿与发布。
- 组件注册表动态注入：`registerCustomComponents()`。

### 6. 逻辑编排设计器
- `platform/src/pages/LogicDesignerPage.vue`
- `platform/src/lib/logicModel.ts`、`platform/src/components/logic/*`
- 动作、API、Flowable 流程、规则；23 种步骤、嵌套步骤、表达式、校验、JSON、草稿与发布。
- 仅元数据，**没有运行时执行器**。

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

## 剩余路线图

### 阶段 4 · 运行时与工作流（下一步）
- [ ] 4.1 Flowable 运行时：发布时部署 BPMN（来自 `logicSchemas.flows`），流程实例启动/查询/挂起。
- [ ] 4.2 任务 API：待办/已办、签收、完成、转办、加签、变量、历史。
- [ ] 4.3 逻辑执行器：动作步骤运行（HTTP / DB / 分支 / 循环 / 表达式 / 延迟），API 编排执行。
- [ ] 4.4 表达式引擎：基于 `schema/expression-registry.json` 的安全求值。
- [ ] 4.5 审批页：审批中心（待办/已办/我发起）、详情（表单 + 时间线 + 审批动作）、人员选择。
- [ ] 4.6 运行时事件与回调：流程状态回写业务表、消息/通知。

### 阶段 5 · 权限体系
- [ ] 用户、角色、组织架构（部门/岗位）。
- [ ] 菜单权限、按钮权限、字段权限。
- [ ] 行级数据权限（部门 / 本人 / 自定义规则）。
- [ ] JWT / SSO 接入，替换演示会话头。

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

## 已知边界

- 三个设计器只负责元数据编辑、校验与发布，不含运行时执行。
- 逻辑编排的 Flowable BPMN 目前只是资产映射，未部署到引擎。
- 自定义组件只有设计器内联沙箱预览；发布态远程组件加载未实现。
- OSS STS 临时凭证服务未实现，生成代码里只有直传骨架。
- 生成前端使用演示会话，不能用于生产鉴权。
- 校验器残留警告：内联枚举与共享枚举取值不一致；流程监听器未限定 `taskKey`。

## 下一步（建议直接开工）

阶段 4 第一刀：**Flowable 运行时 + 审批中心 API**

1. BFF 增加 `runtime` 模块：流程定义部署、实例启动、任务查询/完成、历史查询。
2. 发布动作挂钩：`logicSchemas.flows` → 自动部署 BPMN，记录 deploymentId / processDefinitionKey。
3. 新增审批中心页面与审批详情页，接任务 API，跑通「请假提交 → 待办 → 审批 → 归档」闭环。
4. 用 `leave_approval` 演示应用做端到端验证，补 CDP 冒烟脚本。

## 恢复上下文的顺序

1. `AGENTS.md` —— 工作约定与命令。
2. 本文件 —— 进度与下一步。
3. `git log --oneline -8` —— 最近模块。
4. `docker ps` + `PROGRESS.md` 的环境快照 —— 确认服务在线。