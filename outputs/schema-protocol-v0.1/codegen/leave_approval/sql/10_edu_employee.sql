-- 由 tools/gen-entity.mjs 生成，勿手改。
-- 单表文件：人员（employee）→ edu_employee
-- 幂等：create table if not exists / create index if not exists，可重复执行。
-- 本文件不含事务控制：并发建索引必须在事务块外执行。

-- ----------------------------------------------------------------
-- 人员 · employee  →  edu_employee
-- 组织内的学生与教职工主数据
-- 字段 9 个（列 13 个，其中 JSONB 文档内 3 个）
create table if not exists "edu_employee" (
  "id" char(26) not null,
  "tenant_id" varchar(64) not null,
  "employee_no" varchar(32),
  "name" varchar(64),
  "dept_id" varchar(26),
  "position" varchar(64),
  "hire_date" date,
  "ext" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "deleted_at" timestamptz,
  constraint "pk_edu_employee" primary key ("id"),
  constraint "ck_edu_employee_soft_delete" check ("deleted_at" is null or "deleted_at" >= "created_at")
);
comment on table "edu_employee" is '人员 — 组织内的学生与教职工主数据';
comment on column "edu_employee"."id" is '主键；必填（应用层校验）；创建后不可改；列类型被 columnType 覆盖（默认 varchar(255)）';
comment on column "edu_employee"."tenant_id" is '租户列，平台注入';
comment on column "edu_employee"."employee_no" is '工号/学号；必填（应用层校验）；唯一；创建后不可改；参与全局搜索';
comment on column "edu_employee"."name" is '姓名；必填（应用层校验）；参与全局搜索';
comment on column "edu_employee"."dept_id" is '所属部门；必填（应用层校验）；参与全局搜索';
comment on column "edu_employee"."position" is '身份类型；枚举值：student / teacher / staff';
comment on column "edu_employee"."hire_date" is '入学/入职日期';
comment on column "edu_employee"."ext" is '承载 storage=jsonb 的字段：dept_name, phone, id_card';
comment on column "edu_employee"."created_at" is '时间戳，平台注入';
comment on column "edu_employee"."updated_at" is '时间戳，平台注入';
comment on column "edu_employee"."created_by" is '操作人，平台注入';
comment on column "edu_employee"."updated_by" is '操作人，平台注入';
comment on column "edu_employee"."deleted_at" is '软删除标记，平台注入';

-- ---------------------------------------------------------------- 索引
-- 与 tenant_id 组成租户内唯一
-- 唯一性作用域收敛到租户内：前导列补 tenant_id（协议约定 Field.unique / Index.unique 均为租户内唯一）
-- 软删除表：唯一性只约束未删除行，故用部分唯一索引
-- 注意：唯一索引并发创建若失败会留下 INVALID 索引（IF NOT EXISTS 之后不再重建），需人工 drop 后重跑
create unique index concurrently if not exists "uk_employee_no" on "edu_employee" ("tenant_id", "employee_no")
  where "deleted_at" is null;

create index concurrently if not exists "idx_employee_dept" on "edu_employee" ("dept_id", "name");
