# leave_approval · 出码产物

应用 **leave_approval** · 协议版本 0.1 · 租户模板 tenant_demo_school

由 `tools/gen-entity.mjs` 依据 Bundle 里的 DataSchema 生成，勿手改；改 Schema 后重跑生成器。

## 目录

- `sql/` —— PostgreSQL DDL：扩展、逐表建表与索引、RLS 策略
- `ts/entities.ts` —— API / BFF 返回形态的 TypeScript 类型（含平台列与派生字段）
- `java/src/main/java/dev/lcp/generated/leave_approval/` —— 数据平面行形态的 Java record（含平台列与 Bean Validation）

## 生成范围的边界

本步骤只做「数据模型 → 落库代码」，以下是**有意不生成**的部分：

- 业务列不加 `NOT NULL`：由应用层按 `required` 校验（灰度期新旧 Schema 共存）。
- `enum` 不建 PG 类型、不加 CHECK：加枚举值不该要 DDL。
- `formula` 字段不落库，只进 TS 形态（`readonly`），Java 行形态不承载。
- `Index.where` 是表达式（Expr），本步骤不编译部分索引条件，索引按全量建立。
- `storage.partitionBy` 分区表未生成，待 DDL 编译器接入。
- `auditLog=true` 的审计写入在平台侧 `lcp_audit_log`，不在业务表建触发器。
- 跨实体外键、`Field.refConstraint` 未生成真实 FK：协议默认软关联。
- `LcpEnumRef` 是平台 runtime 注解的占位实现，接入平台后换 import 即可。

## 表与实体

| 表 | 实体 | TS 类型 | Java 类 |
|---|---|---|---|
| `edu_employee` | employee | `Employee` | `Employee` |
| `edu_leave_request` | leave_request | `LeaveRequest` | `LeaveRequest` |
| `edu_attachment` | attachment | `Attachment` | `Attachment` |

## 文件清单（12 个产物 + 本文件；另有 GENERATED.txt 清单）

- `java/src/main/java/dev/lcp/generated/leave_approval/entity/Attachment.java`
- `java/src/main/java/dev/lcp/generated/leave_approval/entity/Employee.java`
- `java/src/main/java/dev/lcp/generated/leave_approval/entity/LeaveRequest.java`
- `java/src/main/java/dev/lcp/generated/leave_approval/support/LcpEnumRef.java`
- `sql/00_extensions.sql`
- `sql/10_edu_employee.sql`
- `sql/11_edu_leave_request.sql`
- `sql/12_edu_attachment.sql`
- `sql/90_rls.sql`
- `sql/README.md`
- `ts/entities.ts`
- `ts/index.ts`

## 统计

- 表 3 个，列 48 个
- JSONB 内字段 10 个，派生字段 0 个
