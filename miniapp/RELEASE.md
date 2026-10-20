# 微信小程序真机调试与体验版发布

本文以 MetaForge 的 uni-app 运行时为例，覆盖从本地构建到微信体验版的完整链路。假定 API 对外域名为 `https://api.example.edu`，应用页面通过 `/api/v1/**` 访问 BFF。

## 1. 前置条件

| 项 | 要求 |
|---|---|
| 小程序主体 | 已在微信公众平台注册，拿到小程序 AppID |
| 服务端 | BFF 可被公网 HTTPS 访问；证书链完整，TLS 1.2+ |
| 域名 | 已备案；微信后台配置的域名不能是 IP、localhost 或带端口 |
| 微信登录 | `LCP_WECHAT_*` 已在服务端配置，`LCP_WECHAT_APP_ID` 与小程序 AppID 一致 |
| 构建环境 | Node.js 20+；本仓库 `miniapp` 依赖已安装 |

AppID 与 AppSecret 不是一回事：AppID 可以出现在小程序工程里；AppSecret 只允许放在 BFF 环境变量中，绝不能写进 `src/`、`.env` 或提交到 Git。

## 2. 构建产物

### 2.1 H5

```powershell
cd miniapp
$env:VITE_API_BASE_URL = "https://api.example.edu/api/v1"
$env:VITE_DEFAULT_APP_ID = "<发布应用 ID>"
$env:VITE_DEFAULT_TENANT = "<租户 ID>"
npm run typecheck
npm run build:h5
```

将 `dist/build/h5` 部署到静态站点。H5 使用 hash 路由，Nginx 不需要额外的 history fallback；同域部署时也可把 `VITE_API_BASE_URL` 保持为 `/api/v1`。

### 2.2 微信小程序

```powershell
cd miniapp
$env:VITE_API_BASE_URL = "https://api.example.edu/api/v1"
$env:VITE_DEFAULT_APP_ID = "<发布应用 ID>"
$env:VITE_DEFAULT_TENANT = "<租户 ID>"
npm run build:mp-weixin
```

产物目录：`dist/build/mp-weixin`。`VITE_API_BASE_URL` 在构建时写入代码，修改后必须重新构建。

### 2.3 配置 AppID

编辑 `miniapp/src/manifest.json`：

```json
{
  "mp-weixin": {
    "appid": "wx0000000000000000"
  }
}
```

也可以先导入工程，在微信开发者工具的「详情 → 基本信息」中填写；但 CI 构建与体验版上传应以 `manifest.json` 为准，避免每次手工改。

`urlCheck: false` 只用于开发者工具关闭域名校验，不代表体验版可以绕过微信后台的合法域名限制。正式发布前应把该值恢复为 `true`。

## 3. 微信后台配置合法域名

进入微信公众平台 →「开发管理」→「开发设置」→「服务器域名」：

| 类型 | 填写 | 用途 |
|---|---|---|
| request 合法域名 | `https://api.example.edu` | 登录、导航、页面、数据源、动作、时间线 |
| uploadFile 合法域名 | `https://api.example.edu` | 附件上传 `uni.uploadFile` |
| downloadFile 合法域名 | `https://api.example.edu` | 附件预览/下载 |

注意：

- 只填协议 + 域名，不要带 `/api/v1` 路径。
- 每个域名必须 HTTPS，不能在 URL 中使用 IP、localhost、端口；证书需被微信信任。
- 如果附件走独立 OSS/CDN，把对应域名分别加入 uploadFile / downloadFile。
- 修改域名后，重新编译并在开发者工具「详情 → 域名信息」确认已生效。

## 4. 服务端配置

在 `deploy/.env`（或 staging/prod 对应 env）中配置：

```dotenv
LCP_WECHAT_ENABLED=true
LCP_WECHAT_APP_ID=wx0000000000000000
LCP_WECHAT_APP_SECRET=change-me
LCP_WECHAT_TENANT=tenant_demo_school
LCP_WECHAT_LINK_BY=username
LCP_WECHAT_AUTO_CREATE=false
```

重建 BFF 后检查：

```powershell
Invoke-RestMethod https://api.example.edu/api/v1/auth/wechat/config
```

响应必须只包含 `enabled`、`app_id`、`tenant`、`display_name`，不能出现 `app_secret`。

微信用户首次登录时：

- 默认 `LCP_WECHAT_LINK_BY=username`，但微信不返回用户名，因此通常需要管理员预先把 `openid`/`unionid` 绑定到本地账号；
- 若允许小程序自助建号，设置 `LCP_WECHAT_AUTO_CREATE=true`，新账号没有应用角色，需在身份管理中补授权；
- 未绑定会返回 `403`，前端显示「统一身份未绑定本地账号或账号不可用」。

## 5. 局域网真机调试

### 5.1 手机与电脑同一 Wi-Fi

1. 查询电脑局域网 IPv4：`ipconfig`。
2. 确认 8080 端口未被防火墙拦截。
3. 用局域网地址重新构建：

```powershell
$env:VITE_API_BASE_URL = "http://192.168.1.20:8080/api/v1"
npm run build:mp-weixin
```

4. 微信开发者工具导入 `dist/build/mp-weixin`，选择 AppID，打开「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
5. 点击「预览」，手机扫码。手机和电脑必须在同一网段，且电脑防火墙允许 8080。

局域网 HTTP 只适合开发。真机体验版和正式版必须改为 HTTPS 域名，并完成微信后台域名配置。

### 5.2 H5 真机

H5 开发服务器默认把 `/api` 代理到 `http://localhost:8080`。手机访问电脑的 5180 端口时，代理仍在电脑侧执行，因此无需把 `VITE_API_BASE_URL` 改成局域网 IP；若直接部署 H5 产物，则按第 2.1 节构建。

## 6. 导入并运行

1. 打开微信开发者工具，选择「导入项目」。
2. 目录选择 `miniapp/dist/build/mp-weixin`。
3. 填写 AppID，项目名称任意。
4. 编译后确认：
   - 登录页能拉到 `/auth/wechat/config`；
   - 微信登录按钮出现（未配置时显示账号密码降级提示）；
   - 登录后能打开发布应用首页；
   - 列表、详情、附件上传和审批时间线无域名/证书错误。
5. 用「预览」在真机验证登录、上传、下载与审批时间线。

## 7. 上传体验版

1. 微信开发者工具点击「上传」。
2. 填写版本号（例如 `0.1.0`）与项目备注（例如 `MetaForge 运行时联调`）。
3. 登录微信公众平台 →「管理」→「版本管理」。
4. 在开发版本中找到刚上传的版本，点击「选为体验版」。
5. 在「成员管理」添加体验成员；把体验版二维码发给测试人员。
6. 体验版仍会校验合法域名与 HTTPS，不能用局域网 HTTP 地址。

## 8. 正式发布

1. 完成体验版验收与隐私协议/用户隐私保护指引配置。
2. 在版本管理中「提交审核」，选择正确服务类目并填写功能说明。
3. 审核通过后「发布」。
4. 发布后保留上一版本，便于回滚；版本号与 BFF 发布版本在发布记录中对应。

## 9. 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| `wechat_disabled` / 登录按钮不出现 | BFF 未启用微信登录 | 设置 `LCP_WECHAT_ENABLED=true` 并重建 BFF |
| `wechat_misconfigured` | AppID 或 AppSecret 为空 | 补齐环境变量；AppSecret 只在服务端 |
| `wechat_code_invalid` | code 过期、重复使用或 AppID 不匹配 | 重新进入小程序；确认两端 AppID 一致 |
| 403 未绑定 | openid/unionid 没有对应本地账号 | 绑定账号或临时开启 `LCP_WECHAT_AUTO_CREATE` |
| 请求失败/网络异常 | 域名未配置、证书错误或 HTTP | 检查 request/uploadFile/downloadFile 合法域名与证书 |
| 上传 400 `file_type_not_allowed` | 文件类型不在白名单 | 使用支持的图片、视频或文档类型 |
| 附件 404 | 页面 ACL 不通过或附件已删除 | 检查登录账号页面权限与附件状态 |
| 体验版白屏 | 构建时 API 地址仍是 localhost/局域网 | 用 HTTPS 域名重新构建并上传 |

## 10. 发布检查清单

- [ ] `npm run typecheck`、`npm run build:h5`、`npm run build:mp-weixin` 通过
- [ ] `manifest.json` 的 AppID 与 BFF `LCP_WECHAT_APP_ID` 一致
- [ ] `VITE_API_BASE_URL` 使用 HTTPS 正式域名
- [ ] request / uploadFile / downloadFile 合法域名均已配置
- [ ] BFF 配置接口不返回 AppSecret
- [ ] 体验成员完成微信登录、列表、详情、附件、审批时间线验收
- [ ] 隐私协议、服务类目与版本说明已填写
- [ ] 上一版本可回滚，发布记录已归档