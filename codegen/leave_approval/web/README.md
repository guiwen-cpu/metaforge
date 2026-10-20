# leave_approval · Web 页面（生成物）

本目录由 `tools/gen-page.mjs` 从 `AppBundle` 生成，**勿手改生成文件**。它把同一份 DataSchema
编译成页面形态：列表列、搜索条件、创建 / 编辑表单、上传约束、权限按钮快照，与
`../api/`（接口形态）、`../sql/`（物理形态）同源。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5174
npm run typecheck  # vue-tsc --noEmit
npm run build
```

后端默认代理到 `http://localhost:8080`，可用环境变量覆盖：

```bash
VITE_PROXY_TARGET=http://localhost:8080 npm run dev
VITE_API_BASE=            # 部署到同域时留空；跨域时填 BFF 地址
VITE_STS_URL=/api/v1/platform/oss/sts
```

## 页面与接口

| 实体 | 页面标题 | BFF 基址 | 列 | 创建字段 | 更新字段 |
| --- | --- | --- | --- | --- | --- |
| `employee` | 人员 | `/api/v1/leave_approval/employee` | 7 | 7 | 4 |
| `leave_request` | 请假单 | `/api/v1/leave_approval/leave_request` | 16 | 14 | 13 |
| `attachment` | 附件 | `/api/v1/leave_approval/attachment` | 9 | 8 | 7 |

每个资源复用同一套 `ResourcePage` 引擎：

- `GET {base}?page=&size=&sort=&order=&q=&<filter>` → `{ items, total, page, size, pages }`
- `GET {base}/{id}`
- `POST {base}` → 201
- `PUT {base}/{id}` → 200；列整体替换，JSONB 浅合并
- `DELETE {base}/{id}` → 204

筛选参数与 `../api/src/main/java/**/dto/*Query.java` 的字段名严格一致（snake_case，区间用
`_from` / `_to`）。排序字段来自 Schema 的 `sortable` 白名单。

## 三条页面约定

1. **sensitive 字段只写不读。** 列表列与编辑表单都不出现；创建表单可以填写，保存后不再回显。
   更新请求里省略该键，BFF 的 JSONB 浅合并会保留原值。
2. **immutable 字段创建可填、编辑只读。** 编辑时 `readonly=true`，且不进入 `updateKeys`。
3. **乐观锁。** `optimisticLock=true` 的实体在 `PUT` 请求体里带 `version`；BFF 返回 409
   `version_conflict` 时页面提示刷新后重试。

## 上传（阿里云 OSS 直传）

上传字段通过 `ali-oss` 使用 STS 临时凭证直传，AccessKey 不进前端包。

```ts
// 平台需要提供（默认 GET /api/v1/platform/oss/sts）
interface OssCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  region: string;
  bucket: string;
  endpoint?: string;
  prefix?: string;
}
```

也可以在 `main.ts` 里注入：

```ts
import { setStsProvider } from "@/lib/oss";
setStsProvider(async () => {
  const response = await fetch("/your/sts/endpoint", { credentials: "include" });
  return response.json();
});
```

| 字段 | 标签 | 类型 | 允许扩展名 | 单文件上限 | 数量 |
| --- | --- | --- | --- | --- | --- |
| `leave_request.images` | 图片佐证 | image | jpg / jpeg / png / webp | 10.0 MB | 6 |
| `leave_request.video_proof` | 视频佐证 | video | mp4 / mov | 100.0 MB | 1 |
| `leave_request.documents` | 办公文件 | document | pdf / doc / docx / xls / xlsx | 50.0 MB | 5 |
| `leave_request.images` | 图片佐证 | image | jpg / jpeg / png / webp | 10.0 MB | 6 |
| `leave_request.video_proof` | 视频佐证 | video | mp4 / mov | 100.0 MB | 1 |
| `leave_request.documents` | 办公文件 | document | pdf / doc / docx / xls / xlsx | 50.0 MB | 5 |

对象键按 Schema 的 `uiHints.upload.pathTemplate` 生成（`{tenant}/{app}/.../{yyyy}/{MM}/{ulid}.{ext}`）。
私有桶返回 7 天签名 URL；生产环境建议改成「存 objectKey、展示时换签名 URL」。

## 权限

`src/generated/permissions.ts` 是 Bundle 授权记录的**快照**，只用于按钮显隐。
服务端 `../api/permissions.json` 才是授权事实来源，前端不做任何替代校验。
未在 permissions 中出现的实体按「不限制」处理，避免配置缺失导致页面不可用。

## 登录与会话

生成项目不再自动创建演示会话。`/login` 会调用平台身份接口取得 JWT，后续请求统一带
`Authorization: Bearer <token>`；页面刷新时通过 `GET /api/v1/auth/me` 恢复用户、角色与部门。

- `POST /api/v1/auth/login`：`{ tenant, username, password }` → `{ token, expires_at, user }`
- `GET /api/v1/auth/me`：返回当前用户与 `role_keys` / `dept_id` / `dept_name`
- 路由守卫：未登录访问业务页面跳转 `/login?redirect=<原地址>`；令牌失效自动清空并回登录页
- 会话键：`lcp.token` / `lcp.tenant` / `lcp.user`；退出登录只清本地令牌

默认租户来自 Bundle 的 `tenantId`，登录页仍可修改；生产多租户部署应固定租户或从域名推导。


## 生成边界

- 本步骤只生成**实体驱动的标准 CRUD 页面**；`uiSchemas` 里的自由布局由后续「页面设计器渲染器」消费。
- 登录走平台 JWT 身份接口，角色与部门来自服务端；接入 SSO 时可替换 `stores/session.ts` 的登录入口。
- `GENERATED.txt` 是产物清单：下一轮只删除「上一轮清单里有、这一轮不再产出」的文件，`node_modules`、
  手写扩展组件不会被误删。
- 生成器本身不执行依赖安装；首次使用请先 `npm install`，再跑 `npm run typecheck` / `npm run build`。
- 未生成页面的实体：无。
