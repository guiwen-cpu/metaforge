-- 连接器变更审计。快照只保留非敏感配置，请求头值在写入前统一脱敏。
create table if not exists lcp_connection_audit (
  id            uuid primary key,
  tenant_id     text not null,
  connection_id uuid not null,
  connection_key text not null,
  action        text not null,
  actor         text not null,
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz not null default now(),
  constraint ck_lcp_connection_audit_action
    check (action in ('create', 'update', 'delete')),
  constraint ck_lcp_connection_audit_before
    check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint ck_lcp_connection_audit_after
    check (after_state is null or jsonb_typeof(after_state) = 'object')
);

comment on table lcp_connection_audit is '连接器创建、修改、删除审计；before/after 为脱敏快照。';
comment on column lcp_connection_audit.before_state is '变更前快照；请求头值统一替换为 ***。';
comment on column lcp_connection_audit.after_state is '变更后快照；请求头值统一替换为 ***。';

create index if not exists ix_lcp_connection_audit_tenant_created
  on lcp_connection_audit (tenant_id, created_at desc);
create index if not exists ix_lcp_connection_audit_connection
  on lcp_connection_audit (tenant_id, connection_id, created_at desc);

alter table lcp_connection_audit enable row level security;
drop policy if exists lcp_connection_audit_tenant_isolation on lcp_connection_audit;
create policy lcp_connection_audit_tenant_isolation on lcp_connection_audit
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));