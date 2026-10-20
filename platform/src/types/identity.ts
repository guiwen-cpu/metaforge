export interface IdentityUserRole {
  app_id?: string | null;
  app_key?: string | null;
  role_key: string;
  role_name?: string;
}

export interface IdentityUser {
  id: string;
  username: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  dept_id?: string | null;
  dept_name?: string | null;
  position_id?: string | null;
  position_name?: string | null;
  status: string;
  role_keys?: string[];
  roles?: IdentityUserRole[];
}

export interface DepartmentView {
  id: string;
  key: string;
  name: string;
  parent_id?: string | null;
  path: string;
  sort: number;
  leader_user_id?: string | null;
  leader_name?: string | null;
  enabled: boolean;
}

export interface PositionView {
  id: string;
  key: string;
  name: string;
  dept_id?: string | null;
  dept_name?: string | null;
  sort: number;
  enabled: boolean;
}

export interface RoleView {
  id: string;
  key: string;
  name: string;
  level: string;
  data_scope: string;
  builtin: boolean;
  description?: string | null;
  app_id?: string | null;
}

export interface IdentityOverview {
  departments: DepartmentView[];
  positions: PositionView[];
  users: IdentityUser[];
  roles: RoleView[];
}

export interface PasswordPolicy {
  min_length: number;
  max_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_symbol: boolean;
}

export interface AuthAudit {
  id: string;
  user_id?: string | null;
  username: string;
  event_type: string;
  success: boolean;
  reason?: string | null;
  auth_method: string;
  ip?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AuthAuditQuery {
  eventType?: string;
  username?: string;
  success?: boolean;
  limit?: number;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: IdentityUser;
}

export interface DepartmentPayload {
  id?: string;
  key?: string;
  name: string;
  parentId?: string | null;
  sort?: number;
  leaderUserId?: string | null;
  enabled?: boolean;
}

export interface PositionPayload {
  id?: string;
  key?: string;
  name: string;
  deptId?: string | null;
  sort?: number;
  enabled?: boolean;
}

export interface UserPayload {
  id?: string;
  username?: string;
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  deptId?: string | null;
  positionId?: string | null;
  status?: string;
  password?: string;
}