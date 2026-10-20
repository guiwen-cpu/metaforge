-- 演示租户身份种子。密码：alice123 / bob123 / principal123 / hr123（PBKDF2-SHA256）。
insert into lcp_department (id, tenant_id, dept_key, name, parent_id, path, sort, leader_user_id)
values
  ('dept_root', 'tenant_demo_school', 'dept_root', '示范学院', null, '/dept_root', 0, 'principal'),
  ('dept_cs', 'tenant_demo_school', 'dept_cs', '计算机系', 'dept_root', '/dept_root/dept_cs', 10, 'bob'),
  ('dept_math', 'tenant_demo_school', 'dept_math', '数学系', 'dept_root', '/dept_root/dept_math', 20, null)
on conflict (id) do update set
  name = excluded.name,
  parent_id = excluded.parent_id,
  path = excluded.path,
  sort = excluded.sort,
  leader_user_id = excluded.leader_user_id,
  updated_at = now();

insert into lcp_position (id, tenant_id, position_key, name, dept_id, sort)
values
  ('pos_student', 'tenant_demo_school', 'pos_student', '学生', 'dept_cs', 10),
  ('pos_teacher', 'tenant_demo_school', 'pos_teacher', '教师', 'dept_cs', 20),
  ('pos_admin', 'tenant_demo_school', 'pos_admin', '行政人员', 'dept_root', 30)
on conflict (id) do update set
  name = excluded.name,
  dept_id = excluded.dept_id,
  sort = excluded.sort,
  updated_at = now();

insert into lcp_user (id, tenant_id, username, display_name, email, phone, password_hash, dept_id, position_id, status)
values
  ('alice', 'tenant_demo_school', 'alice', 'Alice', 'alice@demo.school', null,
   'pbkdf2-sha256$120000$/iJbpfAvxcxLUJgVEwileA==$etr8Ryb+UnNDnVRNH1glZfhWXxFk9O0vSpw7DR/O6q8=',
   'dept_cs', 'pos_student', 'active'),
  ('bob', 'tenant_demo_school', 'bob', 'Bob（系主任）', 'bob@demo.school', null,
   'pbkdf2-sha256$120000$Y9RnaX2+JioN69Z5YQiUGw==$XNv3hkc2SVFhwKTLjKR7Xfm3L0XN6bp2Y7qPqEmBWrw=',
   'dept_cs', 'pos_teacher', 'active'),
  ('principal', 'tenant_demo_school', 'principal', '院长', 'principal@demo.school', null,
   'pbkdf2-sha256$120000$lV6ooHRk8dQOAD634osN/g==$wMUYtXGVOkN8YcfKS9OMzxT3c+/zzqthxHFl4D9rQ/M=',
   'dept_root', 'pos_admin', 'active'),
  ('hr', 'tenant_demo_school', 'hr', '人事专员', 'hr@demo.school', null,
   'pbkdf2-sha256$120000$TCfIlpIVIW3bHG3ARzMeOA==$ENuj72ap5m1N7x/OYEbsUfipb4/+nlQuM45tZr+dtoY=',
   'dept_root', 'pos_admin', 'active')
on conflict (id) do update set
  display_name = excluded.display_name,
  email = excluded.email,
  password_hash = excluded.password_hash,
  dept_id = excluded.dept_id,
  position_id = excluded.position_id,
  status = excluded.status,
  updated_at = now();

insert into lcp_role (id, tenant_id, role_key, name, scope, app_id, data_scope, builtin)
values
  ('11111111-1111-1111-1111-111111111111', 'tenant_demo_school', 'tenant_admin', '租户管理员', 'tenant', null, 'all', true)
on conflict (id) do update set
  name = excluded.name,
  data_scope = excluded.data_scope,
  updated_at = now();

insert into lcp_user_role (tenant_id, user_id, app_id, role_key, granted_by)
values
  ('tenant_demo_school', 'alice', 'eb84d4bd-461f-4945-9f76-7d69ce732d8b', 'student', 'seed'),
  ('tenant_demo_school', 'bob', 'eb84d4bd-461f-4945-9f76-7d69ce732d8b', 'dept_manager', 'seed'),
  ('tenant_demo_school', 'principal', 'eb84d4bd-461f-4945-9f76-7d69ce732d8b', 'school_admin', 'seed'),
  ('tenant_demo_school', 'hr', 'eb84d4bd-461f-4945-9f76-7d69ce732d8b', 'hr_admin', 'seed'),
  ('tenant_demo_school', 'principal', null, 'tenant_admin', 'seed')
on conflict do nothing;