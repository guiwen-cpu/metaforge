# MetaForge 控制平面

控制平面负责「应用」这一聚合根的生命周期：创建 → 编辑草稿 → 发布版本 → 回滚 / 恢复。
页面设计器、数据模型设计器后续都只读写同一份 AppBundle，不另建一套元数据。

## 1. 数据模型

| 表 | 作用 | 关键约束 |
|---|---|---|
| `lcp_application` | 应用索引 + 当前草稿 | `app_key` 租户内唯一（软删除后释放）；`draft_revision` 乐观锁 |
| `lcp_app_version` | 发布版本，append-only | `(tenant_id, app_id, version_no)` 唯一；触发器拒绝 UPDATE/DELETE |

两张表都开启 RLS，策略读 `current_setting('lcp.tenant_id', true)`；版本表用复合外键
`(tenant_id, app_id)` 绑定应用，跨租户引用在数据库层不可能成立。

软删除只作用于 `lcp_application`（`deleted_at` + `status=archived`），历史版本保留。

## 2. API

基础路径：`/api/v1/platform/apps`。所有请求必须带 `X-Tenant-Id`，建议带 `X-User-Id`。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | 分页列表，参数 `page`、`size`、`q`、`status` |
| `POST` | `/` | 创建应用 |
| `GET` | `/{appId}` | 应用详情（不含草稿大字段） |
| `PATCH` | `/{appId}` | 修改名称/描述/图标/类型/分类/semantic |
| `DELETE` | `/{appId}` | 软删除 |
| `GET` | `/{appId}/draft` | 读取草稿与 revision |
| `PUT` | `/{appId}/draft` | 保存草稿，可带 `revision` 做乐观锁 |
| `POST` | `/{appId}/versions` | 发布；`bundle` 省略时取当前草稿；内容未变返回 `unchanged=true` |
| `GET` | `/{appId}/versions` | 版本列表（倒序，不含 bundle） |
| `GET` | `/{appId}/versions/{versionNo}` | 版本详情（含 bundle 与 content_checksum） |
| `GET` | `/{appId}/versions/{from}/diff/{to}` | 内容级版本对比（忽略 snapshot） |
| `POST` | `/{appId}/versions/{versionNo}/restore-draft` | 把历史版本恢复成草稿 |
| `POST` | `/{appId}/versions/{versionNo}/rollback` | 以历史内容发布新版本 |

### 请求/响应示例

```bash
# 创建应用
curl -X POST http://localhost:8080/api/v1/platform/apps \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' \
  -d '{"key":"leave_approval","name":"请假审批","type":"education"}'

# 保存草稿（bundle 传 AppBundle 本体）
curl -X PUT http://localhost:8080/api/v1/platform/apps/$APP_ID/draft \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' \
  -d '{"revision":1,"bundle":{"protocolVersion":"0.1","tenantId":"tenant_demo_school","app":{"id":"01J...","key":"leave_approval","name":"请假审批"},"artifacts":{"dataSchemas":[],"uiSchemas":[],"logicSchemas":[]}}}'

# 发布（使用刚保存的草稿）
curl -X POST http://localhost:8080/api/v1/platform/apps/$APP_ID/versions \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' -d '{"message":"首版上线"}'

# 内容没变仍要留一条发布记录
curl -X POST http://localhost:8080/api/v1/platform/apps/$APP_ID/versions \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' \
  -d '{"message":"补发说明","force":true}'

# 对比 v1 与 v2
curl http://localhost:8080/api/v1/platform/apps/$APP_ID/versions/1/diff/2 \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice'

# 把 v1 恢复成草稿继续编辑（不产生新版本）
curl -X POST http://localhost:8080/api/v1/platform/apps/$APP_ID/versions/1/restore-draft \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' -d '{"revision":3}'

# 回滚到 v1：生成新版本，历史不动
curl -X POST http://localhost:8080/api/v1/platform/apps/$APP_ID/versions/1/rollback \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' -d '{"message":"v2 有问题，回滚到 v1"}'
```

## 3. 版本语义

### 草稿

- 草稿允许不完整，设计器可随时保存；
- 每次保存 `draft_revision + 1`；
- 请求带 `revision` 时做乐观锁，不匹配返回 `409 draft_conflict`；
- 草稿不携带 `snapshot`：版本戳只属于已发布版本。

### 内容摘要与去重

- `checksum = sha256(canonical({ bundle: ... }))`，覆盖发布件全部字段（含 snapshot）；
- `content_checksum = sha256(canonical(bundle 去掉 snapshot))`；
- 发布时先算内容摘要：与当前版本一致且 `force` 不为 `true`，直接返回 `200`、
  `unchanged=true` 和当前版本详情，不生成空版本；
- `force=true` 强制生成新版本，用于补发说明或重建快照；
- 回滚同样走内容摘要判断，因此「先回滚到 v1，再把 v1 恢复成草稿并发布」不会产生重复版本。

### 发布

发布时平台做三件事：

1. **校验**：必须有 `bundle`、`bundle.protocolVersion`、`bundle.app.key`，且 key 与应用一致；
2. **盖章**：写入/覆盖 `bundle.snapshot`：
   `snapshotId`（ULID）、`version`、`status=published`、`message`、`publishedAt`、
   `publishedBy`、`basedOn`（父版本 snapshotId）、`rollbackOf`（仅回滚时）；
3. **落库**：`version_no = max + 1`，同时把 `bundle.app` 的展示信息同步回应用索引。

### 版本对比

`GET /versions/{from}/diff/{to}` 只比较内容（去掉 snapshot），返回：

```json
{
  "from_version": 1,
  "to_version": 2,
  "identical": false,
  "content_checksum": { "from": "…", "to": "…" },
  "summary": { "added": 0, "removed": 0, "changed": 2, "total": 2 },
  "changes": [
    {
      "path": "app.name",
      "kind": "changed",
      "before": "Smoke V1",
      "after": "Smoke V2"
    }
  ],
  "truncated": false
}
```

- 数组优先按 `key`（其次 `id`、`name`）配对，再逐字段递归；
- `artifact_kind` / `artifact_key` 帮助界面把差异归到具体 DataSchema / UISchema / LogicSchema；
- 单边节点序列化超过 2000 字符时只回传 `_truncated` 与定位字段；
- 最多返回 200 条变更，超出时 `truncated=true`。

### 恢复草稿

`POST /versions/{versionNo}/restore-draft` 把历史版本内容（去掉 snapshot）写回草稿：

- 不产生新版本，不改变 `current_version`；
- `draft_revision + 1`，可带 `revision` 做乐观锁；
- 草稿里的 `bundle.app.key` 强制对齐应用 key，避免跨应用粘贴。

### 回滚

回滚不改写历史：取目标版本的已发布 bundle，重新盖章成 `version_no + 1`，
`rollbackOf` 指向目标版本，`basedOn` 指向回滚前的当前版本。版本链因此保持完整。

数据库触发器 `trg_lcp_app_version_append_only` 拒绝版本表的 UPDATE/DELETE；
仅运维脚本可显式 `set local lcp.allow_purge = 'on'` 后清理。

## 4. 错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | `bad_request` | 参数语义错误 |
| 400 | `bundle_required` / `protocol_version_required` / `app_required` | 发布件不完整 |
| 400 | `app_key_mismatch` | `bundle.app.key` 与应用 key 不一致 |
| 400 | `draft_empty` | 未提交 bundle 且草稿为空 |
| 400 | `validation_failed` | Bean Validation 失败（复用出码侧统一错误体） |
| 404 | `not_found` | 应用 / 版本不存在，或不属于当前租户 |
| 409 | `app_key_exists` | 同租户 key 冲突 |
| 409 | `draft_conflict` | 草稿 revision 已变化 |

## 5. 事务与租户

`TenantTransactionAspect` 匹配所有 `dev.lcp..*` 下的 `@RestController`：
每个请求一个事务，事务内执行 `set_config('lcp.tenant_id', ?, true)`。
服务层 SQL 仍显式带 `tenant_id`，RLS 作为最后一道兜底。

## 6. 与协议的关系

- 控制面只存 AppBundle，不对 `artifacts` 再做建模；
- 「数据模型设计器」编辑 `artifacts.dataSchemas`，「页面设计器」编辑 `artifacts.uiSchemas`，
  两者共用同一份草稿与版本链；
- `semantic` / `snapshot` 等字段原样保留，供 AI 与出码引擎消费。

## 7. 尚未实现（P1）

- 结构化 `changeSummary` 的生成与持久化（当前 diff 实时计算）；
- 应用级数据权限、成员与角色绑定；
- 控制平面前端（应用工作台、设计器壳层）。

## 8. 连接器与租户密钥

基础路径：

- `/api/v1/platform/connections`：连接器注册表，支持 `GET` / `POST`，子路径 `/{id}` 支持 `PATCH` / `DELETE`。
- `/api/v1/platform/secrets`：租户密钥库，支持 `GET` / `POST`，子路径 `/{id}` 支持 `PATCH` / `DELETE`。

连接器与密钥都按 `tenant_id` 隔离，写操作要求租户管理员权限。密钥值只写不读：列表与更新响应只返回 key、名称、说明、版本和轮换时间。

### 密钥引用

- 逻辑 Schema 的 `auth` 用 `secret:<key>` 引用密钥，不写明文。
- 密钥由 `SecretCipher` 以 AES-256-GCM 加密，随机 96 位 nonce，AAD 为 `tenant_id:secret_key`。
- 主密钥来自 `LCP_SECRET_MASTER_KEY`，必须是 32 字节（Base64、十六进制或原始文本）；丢失后已有密钥不可恢复。

### 运行时合并

API 绑定连接器后，运行时按以下优先级合并：

1. 地址：API `baseUrl` 优先，否则连接器 `baseUrl`；
2. 超时：API 正值优先，否则连接器超时；
3. 请求头：连接器公共头为基础，同名 API 头覆盖；
4. 鉴权：API `auth` 缺省或为 `null` 时继承连接器默认鉴权；显式 `{ "type": "none" }` 才关闭。

支持 `bearer`、`apiKey`（`header` / `query`）与 `basic`。`oauth2` 与签名鉴权尚未接入。

### 出站安全

`OutboundUrlPolicy` 在保存连接器和每次请求前校验地址：

- 只允许 HTTP/HTTPS；HTTP 默认拒绝，需 `LCP_CONNECTOR_ALLOW_INSECURE_HTTP=true`。
- 默认拒绝回环、私网、链路本地、多播与云元数据地址；本地联调需 `LCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true`。
- 地址不得包含 userinfo 或 fragment。

连接器首版只支持 REST/HTTP；内部、数据库、GraphQL、SOAP 仍返回明确不支持。
