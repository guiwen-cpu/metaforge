-- SSO 外部身份绑定。provider + subject 由 IdP 保证稳定；本地用户仍以 lcp_user.id 为准。
alter table lcp_user add column if not exists sso_provider text;
alter table lcp_user add column if not exists sso_subject text;

comment on column lcp_user.sso_provider is '外部身份提供方标识，例如 school-oidc / school-cas。';
comment on column lcp_user.sso_subject is '外部身份唯一标识；与 sso_provider 组成绑定键。';

create unique index if not exists uq_lcp_user_sso_identity
  on lcp_user (tenant_id, sso_provider, sso_subject)
  where sso_subject is not null;
