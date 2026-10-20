import { request } from "@/api/request";
import { normalizeUser, setSession, type SessionState } from "@/lib/session";

export interface LoginPayload {
  tenant: string;
  username: string;
  password: string;
  appId?: string;
}

export interface WechatConfig {
  enabled: boolean;
  appId?: string;
  tenant?: string;
  displayName?: string;
}

export interface WechatLoginPayload {
  code: string;
  tenant: string;
  appId?: string;
}

interface LoginResponse {
  token: string;
  expires_at: string;
  user: Record<string, unknown>;
}

function storeLogin(result: LoginResponse, tenant: string, appId?: string): SessionState {
  const session: SessionState = {
    token: result.token,
    expiresAt: result.expires_at,
    tenant,
    user: normalizeUser(result.user ?? {}),
    appId
  };
  setSession(session);
  return session;
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
  return storeLogin(result, payload.tenant, payload.appId);
}

export async function wechatConfig(): Promise<WechatConfig> {
  const raw = await request<Record<string, unknown>>({
    path: "/auth/wechat/config",
    auth: false
  });
  return {
    enabled: raw.enabled === true,
    appId: typeof raw.app_id === "string" ? raw.app_id : undefined,
    tenant: typeof raw.tenant === "string" ? raw.tenant : undefined,
    displayName: typeof raw.display_name === "string" ? raw.display_name : undefined
  };
}

export async function loginWithWechat(payload: WechatLoginPayload): Promise<SessionState> {
  const result = await request<LoginResponse>({
    path: "/auth/wechat/login",
    method: "POST",
    auth: false,
    data: {
      code: payload.code,
      tenant: payload.tenant
    }
  });
  return storeLogin(result, payload.tenant, payload.appId);
}