-- 由 tools/gen-entity.mjs 生成，勿手改。
-- 行级安全（RLS）：租户隔离的最后一道兜底，防止 BFF 漏加 tenant_id 条件。
--
-- 注意：RLS 默认对表 owner 不生效。若应用连接用户就是这些表的 owner（平台自建自用库），
--      需要额外执行 alter table ... force row level security，或让应用改用非 owner 角色。
--      为免误伤迁移账号，这里逐表给出注释版本，按部署形态自行启用。
-- 策略条件读会话变量 lcp.tenant_id：未设置时值为 NULL，条件恒不成立，即「看不到任何行」。

-- 人员（employee → edu_employee）
alter table "edu_employee" enable row level security;
-- alter table "edu_employee" force row level security;   -- 应用角色即表 owner 时打开
drop policy if exists "edu_employee_tenant_isolation" on "edu_employee";
create policy "edu_employee_tenant_isolation" on "edu_employee"
  using ("tenant_id" = current_setting('lcp.tenant_id', true))
  with check ("tenant_id" = current_setting('lcp.tenant_id', true));

-- 请假单（leave_request → edu_leave_request）
alter table "edu_leave_request" enable row level security;
-- alter table "edu_leave_request" force row level security;   -- 应用角色即表 owner 时打开
drop policy if exists "edu_leave_request_tenant_isolation" on "edu_leave_request";
create policy "edu_leave_request_tenant_isolation" on "edu_leave_request"
  using ("tenant_id" = current_setting('lcp.tenant_id', true))
  with check ("tenant_id" = current_setting('lcp.tenant_id', true));

-- 附件（attachment → edu_attachment）
alter table "edu_attachment" enable row level security;
-- alter table "edu_attachment" force row level security;   -- 应用角色即表 owner 时打开
drop policy if exists "edu_attachment_tenant_isolation" on "edu_attachment";
create policy "edu_attachment_tenant_isolation" on "edu_attachment"
  using ("tenant_id" = current_setting('lcp.tenant_id', true))
  with check ("tenant_id" = current_setting('lcp.tenant_id', true));

