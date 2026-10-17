# MetaForge 控制平面（P0）

控制平面负责「应用」这一聚合根的生命周期：创建 → 编辑草稿 → 发布版本 → 回滚。
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
| `POST` | `/{appId}/versions` | 发布；`bundle` 省略时取当前草稿 |
| `GET` | `/{appId}/versions` | 版本列表（倒序，不含 bundle） |
| `GET` | `/{appId}/versions/{versionNo}` | 版本详情（含 bundle） |
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

# 回滚到 v1：生成 v2，历史不动
curl -X POST http://localhost:8080/api/v1/platform/apps/$APP_ID/versions/1/rollback \
  -H 'X-Tenant-Id: tenant_demo_school' -H 'X-User-Id: alice' \
  -H 'Content-Type: application/json' -d '{"message":"v2 有问题，回滚到 v1"}'
```

## 3. 版本语义

### 草稿

- 草稿允许不完整，设计器可随时保存；
- 每次保存 `draft_revision + 1`；
- 请求带 `revision` 时做乐观锁，不匹配返回 `409 draft_conflict`。

### 发布

发布时平台做三件事：

1. **校验**：必须有 `bundle`、`bundle.protocolVersion`、`bundle.app.key`，且 key 与应用一致；
2. **盖章**：写入/覆盖 `bundle.snapshot`：
   `snapshotId`（ULID）、`version`、`status=published`、`message`、`publishedAt`、
   `publishedBy`、`basedOn`（父版本 snapshotId）、`rollbackOf`（仅回滚时）；
3. **落库**：`version_no = max + 1`，同时把 `bundle.app` 的展示信息同步回应用索引。

摘要：`checksum = sha256(canonical({ bundle: ... }))`，对象键按字典序重排后紧凑序列化，
同一份内容在不同序列化顺序下得到相同摘要。

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

- 内容级去重（跳过 snapshot 的 content checksum）与「内容未变」提示；
- 版本对比（diff）与结构化 `changeSummary`；
- 把历史版本恢复为草稿（编辑旧版本而不直接上线）；
- 应用级数据权限、成员与角色绑定；
- 控制平面前端（应用工作台、设计器壳层）。