-- 由 tools/gen-entity.mjs 生成，勿手改。
-- 单表文件：附件（attachment）→ edu_attachment
-- 幂等：create table if not exists / create index if not exists，可重复执行。
-- 本文件不含事务控制：并发建索引必须在事务块外执行。

-- ----------------------------------------------------------------
-- 附件 · attachment  →  edu_attachment
-- 统一附件中心，所有业务的文件元数据都落这里
-- 字段 9 个（列 15 个，其中 JSONB 文档内 1 个）
create table if not exists "edu_attachment" (
  "id" char(26) not null,
  "tenant_id" varchar(64) not null,
  "biz_type" varchar(64),
  "biz_id" varchar(26),
  "file_name" varchar(255),
  "object_key" varchar(512),
  "mime" varchar(128),
  "size" bigint,
  "kind" varchar(64),
  "ext" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by" varchar(64),
  "updated_by" varchar(64),
  "deleted_at" timestamptz,
  constraint "pk_edu_attachment" primary key ("id"),
  constraint "ck_edu_attachment_soft_delete" check ("deleted_at" is null or "deleted_at" >= "created_at")
);
comment on table "edu_attachment" is '附件 — 统一附件中心，所有业务的文件元数据都落这里';
comment on column "edu_attachment"."id" is '主键；必填（应用层校验）；创建后不可改；列类型被 columnType 覆盖（默认 varchar(255)）';
comment on column "edu_attachment"."tenant_id" is '租户列，平台注入';
comment on column "edu_attachment"."biz_type" is '业务类型；必填（应用层校验）；参与全局搜索';
comment on column "edu_attachment"."biz_id" is '业务主键；必填（应用层校验）；参与全局搜索';
comment on column "edu_attachment"."file_name" is '文件名；必填（应用层校验）；参与全局搜索';
comment on column "edu_attachment"."object_key" is 'OSS 对象键；必填（应用层校验）；创建后不可改';
comment on column "edu_attachment"."mime" is 'MIME';
comment on column "edu_attachment"."size" is '字节数；必填（应用层校验）；列类型被 columnType 覆盖（默认 integer）';
comment on column "edu_attachment"."kind" is '类别；枚举值：image / video / document / other';
comment on column "edu_attachment"."ext" is '承载 storage=jsonb 的字段：checksum';
comment on column "edu_attachment"."created_at" is '时间戳，平台注入';
comment on column "edu_attachment"."updated_at" is '时间戳，平台注入';
comment on column "edu_attachment"."created_by" is '操作人，平台注入';
comment on column "edu_attachment"."updated_by" is '操作人，平台注入';
comment on column "edu_attachment"."deleted_at" is '软删除标记，平台注入';

-- ---------------------------------------------------------------- 索引
create index concurrently if not exists "idx_attach_biz" on "edu_attachment" ("biz_type", "biz_id");
