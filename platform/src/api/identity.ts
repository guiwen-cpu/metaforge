import { http } from "@/lib/http";
import type {
  DepartmentPayload,
  IdentityOverview,
  IdentityUser,
  LoginResponse,
  PositionPayload,
  UserPayload
} from "@/types/identity";

export const authApi = {
  async login(tenant: string, username: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<LoginResponse>("/auth/login", { tenant, username, password });
    return data;
  },

  async me(): Promise<IdentityUser> {
    const { data } = await http.get<IdentityUser>("/auth/me");
    return data;
  },

  async logout(): Promise<void> {
    await http.post("/auth/logout");
  }
};

export const identityApi = {
  async overview(appId?: string): Promise<IdentityOverview> {
    const { data } = await http.get<IdentityOverview>("/platform/identity/overview", {
      params: appId ? { appId } : undefined
    });
    return data;
  },

  async createDepartment(payload: DepartmentPayload) {
    const { data } = await http.post("/platform/identity/departments", departmentBody(payload));
    return data;
  },

  async updateDepartment(id: string, payload: DepartmentPayload) {
    const { data } = await http.put(
      `/platform/identity/departments/${encodeURIComponent(id)}`,
      departmentBody(payload)
    );
    return data;
  },

  async deleteDepartment(id: string): Promise<void> {
    await http.delete(`/platform/identity/departments/${encodeURIComponent(id)}`);
  },

  async createPosition(payload: PositionPayload) {
    const { data } = await http.post("/platform/identity/positions", positionBody(payload));
    return data;
  },

  async updatePosition(id: string, payload: PositionPayload) {
    const { data } = await http.put(
      `/platform/identity/positions/${encodeURIComponent(id)}`,
      positionBody(payload)
    );
    return data;
  },

  async deletePosition(id: string): Promise<void> {
    await http.delete(`/platform/identity/positions/${encodeURIComponent(id)}`);
  },

  async createUser(payload: UserPayload) {
    const { data } = await http.post("/platform/identity/users", userBody(payload));
    return data;
  },

  async updateUser(id: string, payload: UserPayload) {
    const { data } = await http.put(
      `/platform/identity/users/${encodeURIComponent(id)}`,
      userBody(payload)
    );
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    await http.delete(`/platform/identity/users/${encodeURIComponent(id)}`);
  },

  async setUserRoles(id: string, appId: string | null, roleKeys: string[]) {
    const { data } = await http.put(`/platform/identity/users/${encodeURIComponent(id)}/roles`, {
      app_id: appId,
      role_keys: roleKeys
    });
    return data;
  }
};

function departmentBody(payload: DepartmentPayload) {
  return {
    id: payload.id,
    key: payload.key,
    name: payload.name,
    parent_id: payload.parentId ?? null,
    sort: payload.sort,
    leader_user_id: payload.leaderUserId ?? null,
    enabled: payload.enabled
  };
}

function positionBody(payload: PositionPayload) {
  return {
    id: payload.id,
    key: payload.key,
    name: payload.name,
    dept_id: payload.deptId ?? null,
    sort: payload.sort,
    enabled: payload.enabled
  };
}

function userBody(payload: UserPayload) {
  return {
    id: payload.id,
    username: payload.username,
    display_name: payload.displayName,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    password: payload.password,
    dept_id: payload.deptId ?? null,
    position_id: payload.positionId ?? null,
    status: payload.status,
    app_id: null,
    role_keys: []
  };
}