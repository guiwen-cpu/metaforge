-- 运行时：Flowable 引擎与流程部署索引。
-- Flowable 自带表放在独立 schema，业务表继续由 app 角色 + RLS 保护。
create schema if not exists flowable authorization metaforge_app;
alter schema flowable owner to metaforge_app;

create table if not exists lcp_flow_deployment (
  id                    uuid primary key,
  tenant_id             text not null,
  app_id                uuid not null,
  version_no            integer not null,
  flow_key              text not null,
  process_key           text not null,
  deployment_id         text not null,
  process_definition_id text not null,
  checksum              text not null,
  deployed_at           timestamptz not null default now(),
  constraint uq_lcp_flow_deployment_version unique (tenant_id, app_id, version_no, flow_key),
  constraint fk_lcp_flow_deployment_app foreign key (tenant_id, app_id)
    references lcp_application (tenant_id, id) on delete cascade
);

comment on table lcp_flow_deployment is '发布版本到 Flowable 部署的映射；同一版本同一流程只部署一次。';

create index if not exists ix_lcp_flow_deployment_app
  on lcp_flow_deployment (tenant_id, app_id, version_no desc);

alter table lcp_flow_deployment enable row level security;
drop policy if exists lcp_flow_deployment_tenant_isolation on lcp_flow_deployment;
create policy lcp_flow_deployment_tenant_isolation on lcp_flow_deployment
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));
