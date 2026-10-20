-- 集成连接器与租户密钥库。
-- 连接器只保存非敏感配置；密钥值使用 AES-GCM 加密后写入 bytea，任何接口都不返回明文。
create table if not exists lcp_connection (
  id             uuid primary key,
  tenant_id      text not null,
  connection_key text not null,
  name           text not null,
  kind           text not null default 'rest',
  base_url       text,
  config         jsonb not null default '{}'::jsonb,
  enabled        boolean not null default true,
  created_by     text not null,
  updated_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ck_lcp_connection_kind
    check (kind in ('rest', 'graphql', 'soap', 'database', 'internal')),
  constraint ck_lcp_connection_config_object
    check (jsonb_typeof(config) = 'object')
);

comment on table lcp_connection is '租户连接器注册表：地址、公共请求头、超时与默认鉴权引用。';
comment on column lcp_connection.config is '非敏感配置：timeoutMs / headers / auth；凭证只能写 secret:<key> 引用。';

create unique index if not exists uq_lcp_connection_tenant_key
  on lcp_connection (tenant_id, connection_key);
create index if not exists ix_lcp_connection_tenant_updated
  on lcp_connection (tenant_id, updated_at desc);

create table if not exists lcp_secret (
  id           uuid primary key,
  tenant_id    text not null,
  secret_key   text not null,
  name         text not null,
  description  text,
  ciphertext   bytea not null,
  iv           bytea not null,
  key_version  integer not null default 1,
  created_by   text not null,
  updated_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  rotated_at   timestamptz,
  constraint ck_lcp_secret_key_version check (key_version > 0)
);

comment on table lcp_secret is '租户密钥库。ciphertext 为 AES-GCM 密文（含认证标签），AAD 绑定 tenant_id 与 secret_key。';
comment on column lcp_secret.iv is '每次加密随机生成的 12 字节 GCM nonce。';
comment on column lcp_secret.rotated_at is '最近一次轮换密钥值的时间；元数据更新不改变该字段。';

create unique index if not exists uq_lcp_secret_tenant_key
  on lcp_secret (tenant_id, secret_key);
create index if not exists ix_lcp_secret_tenant_updated
  on lcp_secret (tenant_id, updated_at desc);

alter table lcp_connection enable row level security;
drop policy if exists lcp_connection_tenant_isolation on lcp_connection;
create policy lcp_connection_tenant_isolation on lcp_connection
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));

alter table lcp_secret enable row level security;
drop policy if exists lcp_secret_tenant_isolation on lcp_secret;
create policy lcp_secret_tenant_isolation on lcp_secret
  using (tenant_id = current_setting('lcp.tenant_id', true))
  with check (tenant_id = current_setting('lcp.tenant_id', true));
