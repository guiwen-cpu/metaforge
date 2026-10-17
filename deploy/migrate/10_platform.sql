-- 控制平面元数据：应用、草稿、发布版本。
-- 由 deploy/migrate/run.sh 在 00_role.sql 之后、业务 /sql/*.sql 之前执行。
--
-- 两条硬约束：
-- 1. 版本表 append-only：回滚不是覆盖历史，而是把历史内容重新发布成新版本；
-- 2. 版本表与租户表用复合外键绑定，跨租户引用在数据库层即不可能成立。
--
-- 幂等：可重复执行。
create extension if not exists pgcrypto;

create table if not exists lcp_application (
  id               uuid primary key,
  tenant_id        text not null,
  app_key          text not null,
  name             text not null,
  description      text,
  icon             text,
  app_type         text not null default 'business',
  category         text,
  status           text not null default 'draft',
  current_version  integer,
  draft_bundle     jsonb,
  draft_revision   bigint not null default 1,
  draft_updated_at timestamptz,
  draft_updated_by text,
  semantic         jsonb,
  created_by       text not null,
  updated_by       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint ck_lcp_application_status check (status in ('draft', 'published', 'archived')),
  constraint uq_lcp_application_tenant_id unique (tenant_id, id)
);

comment on table lcp_application is '应用（控制平面聚合根）。app_key 在租户内唯一，删除为软删除。';
comment on column lcp_application.draft_bundle is '设计器工作副本，允许不完整；发布后不回写。';
comment on column lcp_application.draft_revision is '草稿乐观锁版本，每次保存 +1。';
comment on column lcp_application.current_version is '当前线上版本号，指向 lcp_app_version.version_no。';

create unique index if not exists uq_lcp_application_tenant_key
  on lcp_application (tenant_id, app_key) where deleted_at is null;
create index if not exists ix_lcp_application_tenant_updated
  on lcp_application (tenant_id, updated_at desc) where deleted_at is null;

create table if not exists lcp_app_version (
  id               uuid primary key,
  tenant_id        text not null,
  app_id           uuid not null,
  version_no       integer not null,
  status           text not null default 'published',
  message          text not null,
  bundle           jsonb not null,
  checksum         text not null,
  protocol_version text,
  snapshot_id      text not null,
  based_on         uuid,
  rollback_of      uuid,
  created_by       text not null,
  created_at       timestamptz not null default now(),
  published_at     timestamptz not null default now(),
  constraint ck_lcp_app_version_no check (version_no >= 1),
  constraint ck_lcp_app_version_status check (status in ('published', 'archived')),
  constraint uq_lcp_app_version_tenant_id unique (tenant_id, id),
  constraint uq_lcp_app_version_no unique (tenant_id, app_id, version_no),
  constraint fk_lcp_app_version_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade,
  constraint fk_lcp_app_version_based_on foreign key (tenant_id, based_on)
    references lcp_app_version (tenant_id, id),
  constraint fk_lcp_app_version_rollback_of foreign key (tenant_id, rollback_of)
    references lcp_app_version (tenant_id, id)
);

comment on table lcp_app_version is '发布版本（append-only）。bundle 为已盖版本戳的完整发布件。';
comment on column lcp_app_version.bundle is '完整 { bundle: {...} } 发布件，snapshot 已由平台盖章。';
comment on column lcp_app_version.checksum is '规范化 JSON 的 SHA-256 十六进制摘要。';
comment on column lcp_app_version.based_on is '父版本，用于版本链追溯。';
comment on column lcp_app_version.rollback_of is '本版本由哪个历史版本回滚而来。';

create index if not exists ix_lcp_app_version_app
  on lcp_app_version (tenant_id, app_id, version_no desc);
create index if not exists ix_lcp_app_version_created
  on lcp_app_version (tenant_id, created_at desc);

-- 版本表 append-only：应用角色只有 DML，代码路径不会改写历史；这里再加一道数据库兜底。
-- 需要清理数据时显式 set local lcp.allow_purge = 'on'（仅限运维脚本，业务连接绝不设置）。
create or replace function lcp_app_version_append_only() returns trigger
language plpgsql as $$
begin
  if current_setting('lcp.allow_purge', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'lcp_app_version is append-only (op=%)', tg_op;
end;
$$;

drop trigger if exists trg_lcp_app_version_append_only on lcp_app_version;
create trigger trg_lcp_app_version_append_only
  before update or delete on lcp_app_version
  for each row execute function lcp_app_version_append_only();

-- RLS 兜底：策略读会话变量 lcp.tenant_id（由 BFF 事务切面注入）。
-- 未设置时 current_setting 返回 NULL，任何行都不匹配，失败即关闭。
alter table lcp_application enable row level security;
drop policy if exists lcp_application_tenant_isolation on lcp_application;
create policy lcp_application_tenant_isolation on lcp_application
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_app_version enable row level security;
drop policy if exists lcp_app_version_tenant_isolation on lcp_app_version;
create policy lcp_app_version_tenant_isolation on lcp_app_version
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));
