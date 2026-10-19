export interface SessionState {
  tenantId: string;
  userId: string;
}

const STORAGE_KEY = "metaforge.studio.session";
const DEFAULTS: SessionState = {
  tenantId: "tenant_demo_school",
  userId: "alice"
};

function load(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      tenantId: parsed.tenantId?.trim() || DEFAULTS.tenantId,
      userId: parsed.userId?.trim() || DEFAULTS.userId
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const session = {
  state: load(),
  set(next: Partial<SessionState>) {
    if (typeof next.tenantId === "string" && next.tenantId.trim()) {
      this.state.tenantId = next.tenantId.trim();
    }
    if (typeof next.userId === "string" && next.userId.trim()) {
      this.state.userId = next.userId.trim();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
};