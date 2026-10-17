-- 应用角色：只有 DML 权限，RLS 才会对它生效。
select format('create role metaforge_app login password %L', :'app_pw')
where not exists (select 1 from pg_roles where rolname = 'metaforge_app')
\gexec

alter role metaforge_app with login password :'app_pw';
