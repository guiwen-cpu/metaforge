-- 必须在建表与 RLS 之后执行。执行者必须是 metaforge_owner。
grant connect on database metaforge to metaforge_app;
grant usage on schema public to metaforge_app;
grant select, insert, update, delete on all tables in schema public to metaforge_app;
grant usage, select on all sequences in schema public to metaforge_app;

alter default privileges for role metaforge_owner in schema public
  grant select, insert, update, delete on tables to metaforge_app;
alter default privileges for role metaforge_owner in schema public
  grant usage, select on sequences to metaforge_app;
