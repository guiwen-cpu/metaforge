# MetaForge Studio

控制平面工作台：管理应用、编辑 AppBundle 草稿、发布版本、查看 diff、回滚与恢复历史版本。

技术栈：Vue 3 + Vite + TypeScript + Element Plus + Pinia + TailwindCSS。

## 本地运行

先启动后端（仓库根目录）：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d postgres redis bff
```

再启动工作台：

```powershell
cd platform
npm install
npm run dev
```

打开 <http://localhost:5175>。Vite 会把 `/api` 代理到 `http://localhost:8080`。

也可以直接用 Docker 看完整产物：

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
# 工作台：http://localhost:8080
# 出码示例：http://localhost:8080/demo/
```

## 目录

```text
src/
  api/platform.ts       控制平面 API 封装
  lib/http.ts           axios 实例、租户/操作人请求头、统一 ApiError
  lib/session.ts        租户与操作人持久化（localStorage）
  pages/AppListPage     应用列表、搜索、创建、归档
  pages/AppDetailPage   草稿编辑、发布、版本历史、diff、回滚、恢复草稿
  layouts/StudioLayout  侧边导航与会话切换
```

## 交互约定

- 所有请求带 `X-Tenant-Id` 与 `X-User-Id`，由 `lib/http.ts` 统一注入；
- 草稿保存带 `revision`，服务端返回 `409 draft_conflict` 时提示重新加载；
- 发布前要求草稿已保存；内容与当前版本一致时后端返回 `unchanged=true`，不生成空版本；
- diff 只比较内容（去掉 snapshot），数组优先按 `key` 配对；
- 「恢复草稿」不产生版本；「回滚」才会以历史内容发布新版本。

## 尚未实现

- 数据模型设计器（编辑 `artifacts.dataSchemas`）；
- 页面设计器（拖拽布局、编辑 `artifacts.uiSchemas`）；
- 逻辑编排与审批流设计器；
- 真实登录态（JWT/SSO）与应用级数据权限。