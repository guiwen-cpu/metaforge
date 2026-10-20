-- 身份与组织：部门、岗位、用户、角色、用户角色。
-- 部门 / 岗位 / 用户沿用业务侧的可读主键（如 dept_cs），与业务表 dept_id 直接对齐；
-- 应用级角色由发布件 artifacts.roles 同步，用户授权按 app_id + role_key 绑定。
create table if not exists lcp_department (
  id              text primary key,
  tenant_id       text not null,
  dept_key        text not null,
  name            text not null,
  parent_id       text,
  path            text not null default '',
  sort            integer not null default 0,
  leader_user_id  text,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_lcp_department_tenant_id unique (tenant_id, id),
  constraint uq_lcp_department_tenant_key unique (tenant_id, dept_key),
  constraint fk_lcp_department_parent foreign key (tenant_id, parent_id)
    references lcp_department (tenant_id, id) on delete set null
);

comment on table lcp_department is '租户组织架构。path 是物化路径（如 /dept_root/dept_cs），用于 deptAndChildren 数据范围。';

create table if not exists lcp_position (
  id             text primary key,
  tenant_id      text not null,
  position_key   text not null,
  name           text not null,
  dept_id        text,
  sort           integer not null default 0,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint uq_lcp_position_tenant_id unique (tenant_id, id),
  constraint uq_lcp_position_tenant_key unique (tenant_id, position_key),
  constraint fk_lcp_position_dept foreign key (tenant_id, dept_id)
    references lcp_department (tenant_id, id) on delete set null
);

create table if not exists lcp_user (
  id             text primary key,
  tenant_id      text not null,
  username       text not null,
  display_name   text not null,
  email          text,
  phone          text,
  password_hash  text not null,
  dept_id        text,
  position_id    text,
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ck_lcp_user_status check (status in ('active', 'disabled')),
  constraint uq_lcp_user_tenant_id unique (tenant_id, id),
  constraint uq_lcp_user_tenant_username unique (tenant_id, username),
  constraint fk_lcp_user_dept foreign key (tenant_id, dept_id)
    references lcp_department (tenant_id, id) on delete set null,
  constraint fk_lcp_user_position foreign key (tenant_id, position_id)
    references lcp_position (tenant_id, id) on delete set null
);

comment on table lcp_user is '租户用户。id 与流程/动作日志中的 user_id 对齐，username 是登录名。';

create table if not exists lcp_role (
  id             uuid primary key,
  tenant_id      text not null,
  role_key       text not null,
  name           text not null,
  scope          text not null default 'app',
  app_id         uuid,
  data_scope     text not null default 'self',
  custom_rule    jsonb,
  builtin        boolean not null default false,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ck_lcp_role_scope check (scope in ('system', 'tenant', 'app')),
  constraint ck_lcp_role_data_scope check (data_scope in ('all', 'dept', 'deptAndChildren', 'self', 'custom', 'none')),
  constraint uq_lcp_role_tenant_id unique (tenant_id, id),
  constraint fk_lcp_role_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_role is '角色定义。应用级角色从 Bundle artifacts.roles 同步，租户级角色由管理员维护。';

create unique index if not exists uq_lcp_role_tenant_key_app
  on lcp_role (tenant_id, role_key, coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists lcp_user_role (
  tenant_id      text not null,
  user_id        text not null,
  app_id         uuid,
  role_key       text not null,
  granted_by     text,
  created_at     timestamptz not null default now(),
  constraint fk_lcp_user_role_user foreign key (tenant_id, user_id)
    references lcp_user (tenant_id, id) on delete cascade
);

create unique index if not exists uq_lcp_user_role_tenant_user_app_key
  on lcp_user_role (tenant_id, user_id, coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid), role_key);
create index if not exists ix_lcp_user_role_role on lcp_user_role (tenant_id, app_id, role_key);

alter table lcp_department enable row level security;
drop policy if exists lcp_department_tenant_isolation on lcp_department;
create policy lcp_department_tenant_isolation on lcp_department
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_position enable row level security;
drop policy if exists lcp_position_tenant_isolation on lcp_position;
create policy lcp_position_tenant_isolation on lcp_position
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_user enable row level security;
drop policy if exists lcp_user_tenant_isolation on lcp_user;
create policy lcp_user_tenant_isolation on lcp_user
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_role enable row level security;
drop policy if exists lcp_role_tenant_isolation on lcp_role;
create policy lcp_role_tenant_isolation on lcp_role
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_user_role enable row level security;
drop policy if exists lcp_user_role_tenant_isolation on lcp_user_role;
create policy lcp_user_role_tenant_isolation on lcp_user_role
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));