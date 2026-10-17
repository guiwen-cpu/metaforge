# leave_approval · 数据库脚本

由 `tools/gen-entity.mjs` 生成，勿手改。执行顺序：

1. `00_extensions.sql` —— 扩展与运行时约定
2. `10_*.sql` —— 逐表建表 + 列注释 + 索引（顺序无所谓，无跨表外键）
3. `90_rls.sql` —— 行级安全策略

## 幂等与事务

- 全部 `create ... if not exists` / `drop ... if exists`，可重复执行。
- `create index concurrently` 不能在事务块内执行：不要用 `BEGIN/COMMIT` 包裹，
  也不要让迁移框架为每个文件自动开事务。

## 表清单

| 表 | 实体 | 项 | 列 | 索引 | 租户列 | 软删除 | 乐观锁 |
|---|---|---:|---:|---:|---|---|---|
| `edu_employee` | employee | 13 | 6 | 2 | tenant_id | deleted_at | 否 |
| `edu_leave_request` | leave_request | 20 | 12 | 4 | tenant_id | deleted_at | 是 |
| `edu_attachment` | attachment | 15 | 8 | 1 | tenant_id | deleted_at | 否 |

## 两条与直觉相反的设计

- 业务列一律可空：`required=true` 由应用层校验，不生成 `NOT NULL`，方便灰度期新旧 Schema 共存。
- `enum` 落 `varchar` 而非 PG enum 类型、也不加 CHECK 约束：新增枚举值不该要 DDL。
