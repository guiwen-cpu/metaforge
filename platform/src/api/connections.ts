import { http } from "@/lib/http";
import type {
  ConnectionAuditView,
  ConnectionPayload,
  ConnectionView,
  SecretPayload,
  SecretView
} from "@/types/connection";

export const connectionsApi = {
  async listConnections(): Promise<ConnectionView[]> {
    const { data } = await http.get<ConnectionView[]>("/platform/connections");
    return data;
  },

  async createConnection(payload: ConnectionPayload): Promise<ConnectionView> {
    const { data } = await http.post<ConnectionView>("/platform/connections", payload);
    return data;
  },

  async updateConnection(id: string, payload: Omit<ConnectionPayload, "key">): Promise<ConnectionView> {
    const { data } = await http.patch<ConnectionView>(
      `/platform/connections/${encodeURIComponent(id)}`,
      payload
    );
    return data;
  },

  async deleteConnection(id: string): Promise<void> {
    await http.delete(`/platform/connections/${encodeURIComponent(id)}`);
  },

  async listConnectionAudits(id: string): Promise<ConnectionAuditView[]> {
    const { data } = await http.get<ConnectionAuditView[]>(
      `/platform/connections/${encodeURIComponent(id)}/audits`
    );
    return data;
  },

  async listSecrets(): Promise<SecretView[]> {
    const { data } = await http.get<SecretView[]>("/platform/secrets");
    return data;
  },

  async createSecret(payload: SecretPayload): Promise<SecretView> {
    const { data } = await http.post<SecretView>("/platform/secrets", payload);
    return data;
  },

  async updateSecret(id: string, payload: Omit<SecretPayload, "key">): Promise<SecretView> {
    const { data } = await http.patch<SecretView>(
      `/platform/secrets/${encodeURIComponent(id)}`,
      payload
    );
    return data;
  },

  async deleteSecret(id: string): Promise<void> {
    await http.delete(`/platform/secrets/${encodeURIComponent(id)}`);
  }
};
