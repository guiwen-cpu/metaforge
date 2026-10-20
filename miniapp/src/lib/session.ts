import { SESSION_STORAGE_KEY } from "@/lib/config";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  deptId: string | null;
  deptName: string | null;
  roleKeys: string[];
}

export interface SessionState {
  token: string;
  expiresAt: string;
  tenant: string;
  user: SessionUser;
  appId?: string;
}

let cached: SessionState | null | undefined;
let redirecting = false;

function readStorage(): SessionState | null {
  try {
    const raw = uni.getStorageSync(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as SessionState) : (raw as SessionState);
    if (!parsed || typeof parsed !== "object" || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function expired(session: SessionState): boolean {
  if (!session.expiresAt) return false;
  const time = Date.parse(session.expiresAt);
  return Number.isFinite(time) ? time <= Date.now() : false;
}

export function normalizeUser(raw: Record<string, unknown>): SessionUser {
  const roles = raw.role_keys ?? raw.roleKeys ?? [];
  return {
    id: String(raw.id ?? raw.username ?? ""),
    username: String(raw.username ?? ""),
    displayName: String(raw.display_name ?? raw.displayName ?? raw.username ?? ""),
    deptId: raw.dept_id ? String(raw.dept_id) : raw.deptId ? String(raw.deptId) : null,
    deptName: raw.dept_name ? String(raw.dept_name) : raw.deptName ? String(raw.deptName) : null,
    roleKeys: Array.isArray(roles) ? roles.map((item) => String(item)) : []
  };
}

export function getSession(): SessionState | null {
  if (cached === undefined) cached = readStorage();
  if (!cached) return null;
  if (expired(cached)) {
    clearSession();
    return null;
  }
  return cached;
}

export function ensureSession(): SessionState | null {
  return getSession();
}

export function setSession(session: SessionState): void {
  cached = session;
  redirecting = false;
  try {
    uni.setStorageSync(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // 存储失败时仍保留内存会话，避免阻断当前页面。
  }
}

export function updateSessionAppId(appId: string): void {
  const session = getSession();
  if (!session || !appId) return;
  setSession({ ...session, appId });
}

export function clearSession(): void {
  cached = null;
  try {
    uni.removeStorageSync(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  clearSession();
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1].route ?? "" : "";
  if (current === "pages/login/index") {
    redirecting = false;
    return;
  }
  uni.reLaunch({
    url: "/pages/login/index",
    complete: () => {
      setTimeout(() => {
        redirecting = false;
      }, 800);
    }
  });
}
