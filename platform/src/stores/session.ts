import { defineStore } from "pinia";
import { session, type SessionProfile, type SessionState } from "@/lib/session";

function snapshot(state: SessionState) {
  return {
    token: state.token,
    tenantId: state.tenantId,
    userId: state.userId,
    displayName: state.displayName,
    expiresAt: state.expiresAt,
    roles: [...state.roles],
    profile: state.profile
  };
}

export const useSessionStore = defineStore("session", {
  state: () => snapshot(session.state),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    initials: (state) => (state.displayName || state.userId || "M").slice(0, 1).toUpperCase(),
    canManageIdentity: (state) =>
      state.roles.includes("tenant_admin") || state.roles.includes("school_admin")
  },
  actions: {
    syncFromSession() {
      Object.assign(this, snapshot(session.state));
    },
    applyLogin(token: string, expiresAt: string, tenantId: string, profile: SessionProfile) {
      session.setLogin(token, expiresAt, tenantId, profile);
      this.syncFromSession();
    },
    logout() {
      session.clear();
      this.syncFromSession();
    }
  }
});