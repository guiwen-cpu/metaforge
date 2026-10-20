-- 由 tools/gen-project.mjs 生成，勿手改。
-- 独立工程使用同一个数据库用户建表与运行，因此必须 FORCE RLS；
-- 租户变量由 server 的 TenantTransactionAspect 在每个请求事务内设置。

alter table "edu_employee" force row level security;
alter table "edu_leave_request" force row level security;
alter table "edu_attachment" force row level security;
