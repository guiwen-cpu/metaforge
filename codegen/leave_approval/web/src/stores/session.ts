import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { request } from "@/lib/http";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  roles: string[];
  deptId?: string;
  deptName?: string;
  avatar?: string;
}

interface IdentityUser {
  id: string;
  username: string;
  display_name: string;
  dept_id?: string | null;
  dept_name?: string | null;
  role_keys?: string[];
  roles?: Array<{ role_key: string }>;
}

interface LoginResponse {
  token: string;
  expires_at: string;
  user: IdentityUser;
}

const TOKEN_KEY = "lcp.token";
const TENANT_KEY = "lcp.tenant";
const USER_KEY = "lcp.user";
const DEFAULT_TENANT = "tenant_demo_school";

function readUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed || typeof parsed.id !== "string") return null;
    return { ...parsed, roles: Array.isArray(parsed.roles) ? parsed.roles : [] };
  } catch {
    return null;
  }
}

function toSessionUser(profile: IdentityUser): SessionUser {
  const roles = profile.role_keys ?? profile.roles?.map((role) => role.role_key) ?? [];
  return {
    id: profile.id,
    username: profile.username,
    name: profile.display_name,
    roles,
    deptId: profile.dept_id ?? undefined,
    deptName: profile.dept_name ?? undefined
  };
}

export const useSession = defineStore("session", () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? "");
  const tenantId = ref<string>(localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT);
  const user = ref<SessionUser | null>(readUser());
  const restored = ref(false);

  const roles = computed<string[]>(() => user.value?.roles ?? []);
  const isAuthenticated = computed<boolean>(() => token.value !== "" && user.value !== null);

  function signIn(next: { token?: string; tenantId?: string; user: SessionUser }): void {
    if (next.token !== undefined) token.value = next.token;
    if (next.tenantId) tenantId.value = next.tenantId;
    user.value = next.user;
  }

  function signOut(): void {
    token.value = "";
    user.value = null;
  }

  async function login(tenant: string, username: string, password: string): Promise<void> {
    const result = await request<LoginResponse>({
      method: "POST",
      url: "/api/v1/auth/login",
      data: { tenant, username, password }
    });
    signIn({ token: result.token, tenantId: tenant, user: toSessionUser(result.user) });
    restored.value = true;
  }

  /** 页面刷新后用 Bearer 令牌恢复会话；令牌失效时清空本地状态并回到登录页。 */
  async function restore(): Promise<boolean> {
    if (restored.value) return isAuthenticated.value;
    if (!token.value) {
      restored.value = true;
      return false;
    }
    try {
      const profile = await request<IdentityUser>({ url: "/api/v1/auth/me" });
      user.value = toSessionUser(profile);
      return true;
    } catch {
      signOut();
      return false;
    } finally {
      restored.value = true;
    }
  }

  watch(
    [token, tenantId, user],
    () => {
      if (token.value) localStorage.setItem(TOKEN_KEY, token.value);
      else localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(TENANT_KEY, tenantId.value);
      if (user.value) localStorage.setItem(USER_KEY, JSON.stringify(user.value));
      else localStorage.removeItem(USER_KEY);
    },
    { deep: true, flush: "sync" }
  );

  return { token, tenantId, user, roles, isAuthenticated, restored, signIn, signOut, login, restore };
});
