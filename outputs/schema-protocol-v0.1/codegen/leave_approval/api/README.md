# leave_approval · BFF CRUD 接口

本目录由 `tools/gen-api.mjs` 生成，勿手改。它是 DataSchema 的**接口形态**，与 `../sql/`（物理形态）、
`../ts/entities.ts`（行形态）同源；改 Schema 后重跑生成器。

## 约定

- 租户与操作人来自 `LcpPrincipal`（平台实现），请求体里带了 `tenant_id` / `created_by` 也不采信。
- 所有值走命名参数；表名 / 列名只来自 `LcpTableSpec`；排序键必须在 `sortableColumns()` 白名单内。
- `PUT` 是整体替换：JSONB 文档整份重写，没给的键就是 `null`；`immutable` 字段被忽略。
- 开启乐观锁的表，`PUT` 必须带 `version`，否则 428；版本不匹配返回 409 `version_conflict`。
- 开启软删除的表，`DELETE` 是置 `deleted_at`；读 / 改 / 删默认只看未删除行，列表可用 `include_deleted=true` 放宽（需平台授权）。
- 读接口默认**不返回** sensitive 字段（`LcpFieldPolicy.denySensitive`）。接入平台后换成按 `permissions.json` 的 fields 白名单实现。

## 路由

| 实体 | 基址 | 名称 | Controller |
| --- | --- | --- | --- |
| `employee` | `/api/v1/leave_approval/employee` | 人员 | EmployeeController |
| `leave_request` | `/api/v1/leave_approval/leave_request` | 请假单 | LeaveRequestController |
| `attachment` | `/api/v1/leave_approval/attachment` | 附件 | AttachmentController |

每个实体 5 条路由：

```
GET    {base}            分页查询 → LcpPageResult
GET    {base}/{id}       取一行
POST   {base}            创建 → 201 + Location
PUT    {base}/{id}       更新（整体替换）
DELETE {base}/{id}       软删除 / 物理删除 → 204
```

## 错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| `not_found` | 404 | 行不存在或已软删除 |
| `conflict` | 409 | 唯一约束冲突 |
| `version_conflict` | 409 | 乐观锁版本不一致 |
| `version_required` | 428 | 乐观锁表更新未带 version |
| `bad_request` | 400 | 未知字段 / 不支持的排序或筛选字段 |
| `validation_failed` | 400 | 请求体 Bean Validation 未通过（details 带字段级原因） |
| `principal_missing` | 500 | 平台没注入租户 |

## 接入清单

1. 依赖：`spring-boot-starter-web`、`spring-boot-starter-jdbc`、`spring-boot-starter-validation`、`com.fasterxml.jackson.core:jackson-databind`。
2. 组件扫描要覆盖 `dev.lcp.generated.leave_approval.api`（`LcpExceptionHandler` 是 `@RestControllerAdvice`）。
3. 提供一个 `NamedParameterJdbcTemplate`。
4. 实现 `LcpPrincipal`（从会话 / JWT 取 `tenantId` 与 `userId`）。
5. 数据库连接要设置 `lcp.tenant_id`（RLS 兜底），见 `../sql/90_rls.sql`。

## 有意不做

- **行级数据权限**：`permissions.json` 里的 `condition` 表达式由 BFF 表达式引擎翻译，出码侧不解释；本层只做租户隔离。
- **字段脱敏实现**：只提供 `LcpFieldPolicy` 钩子与 sensitive 列清单，掩码规则属于平台。
- **JSONB 字段筛选**：只对列存字段生成筛选条件；JSONB 的包含查询走 GIN 索引，属于平台查询引擎。
- **formula 派生字段**：需要表达式运行时求值，当前 CRUD 投影不含。
- **批量、导入导出、审批动作**：属于后续出码步骤，不在通用 CRUD 里硬塞。

## 目录

```
api/
  README.md
  permissions.json                角色 / 权限清单（服务端授权的事实来源）
  client/api.ts                   TS 客户端（依赖 ts/entities.ts 的行类型）
  src/main/java/dev/lcp/generated/leave_approval/api/
    support/                      runtime 契约 + 通用 CRUD 内核
    table/                        LcpTableSpec 常量（表名 / 列 / 平台列）
    dto/                          Query / CreateRequest / UpdateRequest
    crud/                         Controller（5 条路由 / 实体）
```

## 已知边界

生成环境没有 JDK —— 这些 Java 源**没有编译过**。自检只覆盖结构性不变量（路由、参数覆盖、
SQL 只在 runtime、排序白名单、平台列不进请求体……），不等于可编译。首次 `mvn -q compile` 前不要假定能过；
报错请改生成器，不要改产物。
