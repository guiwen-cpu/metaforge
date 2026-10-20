-- 认证安全：密码策略相关的用户状态字段与认证审计。
alter table lcp_user add column if not exists failed_login_count integer not null default 0;
alter table lcp_user add column if not exists locked_until timestamptz;
alter table lcp_user add column if not exists password_changed_at timestamptz;
alter table lcp_user add column if not exists last_login_at timestamptz;
alter table lcp_user add column if not exists last_login_ip text;

comment on column lcp_user.failed_login_count is '连续登录失败次数；成功登录或管理员重置密码后归零。';
comment on column lcp_user.locked_until is '账号临时锁定截止时间；为空表示未锁定。';

create table if not exists lcp_auth_audit (
  id             uuid primary key,
  tenant_id      text not null,
  user_id        text,
  username       text not null,
  event_type     text not null,
  success        boolean not null,
  reason         text,
  auth_method    text not null default 'password',
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now(),
  constraint ck_lcp_auth_audit_event check (
    event_type in ('login_success', 'login_failure', 'password_change')
  )
);

comment on table lcp_auth_audit is '认证事件审计。user_id 可为空（例如登录名不存在），不设外键以便用户删除后保留审计。';
create index if not exists ix_lcp_auth_audit_tenant_time
  on lcp_auth_audit (tenant_id, created_at desc);
create index if not exists ix_lcp_auth_audit_tenant_user_time
  on lcp_auth_audit (tenant_id, user_id, created_at desc);
create index if not exists ix_lcp_auth_audit_tenant_username_time
  on lcp_auth_audit (tenant_id, username, created_at desc);

alter table lcp_auth_audit enable row level security;
drop policy if exists lcp_auth_audit_tenant_isolation on lcp_auth_audit;
create policy lcp_auth_audit_tenant_isolation on lcp_auth_audit
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));