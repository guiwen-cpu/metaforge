-- 由 tools/gen-entity.mjs 生成，勿手改。
-- 单表文件：请假单（leave_request）→ edu_leave_request
-- 幂等：create table if not exists / create index if not exists，可重复执行。
-- 本文件不含事务控制：并发建索引必须在事务块外执行。

-- ----------------------------------------------------------------
-- 请假单 · leave_request  →  edu_leave_request
-- 记录一次请假申请及其审批结果
-- 字段 18 个（列 20 个，其中 JSONB 文档内 6 个）
create table if not exists "edu_leave_request" (
  "id" char(26) not null,
  "tenant_id" varchar(64) not null,
  "applicant_id" char(26),
  "applicant_name" varchar(64),
  "dept_id" varchar(26),
  "leave_type" varchar(64),
  "start_at" timestamptz,
  "end_at" timestamptz,
  "days" numeric(6,2),
  "status" varchar(64) default 'draft',
  "process_instance_id" varchar(64),
  "approver_id" varchar(26),
  "approved_at" timestamptz,
  "ext" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "deleted_at" timestamptz,
  "version" integer not null default 0,
  constraint "pk_edu_leave_request" primary key ("id"),
  constraint "ck_edu_leave_request_soft_delete" check ("deleted_at" is null or "deleted_at" >= "created_at")
);
comment on table "edu_leave_request" is '请假单 — 记录一次请假申请及其审批结果';
comment on column "edu_leave_request"."id" is '主键；必填（应用层校验）；创建后不可改；列类型被 columnType 覆盖（默认 varchar(255)）';
comment on column "edu_leave_request"."tenant_id" is '租户列，平台注入';
comment on column "edu_leave_request"."applicant_id" is '申请人；必填（应用层校验）；创建后不可改；列类型被 columnType 覆盖（默认 varchar(32)）';
comment on column "edu_leave_request"."applicant_name" is '申请人姓名；参与全局搜索';
comment on column "edu_leave_request"."dept_id" is '所属部门；必填（应用层校验）；参与全局搜索';
comment on column "edu_leave_request"."leave_type" is '请假类型；必填（应用层校验）；参与全局搜索；枚举值：personal / sick / annual / compensatory / marriage / maternity';
comment on column "edu_leave_request"."start_at" is '开始时间；必填（应用层校验）';
comment on column "edu_leave_request"."end_at" is '结束时间；必填（应用层校验）';
comment on column "edu_leave_request"."days" is '请假天数；必填（应用层校验）';
comment on column "edu_leave_request"."status" is '状态；必填（应用层校验）；参与全局搜索；枚举值：draft / pending / approved / rejected / returned / cancelled';
comment on column "edu_leave_request"."process_instance_id" is '流程实例；创建后不可改';
comment on column "edu_leave_request"."approver_id" is '当前审批人';
comment on column "edu_leave_request"."approved_at" is '审批完成时间';
comment on column "edu_leave_request"."ext" is '承载 storage=jsonb 的字段：reason, urgency, images, video_proof, documents, current_task';
comment on column "edu_leave_request"."created_at" is '时间戳，平台注入';
comment on column "edu_leave_request"."updated_at" is '时间戳，平台注入';
comment on column "edu_leave_request"."created_by" is '操作人，平台注入';
comment on column "edu_leave_request"."updated_by" is '操作人，平台注入';
comment on column "edu_leave_request"."deleted_at" is '软删除标记，平台注入';
comment on column "edu_leave_request"."version" is '乐观锁版本，BFF 更新时带版本条件';

-- ---------------------------------------------------------------- 索引
create index concurrently if not exists "idx_leave_applicant_time" on "edu_leave_request" ("applicant_id", "start_at");

-- 待办列表主查询路径
create index concurrently if not exists "idx_leave_status_dept" on "edu_leave_request" ("status", "dept_id");

create index concurrently if not exists "idx_leave_process" on "edu_leave_request" ("process_instance_id");

-- JSONB 字段的包含查询与全文检索
create index concurrently if not exists "gin_leave_ext" on "edu_leave_request" using gin ("ext");

-- auditLog=true：写入审计由平台侧 lcp_audit_log 统一记录，不在本表生成触发器
-- storage.comment：审批单据开启乐观锁与审计
