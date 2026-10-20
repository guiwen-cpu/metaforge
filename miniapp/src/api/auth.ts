import { request } from "@/api/request";
import { normalizeUser, setSession, type SessionState } from "@/lib/session";

export interface LoginPayload {
  tenant: string;
  username: string;
  password: string;
  appId?: string;
}

interface LoginResponse {
  token: string;
  expires_at: string;
  user: Record<string, unknown>;
}

export async function login(payload: LoginPayload): Promise<SessionState> {
  const result = await request<LoginResponse>({
    path: "/auth/login",
    method: "POST",
    auth: false,
    data: {
      tenant: payload.tenant,
      username: payload.username,
      password: payload.password
    }
  });
  const session: SessionState = {
    token: result.token,
    expiresAt: result.expires_at,
    tenant: payload.tenant,
    user: normalizeUser(result.user ?? {}),
    appId: payload.appId
  };
  setSession(session);
  return session;
}
