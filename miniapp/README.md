# MetaForge 小程序运行时（uni-app）

以 uni-app Vue3 + TypeScript 实现的发布态移动端外壳，只消费控制平面的发布件导航、页面、数据源与动作契约，不复制设计器逻辑。

## 本地运行

```powershell
cd miniapp
npm install
npm run dev:h5        # http://localhost:5180，/api 代理到 localhost:8080
npm run dev:mp-weixin # 产物在 dist/dev/mp-weixin
```

## 构建

```powershell
npm run typecheck
npm run build:h5
npm run build:mp-weixin
```

- H5 产物：`dist/build/h5`
- 微信小程序产物：`dist/build/mp-weixin`，用微信开发者工具导入该目录

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `VITE_API_BASE_URL` | BFF 地址；真机需用局域网 IP 或 HTTPS 域名 | H5 `/api/v1`，其他端 `http://127.0.0.1:8080/api/v1` |
| `VITE_DEFAULT_APP_ID` | 默认演示应用 | `eb84d4bd-461f-4945-9f76-7d69ce732d8b` |
| `VITE_DEFAULT_TENANT` | 默认租户 | `tenant_demo_school` |
| `VITE_PROXY_TARGET` | 仅 H5 开发服务器代理目标 | `http://localhost:8080` |

构建前可复制 `.env.example` 为 `.env.local`，或在 PowerShell 中临时设置 `$env:VITE_API_BASE_URL`。环境变量会编进产物，不要放任何密钥。

## 能力与边界

- 已接入：发布件导航与页面 ACL、数据源查询、表单、详情、受控 `apiCall`、附件上传/列表/下载、审批时间线与流程任务上下文、微信登录。
- 审批办理页的 `x-process-form` / `x-approval-actions` 仍为占位；审批请使用桌面审批中心或 H5。
- `src/manifest.json` 的微信 AppID 为空；正式联调与体验版发布步骤见 [RELEASE.md](./RELEASE.md)。

## 发布

从 AppID、合法域名、局域网真机调试到体验版上传的完整步骤，见 [RELEASE.md](./RELEASE.md)。