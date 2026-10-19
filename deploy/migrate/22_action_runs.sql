-- 动作运行日志：每次执行动作都落一条记录，trace / 回写 / 错误随行保存。
-- 日志与动作回写在同一请求事务内，失败动作同样保留，便于查询与重放。
create table if not exists lcp_action_run (
  id                  uuid primary key,
  tenant_id           text not null,
  app_id              uuid not null,
  version_no          integer not null,
  action_key          text not null,
  status              text not null,
  user_id             text,
  task_id             text,
  process_instance_id text,
  business_id         text,
  params              jsonb,
  context             jsonb,
  event               jsonb,
  result              jsonb,
  vars                jsonb,
  trace               jsonb,
  error               jsonb,
  writeback           jsonb,
  duration_ms         bigint not null default 0,
  replayed_from       uuid,
  created_at          timestamptz not null default now(),
  constraint fk_lcp_action_run_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_action_run is '发布态动作执行日志。params/context/event 支持失败重放，writeback 记录实际回写与推进结果。';

create index if not exists ix_lcp_action_run_app
  on lcp_action_run (tenant_id, app_id, created_at desc);

create index if not exists ix_lcp_action_run_instance
  on lcp_action_run (tenant_id, app_id, process_instance_id, created_at desc)
  where process_instance_id is not null;

create index if not exists ix_lcp_action_run_action
  on lcp_action_run (tenant_id, app_id, action_key, created_at desc);

alter table lcp_action_run enable row level security;
drop policy if exists lcp_action_run_tenant_isolation on lcp_action_run;
create policy lcp_action_run_tenant_isolation on lcp_action_run
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));
