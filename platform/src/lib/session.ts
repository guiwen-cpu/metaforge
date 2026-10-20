export interface SessionProfile {
  id: string;
  username: string;
  displayName: string;
  deptId: string | null;
  deptName: string | null;
  positionName: string | null;
  roleKeys: string[];
}

export interface SessionState {
  token: string;
  tenantId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
  roles: string[];
  profile: SessionProfile | null;
}

const STORAGE_KEY = "metaforge.studio.session";

const EMPTY: SessionState = {
  token: "",
  tenantId: "",
  userId: "",
  displayName: "",
  expiresAt: "",
  roles: [],
  profile: null
};

function empty(): SessionState {
  return { ...EMPTY, roles: [], profile: null };
}

function normalize(parsed: Partial<SessionState> & { roles?: unknown }): SessionState {
  const token = typeof parsed.token === "string" ? parsed.token : "";
  if (!token) return empty();
  return {
    token,
    tenantId: typeof parsed.tenantId === "string" ? parsed.tenantId : "",
    userId: typeof parsed.userId === "string" ? parsed.userId : "",
    displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
    expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : "",
    roles: Array.isArray(parsed.roles) ? parsed.roles.filter((item) => typeof item === "string") : [],
    profile: parsed.profile ?? null
  };
}

function load(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    return normalize(JSON.parse(raw) as Partial<SessionState>);
  } catch {
    return empty();
  }
}

function persist(state: SessionState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const session = {
  state: load(),

  isAuthenticated(): boolean {
    const state = this.state;
    if (!state.token) return false;
    if (!state.expiresAt) return true;
    const expires = Date.parse(state.expiresAt);
    return Number.isFinite(expires) && expires - Date.now() > 30_000;
  },

  setLogin(token: string, expiresAt: string, tenantId: string, profile: SessionProfile) {
    this.state = {
      token,
      tenantId,
      userId: profile.id,
      displayName: profile.displayName || profile.username || profile.id,
      expiresAt,
      roles: profile.roleKeys,
      profile
    };
    persist(this.state);
  },

  clear() {
    this.state = empty();
    localStorage.removeItem(STORAGE_KEY);
  }
};
