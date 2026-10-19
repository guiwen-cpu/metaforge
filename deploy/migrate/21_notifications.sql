-- 运行时站内通知。首版只落站内信；邮件 / webhook 通道在连接器与密钥库完成后接入。
-- 通知与流程动作同事务写入，外部渠道失败不得回滚审批。
create table if not exists lcp_notification (
  id          uuid primary key,
  tenant_id   text not null,
  app_id      uuid not null,
  user_id     text not null,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  biz_type    text,
  biz_id      text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint fk_lcp_notification_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_notification is '站内通知。biz_type/biz_id 指向任务或流程实例，便于前端跳转与去重。';

create index if not exists ix_lcp_notification_user
  on lcp_notification (tenant_id, app_id, user_id, created_at desc);

-- 未读通知按业务对象去重，避免重复办理同一任务时刷屏；标记已读后允许再次提醒。
create unique index if not exists uq_lcp_notification_unread_biz
  on lcp_notification (tenant_id, user_id, type, biz_type, biz_id)
  where read_at is null and biz_id is not null;

alter table lcp_notification enable row level security;
drop policy if exists lcp_notification_tenant_isolation on lcp_notification;
create policy lcp_notification_tenant_isolation on lcp_notification
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));