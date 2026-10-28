# MetaForge 前端接手指南

> 面向对象：接手 `platform/`（低代码设计器）的前端同学。
> 目标：半天建立全局认知，3 天跑通主链路，1 周能独立改需求。
> 依据：`dev` 分支 2026-10-28 的代码（`cbd6e2d`）。文档与代码冲突时以代码为准，并顺手修正文档。

---

## 0. 先用 30 分钟建立认知

### 一句话理解产品

MetaForge 是面向学校教务与公司办公的低代码平台：业务人员/实施同学在设计器里配数据模型、页面和流程，平台把配置保存成一份 **Bundle（元数据）**，再统一驱动「设计器预览、发布后的 Web/H5/小程序运行时、代码生成」。

### 四个必须记住的事实

1. **元数据唯一真源是 Bundle。** 设计器不另存一份模型，所有产物都落到 `bundle.artifacts.*`（`dataSchemas` / `uiSchemas` / `logicSchemas` / `components`，另有 `enums`、`roles`、`permissions`、`semantic`）。菜单在 `bundle.navigation`。
2. **控制平面、运行时、出码共用同一份 Bundle。** 所以改协议要先改 `schema/*.schema.json`，再改前端/Java 类型，最后改界面。
3. **变更必须走「草稿 → 发布 → 版本快照」。** 设计器只改草稿；运行时只读发布件；回滚 = 用历史内容发布一个新版本。
4. **设计器渲染和运行时渲染是两套代码。** `components/preview/UiNodeRenderer.vue` 负责所见即所得；`components/runtime/*` 负责真实数据、权限、动作和流程。改样式/契约时两边都要看。

### 接手当天就做这三件事

1. 打开 `https://localhost:8443`（自签证书需信任）或 `http://localhost:8080`。
2. 用演示账号 `alice / alice123` 登录，进入「请假审批演示」应用。
3. 依次点：页面设计器 → 运行预览 → 新建一条请假 → 用 `bob / bob123` 到审批中心审批。走完这一条，产品心智就有了。

> 演示环境会变：应用 ID、草稿 revision、发布版本号以 `PROGRESS.md` 的「环境快照」和 API 返回为准，不要背数字。

---

## 1. 推荐阅读顺序

### 1.1 产品视角（约半天）

| 顺序 | 看什么 | 为什么 |
|---|---|---|
| 1 | `PROGRESS.md` | 当前做到哪、演示账号、环境地址、已知边界 |
| 2 | 打开站点把「请假审批」主链路点一遍 | 先知道产品长什么样，代码才有落点 |
| 3 | `PLATFORM.md` 的「草稿/发布/版本/回滚」章节 | 控制平面数据流，注意其中请求头描述已过时 |
| 4 | `PROTOCOL.md` + `schema/bundle.schema.json` | 协议全貌；不用逐字读，先看字段分组 |
| 5 | `schema/ui.schema.json`、`data.schema.json`、`logic.schema.json` | 设计器真正编辑的三份结构 |

### 1.2 代码视角（约 1 天）

按这个顺序读，能最快建立「路由 → 请求 → 模型 → 渲染」的闭环：

| 顺序 | 文件 | 关注点 |
|---|---|---|
| 1 | `platform/src/main.ts` | 应用装配：Pinia、Router、Element Plus 中文包 |
| 2 | `platform/src/router/index.ts` | 全部页面与登录守卫 |
| 3 | `platform/src/layouts/StudioLayout.vue` | 左侧导航、应用切换、全局通知、修改密码 |
| 4 | `platform/src/lib/http.ts` + `lib/session.ts` | BaseURL、Bearer、401、会话过期 |
| 5 | `platform/src/api/platform.ts` | 控制平面 API 清单（草稿/发布/版本/回滚） |
| 6 | `pages/ModelDesignerPage.vue` + `lib/dataModel.ts` | 最独立的设计器，适合先读 |
| 7 | `pages/PageDesignerPage.vue` + `lib/uiModel.ts` | 最复杂：组件树、属性面板、事件 |
| 8 | `pages/LogicDesignerPage.vue` + `lib/logicModel.ts` | 动作、流程、规则、表达式 |
| 9 | `pages/RuntimeShellPage.vue` + `components/runtime/*` | 运行时如何消费发布件 |
| 10 | `pages/ApprovalCenterPage.vue`、`InstanceDetailPage.vue` | 审批与运行日志 |

### 1.3 读大文件的正确姿势

`ModelDesignerPage.vue`（约 1700 行）、`PageDesignerPage.vue`（约 1800 行）、`LogicDesignerPage.vue`（约 2100 行）不要从头顺读。先找三段：

1. `<script setup>` 顶部的 `load()` / `save()` / `publish()` —— 数据怎么进出。
2. 中间的 `computed` 与 `watch` —— 本地编辑态和派生数据。
3. `<template>` 的分栏结构 —— 左（列表/大纲）、中（画布）、右（属性面板）。

设计器的领域逻辑尽量在 `lib/*Model.ts`，页面只做编排。遇到复杂校验先查 `lib`。

---
## 2. 目录地图

### 仓库根

| 目录/文件 | 作用 | 前端何时会碰 |
|---|---|---|
| `schema/` | 协议 JSON Schema + 表达式注册表，唯一真源 | 加字段类型、加步骤、改契约 |
| `registry/` | 内置组件/表达式注册表 | 新增内置组件、核对组件 props |
| `platform/` | 设计器前端（本指南主角） | 日常开发 |
| `bff/` | Spring Boot BFF，控制平面与运行时 API | 排查接口、加后端能力 |
| `java/` | Schema 协议 Java 绑定 | 协议字段改动时同步 |
| `ts/` | 前端协议类型绑定 | 协议字段改动时同步 |
| `codegen/`、`tools/` | 出码产物、校验与脚本 | 跑 `node tools/validate.mjs` |
| `miniapp/` | uni-app 小程序运行时 | 只在改小程序时看 |
| `deploy/` | Compose、Nginx、staging/prod | 本地全栈、发布 |

### `platform/src/` 内部

| 路径 | 作用 |
|---|---|
| `main.ts` | 应用入口 |
| `router/index.ts` | 路由表 + 登录守卫 |
| `layouts/StudioLayout.vue` | 设计器外壳：侧栏、顶栏、通知、账号 |
| `pages/` | 15 个页面（见下一节路由表） |
| `components/designer/` | 设计器专用控件（大纲、生命周期面板） |
| `components/preview/` | 设计器画布预览渲染器 |
| `components/runtime/` | 发布件运行时渲染器、动作日志、流程时间线 |
| `components/logic/` | 逻辑编排的小控件 |
| `components/component/SandboxFrame.vue` | 自定义组件 iframe 沙箱 |
| `lib/` | 领域模型与运行时核心（最重要） |
| `api/` | 按域拆分的 HTTP 封装 |
| `stores/session.ts` | Pinia 会话包装（很薄） |
| `types/` | 前端类型（bundle/data/ui/logic/component） |
| `data/builtinComponents.json` | 内置组件的前端副本 |
| `styles/` | 全局样式与 Tailwind 入口 |

### `lib/` 速查

| 文件 | 职责 |
|---|---|
| `dataModel.ts` | 实体/字段/关系/索引的增删改、默认值、key 重命名联动 |
| `uiModel.ts` | 组件树操作、页面模板、节点默认值、实体引用 |
| `logicModel.ts` | 动作/流程/规则/步骤操作与校验 |
| `componentModel.ts` | 自定义组件契约、校验、预设 |
| `runtimeModel.ts` | 动作定义归一化、可见/禁用/权限判断 |
| `runtimeExpression.ts` | 表达式求值、内置函数、数据绑定 |
| `runtimeContext.ts` | 运行时根上下文装配 |
| `runtimeNavigation.ts` | 菜单、路由路径解析、发布件页面链接 |
| `runtime.ts` | 运行时类型/工具 |
| `pageHandlers.ts` | 生命周期事件、handler 三选一、模板 |
| `codeSandbox.ts` / `codeHook.ts` | TS 代码钩子转译与沙箱执行 |
| `remoteComponent.ts` | 远程组件加载、SRI 校验 |
| `session.ts` / `http.ts` | 会话与请求 |

---

## 3. 路由与页面映射

全部路由在 `platform/src/router/index.ts`，除 `/login`、`/sso/callback` 外都由 `StudioLayout` 包裹并要求登录。

| 路径 | 页面文件 | 职责 |
|---|---|---|
| `/` | `AppListPage.vue` | 应用工作台：搜索、分页、新建、进入、删除 |
| `/apps/:appId` | `AppDetailPage.vue` | 应用概览、发布、版本列表、diff、恢复草稿、回滚、导出 |
| `/apps/:appId/model` | `ModelDesignerPage.vue` | 数据模型设计器 |
| `/apps/:appId/pages/:pageKey?` | `PageDesignerPage.vue` | 页面设计器（`pageKey` 可选） |
| `/apps/:appId/logic` | `LogicDesignerPage.vue` | 逻辑编排：动作 / API / 流程 / 规则 |
| `/apps/:appId/components` | `ComponentDesignerPage.vue` | 自定义组件 |
| `/apps/:appId/runtime` | `RuntimeShellPage.vue` | 运行预览（消费发布件） |
| `/apps/:appId/approvals` | `ApprovalCenterPage.vue` | 审批中心：待办/已办/我发起 |
| `/apps/:appId/approvals/:taskId` | `ApprovalDetailPage.vue` | 审批办理 |
| `/apps/:appId/instances/:instanceId` | `InstanceDetailPage.vue` | 流程实例详情 + 动作日志 |
| `/identity` | `IdentityPage.vue` | 组织与权限：部门/岗位/用户/角色/审计 |
| `/connections` | `ConnectionsPage.vue` | 集成连接器与密钥管理 |
| `/m/apps/:appId/:pathMatch(.*)*` | `RuntimeMobilePage.vue` | H5 运行时 |
| `/login`、`/sso/callback` | `LoginPage.vue`、`SsoCallbackPage.vue` | 公开页 |

### 运行时的两种入口

- 桌面：`/apps/{appId}/runtime?path=/leave/requests`，用查询参数 `path` 选发布件中的页面路由。
- H5：`/m/apps/{appId}/leave/requests`，路径直接对应页面路由。

发布件的导航由 `bundle.navigation`（`menus`、`defaultRoute`、`homePageRef` 等）决定，路由解析看 `lib/runtimeNavigation.ts`。**目前没有专门的菜单编辑器**，改菜单要进应用详情/草稿的原始 JSON 调整 `navigation.menus`。

---

## 4. 四个核心心智模型

### 4.1 Bundle：一份配置，四层消费

```
schema/*.schema.json       协议（字段、校验、表达式）
        ↓
BFF 控制平面                草稿、发布、版本、运行时 API
        ↓
platform 设计器             编辑 artifacts.*
        ↓
运行时 / 出码 / 小程序       只读发布快照
```

一份 `bundle.artifacts` 的常见内容：

- `dataSchemas`：数据实体、字段、关系、索引、存储
- `uiSchemas`：页面树、数据源、生命周期、弹窗
- `logicSchemas`：动作、API、流程、规则
- `components`：自定义组件定义
- `enums` / `roles` / `permissions` / `semantic`：枚举、角色、权限、语义

### 4.2 草稿 → 发布 → 版本

- 草稿：`DraftView { bundle, revision }`。每次保存 revision 递增。
- 保存：`PUT /platform/apps/{id}/draft`。revision 不匹配返回 `409 draft_conflict`，必须提示用户重新加载，不能覆盖。
- 发布：`POST /platform/apps/{id}/versions`。内容与当前发布件相同且未 `force` 时返回 `unchanged=true`。
- 恢复草稿：`POST .../versions/{no}/restore-draft`，只改草稿，不产生新版本。
- 回滚：`POST .../versions/{no}/rollback`，以历史内容**发布一个新版本**。
- diff：`GET .../versions/{from}/diff/{to}`，只比内容，数组优先按 key 配对，最多 200 条。

前端有三类发布路径，别混：

1. 应用详情页发布：服务端已保存的草稿，不传 `bundle`。
2. 页面 / 逻辑 / 组件三个设计器：把本地 `nextBundle` 直接放进请求，因此**不要求先保存**也能发布。
3. 数据模型设计器：发布前会检查 `dirty`，要求先保存草稿；它不传 `bundle`。

### 4.3 表达式与数据绑定

逻辑编排、页面绑定、运行时条件都用同一套表达式：

- 字面量 `$lit`、引用 `$ref`、函数 `$fn`、模板 `$tpl`、条件 `$if`（注意是 `$tpl`，不是 `$template`）。
- 常用根：`$user`、`$tenant`、`$page`、`$route`、`$data`、`$form`、`$row`、`$rows`、`$ctx`、`$now`、`$env`。
- 求值实现：`lib/runtimeExpression.ts`；表达式注册表在 `schema/expression-registry.json` 与 `registry/`。

### 4.4 设计器态 vs 运行时态

| | 设计器 | 运行时 |
|---|---|---|
| 数据来源 | 草稿 `getDraft` | 发布件 `runtimeApi.page` |
| 渲染器 | `components/preview/UiNodeRenderer.vue` | `components/runtime/RuntimeNodeRenderer.vue` |
| 数据源 | 主要用于预览 | 真实查询（当前 Web 仅 `entity`/`static`） |
| 动作 | 展示/编辑定义 | 真正执行，写日志、推进流程 |
| 权限 | 配置权限表达式 | `allowed_actions` + 节点 `permission` 实际拦截 |

**改组件渲染或交互时，默认两个渲染器都要同步检查。**

---
## 5. 登录、请求与会话

### 5.1 装配

`platform/src/main.ts`：

```ts
createApp(App).use(createPinia()).use(router).use(ElementPlus, { locale: zhCn }).mount("#app");
```

`App.vue` 只有 `<router-view />`，真正的壳在 `layouts/StudioLayout.vue`。

### 5.2 登录

- 登录页：`pages/LoginPage.vue`，表单含租户、用户名、密码，页面上有四个演示账号快捷按钮。
- 登录接口在 `api/identity.ts` 的 `authApi.login(tenant, username, password)`。
- 成功后 `session.setLogin(...)`：token、过期时间、tenantId、profile（含角色）。
- SSO：`/sso/callback` 由 `SsoCallbackPage.vue` 处理，换取 token 后同样写入会话。
- 守卫：`router/index.ts` 的 `beforeEach`，未登录跳 `/login?redirect=...`；已登录访问 `/login` 会回工作台。

### 5.3 会话存储

`lib/session.ts`：

- localStorage key：`metaforge.studio.session`。
- 字段：`token`、`tenantId`、`userId`、`displayName`、`expiresAt`、`roles`、`profile`。
- `isAuthenticated()` 要求 token 存在且距过期 > 30 秒（无 `expiresAt` 视为不过期）。
- `stores/session.ts` 只是 Pinia 包装；`canManageIdentity` 只认 `tenant_admin` / `school_admin`。

### 5.4 HTTP

`lib/http.ts`：

- `baseURL = /api/v1`，超时 20 秒，JSON。
- 请求只注入 `Authorization: Bearer <token>`。
- **不注入** `X-Tenant-Id` / `X-User-Id`：租户与用户身份由 token 在服务端解析。`PLATFORM.md` 里“前端注入租户/用户头”的描述已过时。
- 401：清会话并跳登录（带 redirect）。
- 所有错误统一成 `ApiError { code, status, details }`，页面用 `errorMessage(error)` 取文案。

### 5.5 401 与 403 的区别

- 401 = 未登录/登录失效 → 清会话、跳登录。
- 403 = 已登录但无权限 → 保留页面，提示后端返回的 message。排查权限时先看角色和 `allowed_actions`，不要误判成登录问题。

---

## 6. 应用工作台与应用详情

### 6.1 工作台 `AppListPage.vue`

- 列表：`platformApi.listApps({ page, size, q, status })`。
- 新建：key（唯一、创建后不建议改）、名称、描述、图标、类型、分类。
- 进入应用 → `/apps/:appId`；删除需二次确认。
- 这一页很薄，适合作为第一个“改动练手”页面。

### 6.2 应用详情 `AppDetailPage.vue`

这是控制平面的“总控台”，核心能力：

| 能力 | 说明 |
|---|---|
| 草稿 JSON 编辑 | 直接编辑/格式化完整 Bundle；改 `navigation.menus` 常在这里做 |
| 保存草稿 | 带 revision，409 时提示冲突并支持重新加载 |
| 发布 | 发布服务端已保存草稿；可勾选强制发布 |
| 版本列表 | 查看历史版本、来源（草稿/回滚等） |
| diff | 任选两个版本对比，最多 200 条差异 |
| 恢复草稿 | 历史版本 → 草稿，不产生新版本、不影响线上 |
| 回滚 | 以历史版本内容发布**新版本**，历史不被改写 |

设计器入口（数据模型/页面/逻辑/组件/运行/审批）也从这里进。

### 6.3 应用详情发布 vs 设计器发布

- 应用详情：先保存草稿，再发布；请求不带 `bundle`。
- 页面 / 逻辑 / 组件设计器：发布时把本地组装好的完整 `nextBundle` 一并提交，服务端以请求内容为准，所以“没点保存也能发布”。这意味着**发布成功后要同步本地 `savedSnapshot` 与 revision**，否则页面会一直显示“未保存”。
- 数据模型设计器：与详情页一样，必须先保存草稿，发布请求不传 `bundle`。

### 6.4 新建应用的默认 Bundle

`defaultBundle()` 会生成最小骨架（协议版本、app 元信息、空 artifacts、默认导航）。新增页面/动作前先确认骨架完整，不要手写缺字段的对象。

---

## 7. 数据模型设计器

文件：`pages/ModelDesignerPage.vue`（约 1700 行）+ `lib/dataModel.ts`（约 450 行）。**建议作为第一个精读的设计器**，因为它最少依赖其他 artifact。

### 7.1 数据结构

```
DataSchema
└── entities: DataEntity[]
    ├── key / name / titleField / enabled / access / semantic
    ├── fields: DataField[]
    ├── relations: DataRelation[]
    ├── indexes: DataIndex[]
    └── storage: StoragePolicy
```

- 新实体默认带 `id`、`name`；`titleField` 默认 `name`。
- 表名默认 `biz_<key>`（清洗后截断 63 字符）；演示应用里可被改成 `edu_leave_request`。
- 默认存储策略：主键 `id`、租户列 `tenant_id`、JSONB 列 `ext`、软删除 `deleted_at`、时间戳 `created_at`/`updated_at`。
- 字段 `storage` 默认：`ref` / `enum` 为 `column`，其他为 `jsonb`。唯一/可搜索/可排序字段应上提为 `column`。

### 7.2 19 种字段类型

`string`、`text`、`richText`、`integer`、`decimal`、`boolean`、`date`、`datetime`、`time`、`json`、`enum`、`ref`、`file`、`image`、`video`、`array`、`signature`、`location`、`formula`。

类型变化时注意同步默认值、存储方式、校验规则和页面字段组件。

### 7.3 关系与索引

- 关系端点用 `entityRef`（`{ kind: "entity", id }`）。
- 常见关系：`manyToOne` / `oneToMany` / `oneToOne` / `manyToMany`；`onDelete` 支持 `restrict` / `cascade` / `setNull`。
- 索引包含字段、唯一性、类型；引用字段建议真实列，便于外键和关联查询。

### 7.4 改字段 key 的坑

重命名字段 key 不能只改 `field.key`。用 `lib/dataModel.ts` 的 `remapFieldKey()`，它会同步：

- `entity.titleField`
- `storage.primaryKey`
- 索引字段
- 关系端点
- 其他字段的 `refField`

手改会留下悬空引用，校验能报出来但很难查。

### 7.5 校验

`validateDataSchema()` 会检查：key 合法性与重复、存储策略、唯一字段必须是真实列、JSONB 搜索/排序警告、引用字段存储建议、标题字段存在、关系端点存在等。设计器保存/发布前会跑本地校验；**warning 可以放行，error 必须处理**。

---
## 8. 页面设计器

文件：`pages/PageDesignerPage.vue`（约 1800 行）+ `lib/uiModel.ts`（约 680 行）+ `components/preview/UiNodeRenderer.vue`。这是最值得花时间的模块。

### 8.1 页面结构

```
UISchema
├── key / title / kind / version
├── route { path, ... }
├── params[]
├── dataSources[]
├── state
├── layout: UINode        // 根节点 component = "x-page"
├── dialogs
├── handlers              // 页面级生命周期
└── access
```

`UINode` 关键字段：

- `component`：组件名（内置或自定义）
- `props` / `bind`：静态属性 / 数据绑定
- `visible` / `disable`：表达式
- `children` / `slots`：子节点
- `handlers`：节点事件
- `loop`：循环渲染
- `style` / `responsive`：样式与响应式

页面类型（`PageKind`）：`list`、`form`、`detail`、`dashboard`、`approval`、`report`、`custom`、`login`、`error`。

### 8.2 新建页面与模板

`createStarterPage(kind, ...)` 会按类型生成可运行骨架：列表（查询+表格+分页+操作列）、表单（字段+提交）、详情、审批、看板等。新建后先跑一遍预览，再改细节，比从空白拖更快。

AI 生成入口在页面设计器内，`aiApi.generate({ kind: "page", ... })`。结果**只写入本地草稿树，不自动保存/发布**，必须人工检查后保存。

### 8.3 组件注册表（重要）

- 权威文件：`registry/builtin-components.json`
- 前端副本：`platform/src/data/builtinComponents.json`
- 两者当前内容与 SHA-256 一致，但**没有自动同步脚本**。新增/修改内置组件时两份都要改，否则设计器面板与协议校验会漂移。
- 组件契约以 `schema/component.schema.json` 为准；平台扩展键用 `x-` 前缀。

### 8.4 数据源

`PageDataSource.type` 支持 `entity` / `api` / `flow` / `static` / `computed`，但 **Web 运行时目前只实现 `entity` 和 `static`**，其他类型会提示“暂不支持”。设计器可以配置，不要误以为线上能用。

- `entity`：绑定数据模型实体，支持 page/list/one/count、即时加载、搜索、排序、分页。
- `static`：静态数据，适合选项、看板占位。

### 8.5 生命周期

页面级 `handlers` 支持六种事件（`lib/pageHandlers.ts`）：

| 事件 | 时机 |
|---|---|
| `onLoad` | 数据源刷新前，初始化查询条件/页面状态 |
| `onMount` | 首个数据源刷新完成后 |
| `onParamChange` | 路由参数或查询串变化，事件含 `previous` |
| `onUnmount` | 页面卸载后 |
| `onError` | 生命周期/动作/步骤抛错，事件含 `source`、`message` |
| `onBeforeLeave` | 路由离开或菜单内部跳转前，事件含 `source`、`target` |

运行时顺序：`onLoad` → immediate 数据源 → `onMount`；参数变化触发 `onParamChange`。

### 8.6 事件三选一

每个 handler（页面级或节点级）只能选一种：

1. `actionRef`：引用逻辑编排里的动作（推荐，复杂逻辑走后端）。
2. `steps`：内联步骤。
3. `code`：TS 代码钩子（仅页面级生命周期）。

**节点事件实际只执行 `actionRef` 和 `steps`，不执行 `code`。** 前端 `runSteps` 只实现 `assign / branch / emit / code / log / fail` 六类；`confirm / openDialog / closeDialog / navigate` 由执行器在动作前后单独识别。涉及 `apiCall`、`startFlow`、`transaction`、`parallel` 等，必须放进 `actionRef` 交给后端。

### 8.7 字段与表格

- 表单字段通过 `bind` / `props` 关联实体字段，注意 `entityRef` 的两种形态：数据模型侧是 `{ kind: "entity", id }`，页面/UI 侧常用 `{ kind: "entity", key, version }`（`entityRefOf`）。
- 表格列、查询条件、操作列都可带 `permission` / `visible` 表达式；运行时由 `RuntimeNodeRenderer` 结合 `allowed_actions` 判断。
- 上传字段类型对应 `file` / `image` / `video`，演示应用有附件实体可参考。

### 8.8 校验

`validateUISchema()` 检查页面 key、kind、路由、组件是否存在、必填 props、数据源引用、事件引用等。发布前必须过 error；warning 通常提示体验或契约问题。

---

## 9. 逻辑编排设计器

文件：`pages/LogicDesignerPage.vue`（约 2100 行）+ `lib/logicModel.ts`（约 960 行）。界面分四个页签：**动作 / API / 流程 / 规则**。

### 9.1 动作（Action）

```
LogicAction
├── key / name / description
├── trigger
├── params[]
├── when
├── steps[]
├── writeback
├── transaction / idempotent / timeoutMs
└── access
```

- `trigger`：`manual`、`onLoad`、`onSubmit`、`onApprove`、`onReject`、`onSchedule`、`onWebhook`、`onEntityChange`。
- `writeback`：把结果写回流程变量或业务字段。
- `access`：动作级权限。
- 页面按钮、生命周期、流程监听器都通过 `actionRef` 复用一个动作。

### 9.2 23 种步骤

`validate`、`assign`、`apiCall`、`openDialog`、`closeDialog`、`confirm`、`branch`、`loop`、`parallel`、`callAction`、`code`、`upload`、`download`、`startFlow`、`completeTask`、`print`、`transaction`、`delay`、`emit`、`log`、`fail`、`navigate`、`custom`。

后端执行全部步骤；前端预览/内联 steps 只执行第 8.6 节列出的子集。写需求时先判断“这个步骤前端要不要即时反馈”，再决定放 `actionRef` 还是内联。

### 9.3 API 与流程

- `LogicApi`：声明式 HTTP/连接器调用，供 `apiCall` 引用；连接器密钥在服务端。
- `LogicFlow`：`processKey`、`bpmnRef`、`variables`、`taskForms`、`listeners`。`bpmnRef` 指向 Bundle 资产；任务表单决定审批页展示哪些字段。

### 9.4 规则

`RULE_KINDS`：`validation`（校验）、`derivation`（派生）、`guard`（守卫）、`permission`（权限）、`notification`（通知）。

规则 = `when + then(steps) + priority + stopOnFail`。典型用法：

- 派生：根据请假天数计算结束时间/归属人。
- 校验：病假必须上传证明。
- 守卫：同一人同一时段不能重复请假。

### 9.5 表达式速记

- `$lit` 字面量、`$ref` 引用、`$fn` 函数、`$tpl` 模板、`$if` 条件。`$fn` 的参数键是 `$args`，`$if` 的分支键是 `$then` / `$else`。
- 示例：`{ "$fn": "add", "$args": [{ "$ref": "$form.days" }, 1] }`；`$fn` 支持 `eq/ne/and/or/coalesce/dateAdd/dateDiff/formatDate` 等，完整列表见 `lib/runtimeExpression.ts`。
- 上下文根：`$user`、`$tenant`、`$page`、`$route`、`$data`、`$form`、`$row`、`$rows`、`$ctx`、`$now`、`$env`。
- 预览：`lib/logicPreview.ts` 可做轻量模拟；真实执行仍要看后端日志。

### 9.6 校验与发布

`validateLogicSchema()` 检查 key 重复、步骤必填、引用是否存在、表达式结构、流程/表单/规则完整性。逻辑设计器发布时同样会把完整 `nextBundle` 提交，不要求先保存。

---
## 10. 自定义组件设计器

文件：`pages/ComponentDesignerPage.vue`（约 1100 行）+ `lib/componentModel.ts` + `components/component/SandboxFrame.vue`。

### 10.1 契约

编辑 `bundle.artifacts.components`，单个 `ComponentDef` 包含：

- `name` / `title` / `description` / `icon`
- `props`：属性定义（类型、默认值、必填、绑定能力）
- `slots`：插槽
- `events`：事件
- `capabilities`：能力声明
- `container`：容器规则（能否放子节点）
- `sandbox`：沙箱策略
- `runtime`：`builtin` / `remote` / `sandbox`
- `source` / `integrity` / `version`（远程）
- `x-previewHtml` / `x-previewScript`：设计器预览

### 10.2 三种运行时

| runtime | 说明 |
|---|---|
| `builtin` | 平台内建，直接映射到 Vue 组件 |
| `remote` | 动态加载租户 JS 包；`source` 必须含 `{version}` 占位，发布时用 WebCrypto 校验 SRI（sha256/384/512），模块必须自包含 |
| `sandbox` | iframe 隔离执行，适合不可信代码 |

### 10.3 沙箱

`SandboxFrame.vue` 使用 `iframe srcdoc` + `sandbox="allow-scripts"`，**不授予 `allow-same-origin`**，因此 iframe 处于不透明源，拿不到宿主 DOM/Cookie/Storage。CSP 默认 `default-src 'none'`，按策略放行脚本/样式/图片/连接；宿主与组件只通过 `postMessage` 通信。TS 代码钩子先转译再注入，不使用 `eval`。

### 10.4 预设

`COMPONENT_PRESETS`：`biz-card`（业务卡片）、`metric-stat`（指标卡）、`field-upload`（上传字段）、`data-table`（数据列表）。预设只是生成初始契约，不是强制模板。

> 注：演示应用的 `artifacts.components` 目前为空。`PROGRESS.md` 曾描述演示应用含 `biz-card`，以实际 API 读取结果为准；验证自定义组件时请先在设计器里新建一个。

### 10.5 校验

`validateComponents()` 检查 name 唯一、props 类型、事件、容器规则、远程 source/integrity、沙箱策略。远程组件缺 `version`、`source` 不含 `{version}`、integrity 格式错误都会直接阻止发布。

---

## 11. 运行时与审批中心

### 11.1 `RuntimeShellPage.vue` 的加载顺序

1. `platformApi.getApp(appId)` + `runtimeApi.navigation(appId)`。
2. 从 `?path=`（或 `navigation.default_route`、首个菜单）解析目标页面。
3. `resolvePageLink(navigation, path)` 找到页面 key。
4. `runtimeApi.page(appId, pageKey)` 拉取发布件的 `RuntimePageView`。
5. `registerCustomComponents(page.components)` 注册自定义组件。
6. 交给 `RuntimePageRenderer` 渲染。

运行时**只读发布件**，不读草稿。页面不在发布件里或当前角色不可见，会提示“未绑定可访问页面”。

### 11.2 `RuntimePageRenderer.vue` 职责

- 维护数据源状态、搜索/分页/排序。
- 执行生命周期、页面/节点动作。
- 处理 `confirm`、`openDialog` / `closeDialog`、`navigate`、`onBeforeLeave`。
- 动作成功后，根据动作里的界面步骤切换弹窗/页面。
- 提供 `RuntimeContextApi` 给子渲染器（`visible`、`disabled`、`permitted`、`evaluate`、`runAction`、`runHandler` 等）。

### 11.3 `RuntimeNodeRenderer.vue` 职责

- 内置组件名 → Vue 组件映射。
- `visible` / `disable` / `permission` 求值。
- 按钮级 `allowed_actions`：节点 handler 引用的动作不在允许列表时禁用。
- 自定义组件（builtin/remote/sandbox）挂载。
- 表格行点击、选择、表单提交、弹窗确认等事件派发。

### 11.4 审批中心

`ApprovalCenterPage.vue`：三个页签「待办 / 已办 / 我发起」，数量来自运行时统计；支持切换操作人查看不同角色待办（演示便利，生产由登录身份决定）。通知未读数每 30 秒轮询。

`ApprovalDetailPage.vue`：展示任务表单、流程时间线、审批意见；操作包括签收、同意、驳回、退回、转办。驳回/退回通常要求意见，具体由流程配置决定。

`InstanceDetailPage.vue`：流程实例时间线 + `ActionRunPanel`。运行日志记录动作 key、状态、入参、结果、错误、回写与重放来源；失败动作可用原始入参重放，生成一条新记录。

### 11.5 权限在运行时的三个层次

1. 路由/菜单：发布件导航只给当前角色可见的页面与菜单。
2. 动作：`allowed_actions` 决定按钮是否可用。
3. 节点/字段：`permission` 表达式决定显隐或可编辑。

后端仍会再校验一次；前端隐藏不等于安全边界。

---

## 12. 组织权限、连接器、AI

### 12.1 `IdentityPage.vue` + `api/identity.ts`

- 部门、岗位、用户、角色的 CRUD 与绑定。
- 认证审计：登录成功/失败、改密；仅管理员可读。
- 用户资料：部门、岗位、角色键；会话里的 `profile` 就来自这里。
- 入口可见性：`stores/session.ts` 的 `canManageIdentity` 只认 `tenant_admin` / `school_admin`。

### 12.2 `ConnectionsPage.vue` + `api/connections.ts`

- 连接器类型：`rest`、`graphql`、`soap`、`database`、`internal`。
- 认证：OAuth2、签名、Basic、Token、Secret 引用等；`database` / `internal` 不使用 `baseUrl`，数据库地址在 `config.jdbcUrl`。
- 密钥：列表只返回 key/元信息，**值只写不读**；编辑时留空表示不修改。
- 审计：每个连接器的调用/变更记录。
- 排查调用失败时，先确认 `secretMissing()` 提示的引用 key 是否已配置。

### 12.3 AI 辅助

`api/ai.ts`：`POST /platform/ai/generate`，`kind` 为 `form` / `page` / `flow`，超时 60 秒。返回 `provider`、`artifact`（`UISchema` 或 `LogicFlow`）、`assets`、`warnings`。

- 页面设计器：生成页面骨架，落到本地草稿树。
- 逻辑设计器：生成流程定义。
- **不会自动保存/发布**，必须人工检查 warning 与引用完整性。

---
## 13. 业务走查：请假审批（把知识串起来）

这一节用演示应用把「页面 → 动作 → 流程 → 审批 → 实例日志」串成一条线。数据来自 2026-10-28 的环境快照，**会随演示数据变化**，以实际 API 为准。

### 13.1 演示环境

| 项 | 值 |
|---|---|
| 租户 | `tenant_demo_school` |
| 应用 ID | `eb84d4bd-461f-4945-9f76-7d69ce732d8b` |
| 应用 key | `leave_approval_demo` |
| 当前草稿 | `r16` |
| 当前发布 | `v13`（2026-10-28 实测；`PROGRESS.md` 可能滞后） |

| 账号 | 密码 | 角色 |
|---|---|---|
| `alice` | `alice123` | 学生 |
| `bob` | `bob123` | 系主任 / 部门负责人 |
| `principal` | `principal123` | 院级管理员 |
| `hr` | `hr123` | 人事专员（全校只读） |

### 13.2 页面

| page key | 标题 | 类型 | 路由 |
|---|---|---|---|
| `page_leave_list` | 请假申请 | list | `/leave/requests` |
| `page_leave_form` | 新建请假申请 | form | `/leave/requests/:id?` |
| `page_leave_approval` | 请假审批办理 | approval | `/leave/approval/:taskId` |

菜单「我的请假 / 发起请假 / 待我审批」分别指向这三个页面；「考勤报表」只有占位路由，没有对应页面。平台管理菜单是演示用的设计器入口。

### 13.3 数据模型 `leave_core`

| 实体 | 表名 | 说明 |
|---|---|---|
| `employee` | `edu_employee` | 员工/学生，含部门、岗位 |
| `leave_request` | `edu_leave_request` | 请假单主表 |
| `attachment` | `edu_attachment` | 附件 |

关键关系：`leave_request.applicant_id → employee.id`，`manyToOne`，`onDelete = restrict`。这解释了为什么删除员工会被拒绝、列表能按申请人过滤。

### 13.4 逻辑 `leave_logic`：14 个动作

| 动作 | trigger | 用途 |
|---|---|---|
| `leave_open_create` | manual | 打开新建弹窗/页面 |
| `leave_open_edit` | manual | 打开编辑 |
| `leave_submit` | onSubmit | 提交请假（核心链路） |
| `leave_approve` | onApprove | 审批通过 |
| `leave_reject` | onReject | 审批驳回 |
| `leave_return` | manual | 退回修改 |
| `leave_transfer` | manual | 转办 |
| `leave_recall` | manual | 撤回 |
| `leave_batch_recall` | manual | 批量撤回 |
| `leave_export_list` | manual | 导出列表 |
| `leave_on_process_end` | onWebhook | 流程结束回调 |
| `leave_notify_task_arrived` | onWebhook | 任务到达通知 |
| `leave_cleanup_stale` | onSchedule | 清理超时数据 |
| `leave_open_detail` | manual | 打开详情 |

### 13.5 `leave_submit` 逐段拆解

实际步骤序列（来自 Bundle）：

```
assign → apiCall → code → assign → assign → validate → fail → fail
→ emit → branch → transaction → startFlow → emit → emit → navigate → assign
```

对应业务含义：

1. `assign`：置 `state.submitting`，按钮进入提交中。
2. `apiCall`：调用 `api_holiday_list` 拉取节假日，写入 `vars.holidays`。
3. `code`：`lang=ts, runtime=server`，按节假日计算工作日 `vars.workdays`（这是后端执行的服务端代码，不是浏览器钩子）。
4. `assign`：写入 `state.daysComputed` 与 `form.days`，前端即时显示天数。
5. `validate`：校验必填项。
6. 两个 `fail`：工作日 ≤ 0 报“结束时间必须晚于开始时间”；> 90 报“单次请假不得超过 90 个工作日”。
7. `emit`：有警告时弹 `ui.toast`。
8. `branch`：区分“存草稿”和“正式提交”；草稿不启动流程。
9. `transaction`：把业务写入与流程启动放进同一事务。
10. `startFlow`：启动 `leave_approval` 流程，`assignTo = vars.processInstanceId`。
11. `emit` + `navigate`：刷新列表数据源、提示成功并跳转。
12. 最后 `assign`：恢复按钮状态。

这条链路几乎覆盖了逻辑编排的所有典型能力：API、服务端代码、表达式、校验、分支、事务、流程、事件、导航。

### 13.6 流程与规则

- 流程 `leave_approval`：`processKey = leave_approval`，3 个任务表单；审批页按任务节点渲染表单。
- `rule_leave_derive_owner`（derivation）：推导申请人与部门。
- `rule_sick_proof_required`（validation）：病假必须有佐证材料。
- `rule_leave_no_overlap`（guard）：同一人请假区间不能重叠。

### 13.7 角色与权限

6 个角色：`student`、`teacher`、`dept_manager`、`school_admin`、`hr_admin`、`system`；发布件约 35 条动作权限。

权限不仅控制页面，还控制动作与字段：例如 HR 全校可读但看不到 `reason` 字段；学生只能看本人数据；跨部门读实例或代办他人任务会 403。**前端看到按钮灰掉/不显示，先查发布件的 `permissions`、角色 `dataScope` 和 `allowed_actions`，不要先怀疑渲染器。**

### 13.8 完整走查脚本

1. `alice` 登录 → 我的请假 → 看到本人列表。
2. 发起请假 → 填开始/结束时间 → 观察天数自动计算（`leave_submit` 的 code + assign）。
3. 提交 → `startFlow` 后跳回列表，新单出现在“我发起”。
4. 退出，`bob` 登录 → 待我审批 → 签收 → 同意/驳回。
5. 打开实例详情 → 看流程时间线与 `ActionRunPanel`；失败动作可重放。
6. 回到应用详情 → 版本列表/diff，观察这次操作是否产生新版本（运行时操作不会改 Bundle）。

---

## 14. 常见改动配方

### 14.1 给现有实体加一个字段

1. `ModelDesignerPage`：选实体 → 加字段 → 选类型/存储 → 保存草稿。
2. 如果是 `ref` / `enum` / 唯一/搜索/排序字段，存储用 `column`；其他可先用 `jsonb`。
3. `PageDesignerPage`：在表单/表格/详情节点里加对应字段节点或列，绑定同一 `entityRef`。
4. 逻辑/规则若依赖该字段，补表达式与校验。
5. 本地校验 → 发布。
6. 新增**真实列**或新实体时，确认数据库迁移（`sql/`、`tools/gen-*`）；JSONB 字段通常不需要单独 DDL。拿不准先问后端。

### 14.2 新增一个页面

1. 页面设计器 → 新建 → 选类型（list/form/detail/approval…）→ 用模板生成骨架。
2. 配 `route.path`、`params`、数据源、字段/表格、页面生命周期。
3. 页面 key 必须唯一；发布前跑校验。
4. 把页面加进菜单：应用详情 → 草稿 JSON → `navigation.menus` 增加节点，填 `pageRef`、`path`、`roles`、`visible`、`order`。
5. 发布 → 运行预览按 `?path=` 访问验证；H5 用 `/m/apps/{appId}{path}`。

### 14.3 新增一个按钮动作

1. 逻辑设计器 → 动作 → 新建，填 key/name/trigger/params/steps。
2. 需要权限时配 `access`，需要回写时配 `writeback`。
3. 页面设计器 → 选中按钮 → 事件 → 动作引用 → 选该动作；需要参数时在 handler 的 `params` 里用表达式传。
4. 校验并发布；运行时按钮会根据 `allowed_actions` / `permission` 自动禁用。
5. 若动作涉及 `apiCall` / `startFlow` / `transaction` / `parallel`，不要写成节点内联 steps。

### 14.4 新增一条校验/派生/守卫规则

1. 逻辑设计器 → 规则 → 新建，选 `kind`。
2. 绑定 `entityRef`，写 `when`，在 `then` 里放 `fail` / `assign` / `validate` 等步骤。
3. 配 `priority` 与 `stopOnFail`；校验类通常 `stopOnFail = true`。
4. 在表单提交或实体变更路径上确认规则会被触发（`on` 字段/后端求值点）。
5. 用演示数据构造通过/失败两条用例。

### 14.5 改菜单

目前没有菜单编辑器。应用详情 → 草稿 JSON → `bundle.navigation`：

- `menus[]`：`key`、`title`、`icon`、`order`、`roles`、`visible`、`children`、`pageRef`、`path`、`url`。
- `defaultRoute`、`homePageRef`、`breadcrumb`、`tabs`。
- `pageRef` 用 `{ kind: "page", key, version }`；`path` 必须与页面 `route.path` 模板匹配。
- 改完保存并发布；运行时菜单只读发布件。

### 14.6 改内置组件

1. 改 `registry/builtin-components.json`（权威契约）。
2. 同步 `platform/src/data/builtinComponents.json`（当前无自动脚本）。
3. 改设计器预览 `components/preview/UiNodeRenderer.vue`。
4. 改运行时 `components/runtime/RuntimeNodeRenderer.vue`。
5. 如影响协议/类型，改 `schema/component.schema.json`、`ts/`、`java/`，并跑 `node tools/validate.mjs`。
6. 出码相关还要跑 `tools/gen-*`，确认生成物与契约一致。

### 14.7 改审批流程

1. 逻辑设计器 → 流程：改 `processKey`、`bpmnRef`、`variables`、`taskForms`、`listeners`。
2. BPMN 资产放进 Bundle 资产并在 `bpmnRef` 引用；任务表单决定审批页字段。
3. 动作侧检查 `startFlow` / `completeTask` 的 `flowRef`、`assignTo`、`when`。
4. 审批动作的 `onApprove` / `onReject` 要覆盖通过、驳回、退回、转办、撤回。
5. 用两个账号跑完整流程，再看实例时间线与动作日志。

---
## 15. 本地启动与调试

### 15.1 只跑前端

```powershell
cd platform
npm install
npm run dev          # http://localhost:5175
```

Vite 把 `/api` 代理到 `http://localhost:8080`；需要指向别的后端时：

```powershell
$env:VITE_PROXY_TARGET = "https://localhost:8443"
npm run dev
```

前端本身不保存业务数据，BFF 不在线时只能看到登录页/报错。

### 15.2 全栈

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml build web
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --force-recreate web
```

- 站点：`http://localhost:8080`
- 设计器 HTTPS：`https://localhost:8443`（自签证书）
- 改完前端重建 `web` 容器，不要只重启。

### 15.3 校验与构建

```powershell
cd platform
npm run typecheck
npm run build

cd ..
node tools/validate.mjs
git diff --check
```

提交前至少跑 `typecheck` + `build` + `validate.mjs`（纯文档改动可跳过前两项）。

### 15.4 后端与 Java

```powershell
mvn -q -f java/pom.xml compile
mvn -q -f bff/pom.xml -DskipTests package
```

排查接口问题看 BFF 日志；`GET /actuator/health/readiness` 只代表进程就绪，不代表业务数据正确。

### 15.5 浏览器调试

- Vue Devtools 看组件树与 Pinia；设计器状态大多在页面局部 `ref`，不在 store。
- Network 面板重点看 `PUT /draft`（409）、`POST /versions`（unchanged）、`POST /actions`（运行时动作）。
- 登录异常先清 `localStorage['metaforge.studio.session']`，再看 token 是否过期。
- 需要自动化时可用 CDP `http://127.0.0.1:9222`（Chrome 需以远程调试端口启动；Node 22 自带 WebSocket）。

### 15.6 常用接口速查

| 接口 | 用途 |
|---|---|
| `GET /api/v1/platform/apps` | 应用列表 |
| `GET /api/v1/platform/apps/{id}` | 应用详情 |
| `GET /api/v1/platform/apps/{id}/draft` | 草稿 + revision |
| `PUT /api/v1/platform/apps/{id}/draft` | 保存草稿（带 revision） |
| `POST /api/v1/platform/apps/{id}/versions` | 发布 |
| `GET /api/v1/platform/apps/{id}/versions` | 版本列表 |
| `GET .../versions/{from}/diff/{to}` | 版本 diff |
| `POST .../versions/{no}/restore-draft` | 恢复草稿 |
| `POST .../versions/{no}/rollback` | 回滚发布 |
| `GET /api/v1/runtime/apps/{id}/navigation` | 运行时导航（以实际 `api/runtime.ts` 为准） |
| `GET /api/v1/runtime/apps/{id}/pages/{key}` | 运行时页面 |
| `POST /api/v1/runtime/apps/{id}/actions/{key}/execute` | 执行动作 |

> 具体前缀以 `platform/src/api/runtime.ts` 为准；上表用于定位，不代替读代码。

---

## 16. 常见坑与自检

### 16.1 文档过时

已有两处明确过时，读到时以代码为准：

- `platform/README.md` 仍写“数据模型/页面/逻辑设计器尚未实现”，实际已完成。
- `PLATFORM.md` 仍写“所有请求带 `X-Tenant-Id`/`X-User-Id`，由前端注入”。实际前端只带 Bearer；BFF 仅在 `lcp.auth.dev-headers=true` 时兼容这两个头，生产只信任 JWT。

看到文档与行为冲突，优先信 `PROGRESS.md` 的环境快照 + 代码 + 实际 API，并在本次提交里顺手修正文档。

### 16.2 草稿与发布

- 保存成功 ≠ 线上生效；运行时只读发布件。
- 设计器“未保存”判断是 `JSON.stringify(local) !== savedSnapshot`；对象键顺序变化也会变 dirty，属正常现象。
- 发布成功后要同步本地 revision 与 snapshot，否则会一直提示未保存。
- 409 `draft_conflict` 必须让用户重新加载，不能直接覆盖别人的草稿。
- 应用详情页发布已保存草稿；设计器发布带完整 `bundle`，两条路径不要混用。

### 16.3 设计器切换丢改动

四个设计器各自拉草稿、各自维护本地状态，没有全局 Bundle store。**在页面/模型/逻辑/组件之间切换前先保存**，否则未保存修改会丢。不要假设切页后会保留。

### 16.4 组件与契约

- `registry/builtin-components.json` 与 `platform/src/data/builtinComponents.json` 是两份，必须手动同步。
- 设计器预览和运行时渲染器是两套代码，改交互要同时改。
- 自定义组件契约以 `schema/component.schema.json` 为准；平台扩展键用 `x-` 前缀。
- 远程组件必须 HTTPS、`source` 含 `{version}`、integrity 合法；否则发布被拒。
- 演示应用当前没有自定义组件，别拿 `PROGRESS.md` 的旧描述当事实。

### 16.5 表达式与步骤

- 是 `$tpl` 不是 `$template`；`$fn` 参数键是 `$args`；`$if` 分支键是 `$then` / `$else`。
- 节点事件只认 `actionRef` / `steps`，不执行 `code`。
- 前端内联 `runSteps` 只支持 `assign/branch/emit/code/log/fail`；`confirm/openDialog/closeDialog/navigate` 由执行器单独处理；其余步骤走后端动作。
- Web 数据源只实现 `entity` / `static`；`api` / `flow` / `computed` 会提示“暂不支持”。

### 16.6 菜单与路由

- 没有菜单编辑器，改 `bundle.navigation.menus` 的 JSON。
- `pageRef`、`path`、页面 `route.path` 三者必须能匹配；动态参数用 `:id?` 这类模板。
- 桌面运行时用 `?path=` 选页；H5 用真实路径。调试时先确认入口方式。
- 菜单 `roles` 由后端过滤，`visible` 由前端求值，两者是双保险，不是二选一。

### 16.7 登录与权限

- 401 清会话跳登录；403 是权限不足，不要当登录问题。
- `isAuthenticated()` 预留 30 秒过期缓冲；系统时间偏差会导致“刚登录就失效”。
- 前端隐藏按钮不是安全边界，后端仍会校验。

### 16.8 大文件修改

- `ModelDesignerPage` / `PageDesignerPage` / `LogicDesignerPage` 都超过 1700 行，改前先定位 `load/save/publish` 与对应 `lib` 函数。
- 领域逻辑优先下沉到 `lib/*Model.ts`，页面只做编排；不要在模板里堆业务判断。
- 中文文件用 UTF-8 无 BOM；Windows 命令行有长度限制，大文件分块写。

### 16.9 交付前自检

- [ ] `npm run typecheck`、`npm run build` 通过。
- [ ] `node tools/validate.mjs` 通过。
- [ ] 草稿已保存，发布成功，运行时用**非管理员账号**验证过。
- [ ] 试过 409 冲突路径（或确认未改动保存逻辑）。
- [ ] 版本列表、diff、恢复草稿、回滚未被破坏。
- [ ] 新页面/菜单/按钮在 Web 与 H5 入口都能打开（涉及多端时）。
- [ ] `git diff --check` 无空白错误。
- [ ] `PROGRESS.md` 已更新（完成了什么、环境快照、下一步）。

---

## 17. 第一周任务清单

### Day 1：环境与产品

- [ ] 读完 `PROGRESS.md` 的「环境快照」「已完成」「已知边界」。
- [ ] 用四个演示账号各登录一次，确认角色差异。
- [ ] 走通请假：发起 → 审批 → 实例详情 → 动作日志。
- [ ] 读 `main.ts`、`router/index.ts`、`StudioLayout.vue`、`http.ts`、`session.ts`。
- [ ] 能画出“浏览器 → 设计器 → BFF → 草稿/发布件”的请求图。

### Day 2：数据模型

- [ ] 读 `lib/dataModel.ts` 与 `types/dataModel.ts`。
- [ ] 在演示应用加一个临时字段（不要发布），观察 dirty、保存、409。
- [ ] 理解 19 种字段类型、`column`/`jsonb`、关系与 `remapFieldKey`。
- [ ] 跑一次本地校验，故意制造一个 error 再修掉。

### Day 3：页面设计器

- [ ] 读 `lib/uiModel.ts`、`PageDesignerPage.vue` 的 `load/save/publish`。
- [ ] 用模板新建一个 list 页面，加一列、改一个查询条件。
- [ ] 配一个 `visible` 表达式和一个按钮 `actionRef`。
- [ ] 在设计器预览与运行预览各看一次，理解两套渲染器差异。

### Day 4：逻辑与表达式

- [ ] 读 `types/logicModel.ts`、`lib/logicModel.ts` 的步骤/规则定义。
- [ ] 新建一个 `validation` 规则，构造通过/失败用例。
- [ ] 新建一个简单动作（`assign` + `validate` + `fail`），挂到按钮上。
- [ ] 读 `leave_submit` 的完整步骤，能解释每一步业务含义。

### Day 5：运行时与交付

- [ ] 读 `RuntimeShellPage.vue`、`RuntimePageRenderer.vue`、`RuntimeNodeRenderer.vue` 的分工。
- [ ] 用 `bob` 完成一次审批，观察 `allowed_actions` 与 `permission`。
- [ ] 在实例详情重放一个失败动作（可先构造失败）。
- [ ] 独立完成一个小改动：加字段 + 页面展示 + 发布 + 双账号验证 + 提交。
- [ ] 更新 `PROGRESS.md` 并向团队演示。

### 第二周建议

- 接一个真实小需求，从“改模型/页面”开始，逐步过渡到“加动作/规则/流程”。
- 尝试读懂 `tools/validate.mjs` 的校验分层，理解协议错误码。
- 尝试用 `tools/` 出码，对比设计器配置与生成代码的对应关系。

---

## 18. 术语表

| 术语 | 含义 |
|---|---|
| Bundle | 应用发布单元，包含 app 元信息、artifacts、assets、navigation |
| Artifact | Bundle 内的一类产物，如 `dataSchemas`、`uiSchemas` |
| Draft | 可编辑草稿，带 revision |
| Publish | 把草稿变成不可变版本快照 |
| Version | 发布产生的新版本，可 diff/回滚 |
| Action | 逻辑动作，页面/流程/规则可复用 |
| Flow | 流程定义，关联 BPMN 与任务表单 |
| Rule | 校验/派生/守卫/权限/通知规则 |
| Component | 自定义组件定义，runtime 为 builtin/remote/sandbox |
| Runtime | 消费发布件的 Web/H5/小程序运行时 |
| Tenant | 租户，所有业务数据与权限按租户隔离 |

---

## 19. 相关文档与代码索引

| 文档/代码 | 用途 |
|---|---|
| `PROGRESS.md` | 进度、环境快照、已知边界、下一步（接手第一份） |
| `PLATFORM.md` | 控制平面 API 与草稿/发布/版本数据流（注意请求头描述过时） |
| `PROTOCOL.md` | Schema 协议总览与校验规则 |
| `schema/bundle.schema.json` | Bundle 顶层结构 |
| `schema/data.schema.json` | 数据模型协议 |
| `schema/ui.schema.json` | 页面协议 |
| `schema/logic.schema.json` | 逻辑协议 |
| `schema/component.schema.json` | 组件契约 |
| `registry/builtin-components.json` | 内置组件权威契约 |
| `platform/README.md` | 前端说明（“尚未实现”章节已过时） |
| `deploy/README.md` | 部署与运维 |
| `platform/src/router/index.ts` | 路由总表 |
| `platform/src/api/platform.ts` | 控制平面 API |
| `platform/src/api/runtime.ts` | 运行时 API |
| `platform/src/lib/*Model.ts` | 各设计器领域逻辑 |
| `platform/src/components/runtime/*` | 运行时渲染与动作日志 |
| `examples/leave-approval.bundle.json` | 请假审批示例 Bundle（结构与演示应用一致，ID 可能不同） |

---

> 最后更新：2026-10-28
> 维护建议：每次改路由、设计器套路、运行时能力或演示环境时同步更新本文件；不确定的结论先写“待核实”，不要留猜测。