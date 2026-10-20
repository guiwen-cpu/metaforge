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

## 已知边界

- 尚未执行交互步骤中的 `apiCall`；编辑态由实体数据源回填。
- 附件上传与审批时间线为明确占位，不伪造数据。
- `src/manifest.json` 的微信 AppID 为空；真机联调需在微信开发者工具中关闭合法域名校验，正式发布前配置 AppID 与 HTTPS 域名。
