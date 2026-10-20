-- 通知外发 outbox 与 SLA 提醒幂等表。
-- 站内信仍在审批事务内写入；webhook/email 只入队，由后台调度器投递。
create table if not exists lcp_notification_delivery (
  id              uuid primary key,
  tenant_id       text not null,
  app_id          uuid not null,
  notification_id uuid,
  channel         text not null,
  connection_ref  text,
  recipient       text,
  path            text,
  payload         jsonb not null,
  status          text not null default 'pending',
  attempts        integer not null default 0,
  last_error      text,
  idempotency_key text not null,
  next_attempt_at timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_lcp_notification_delivery_channel
    check (channel in ('inApp', 'webhook', 'email')),
  constraint ck_lcp_notification_delivery_status
    check (status in ('pending', 'sending', 'sent', 'failed', 'dead')),
  constraint ck_lcp_notification_delivery_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint fk_lcp_notification_delivery_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_notification_delivery is '外部通知投递 outbox。payload 在入队时冻结，失败只更新投递状态，不回滚审批。';
comment on column lcp_notification_delivery.idempotency_key is '同一租户、渠道、接收人下唯一，重试不会重复创建投递。';

create unique index if not exists uq_lcp_notification_delivery_idem
  on lcp_notification_delivery (tenant_id, idempotency_key, channel, recipient);
create index if not exists ix_lcp_notification_delivery_due
  on lcp_notification_delivery (tenant_id, status, next_attempt_at);
create index if not exists ix_lcp_notification_delivery_notification
  on lcp_notification_delivery (tenant_id, notification_id);

alter table lcp_notification_delivery enable row level security;
drop policy if exists lcp_notification_delivery_tenant_isolation
  on lcp_notification_delivery;
create policy lcp_notification_delivery_tenant_isolation
  on lcp_notification_delivery
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

create table if not exists lcp_sla_reminder (
  id                    uuid primary key,
  tenant_id             text not null,
  app_id                uuid not null,
  process_instance_id   text not null,
  task_id               text not null,
  stage                 text not null,
  notification_id       uuid,
  created_at            timestamptz not null default now(),
  constraint ck_lcp_sla_reminder_stage
    check (stage in ('warning', 'escalate')),
  constraint uq_lcp_sla_reminder_stage unique (tenant_id, task_id, stage),
  constraint fk_lcp_sla_reminder_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_sla_reminder is '任务 SLA 提醒幂等记录；同一任务同一阶段只提醒一次。';

create index if not exists ix_lcp_sla_reminder_instance
  on lcp_sla_reminder (tenant_id, process_instance_id);

alter table lcp_sla_reminder enable row level security;
drop policy if exists lcp_sla_reminder_tenant_isolation on lcp_sla_reminder;
create policy lcp_sla_reminder_tenant_isolation on lcp_sla_reminder
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

-- 调度器没有请求租户上下文。只暴露「存在哪些租户」这一最小信息集，
-- 具体业务数据仍在各租户事务内按 RLS 读取。
create or replace function lcp_active_tenants()
returns table (tenant_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.tenant_id
    from lcp_application a
   where a.deleted_at is null
   order by a.tenant_id
$$;

revoke all on function lcp_active_tenants() from public;
grant execute on function lcp_active_tenants() to metaforge_app;
