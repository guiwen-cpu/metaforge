export interface ConnectionHeader {
  name: string;
  value: string;
}

export interface ConnectionAuth {
  type: "none" | "tenant" | "bearer" | "apiKey" | "basic" | string;
  tokenRef?: string;
  valueRef?: string;
  usernameRef?: string;
  passwordRef?: string;
  name?: string;
  in?: "header" | "query";
  headerName?: string;
  [key: string]: unknown;
}

export interface ConnectionConfig {
  timeoutMs?: number;
  headers?: ConnectionHeader[];
  auth?: ConnectionAuth;
  [key: string]: unknown;
}

export interface ConnectionView {
  id: string;
  key: string;
  name: string;
  kind: string;
  base_url?: string | null;
  config: ConnectionConfig;
  enabled: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionPayload {
  key?: string;
  name: string;
  kind: string;
  base_url?: string | null;
  config: ConnectionConfig;
  enabled: boolean;
}

export interface SecretView {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  configured: boolean;
  key_version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  rotated_at?: string | null;
}

export interface SecretPayload {
  key?: string;
  name: string;
  description?: string | null;
  value?: string;
}
