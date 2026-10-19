import { defineStore } from "pinia";
import { session } from "@/lib/session";

export const useSessionStore = defineStore("session", {
  state: () => ({
    tenantId: session.state.tenantId,
    userId: session.state.userId
  }),
  actions: {
    update(tenantId: string, userId: string) {
      session.set({ tenantId, userId });
      this.tenantId = session.state.tenantId;
      this.userId = session.state.userId;
    }
  }
});