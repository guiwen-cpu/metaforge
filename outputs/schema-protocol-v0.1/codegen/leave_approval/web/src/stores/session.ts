import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";

export interface SessionUser {
  id: string;
  name: string;
  roles: string[];
  deptId?: string;
  avatar?: string;
}

const TOKEN_KEY = "lcp.token";
const TENANT_KEY = "lcp.tenant";
const USER_KEY = "lcp.user";

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

export const useSession = defineStore("session", () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? "");
  const tenantId = ref<string>(localStorage.getItem(TENANT_KEY) ?? "demo");
  const user = ref<SessionUser | null>(readUser());

  const roles = computed<string[]>(() => user.value?.roles ?? []);
  const isAuthenticated = computed<boolean>(() => user.value !== null);

  function signIn(next: { token?: string; tenantId?: string; user: SessionUser }): void {
    if (next.token !== undefined) token.value = next.token;
    if (next.tenantId) tenantId.value = next.tenantId;
    user.value = next.user;
  }

  function signOut(): void {
    token.value = "";
    user.value = null;
  }

  /** 生成项目的占位会话：接入平台后换成 SSO / JWT 回调，不要在生产保留自动登录。 */
  function ensureDemoSession(): void {
    if (user.value) return;
    signIn({
      user: {
        id: "demo-user",
        name: "演示用户",
        roles: ["student"]
      }
    });
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
    { deep: true }
  );

  return { token, tenantId, user, roles, isAuthenticated, signIn, signOut, ensureDemoSession };
});
