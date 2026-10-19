import axios, { AxiosError } from "axios";
import { session } from "@/lib/session";

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Array<{ field?: string; message?: string }>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Array<{ field?: string; message?: string }>;

  constructor(code: string, message: string, status: number, details: ApiErrorBody["details"] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details ?? [];
  }
}

export const http = axios.create({
  baseURL: "/api/v1",
  timeout: 20000,
  headers: { "Content-Type": "application/json" }
});

http.interceptors.request.use((config) => {
  config.headers.set("X-Tenant-Id", session.state.tenantId);
  config.headers.set("X-User-Id", session.state.userId);
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const body = error.response?.data;
    const status = error.response?.status ?? 0;
    const code = body?.code || (status === 0 ? "network_error" : "unknown_error");
    const message = body?.message || error.message || "请求失败";
    return Promise.reject(new ApiError(code, message, status, body?.details));
  }
);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}