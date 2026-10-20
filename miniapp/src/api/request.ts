import { API_BASE_URL, REQUEST_TIMEOUT } from "@/lib/config";
import { getSession, redirectToLogin } from "@/lib/session";

export interface ApiErrorDetail {
  field?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ApiErrorDetail[];

  constructor(code: string, message: string, status: number, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  path: string;
  method?: Method;
  data?: unknown;
  auth?: boolean;
  timeout?: number;
}

function decodeBody(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { message: raw };
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function errorMessageOf(body: Record<string, unknown>, fallback: string): string {
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return fallback;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function request<T>(options: RequestOptions): Promise<T> {
  const session = getSession();
  const header: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (options.auth !== false && session?.token) {
    header.Authorization = `Bearer ${session.token}`;
  }
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${options.path.startsWith("/") ? "" : "/"}${options.path}`,
      method: options.method ?? "GET",
      data: options.data as Record<string, unknown> | undefined,
      header,
      timeout: options.timeout ?? REQUEST_TIMEOUT,
      success: (response) => {
        const status = Number(response.statusCode ?? 0);
        const body = decodeBody(response.data);
        if (status >= 200 && status < 300) {
          resolve(response.data as T);
          return;
        }
        if (status === 401 && options.auth !== false) {
          redirectToLogin();
        }
        const details = Array.isArray(body.details)
          ? (body.details as ApiErrorDetail[])
          : [];
        reject(
          new ApiError(
            String(body.code ?? (status === 0 ? "network_error" : "request_failed")),
            errorMessageOf(body, `请求失败（HTTP ${status || "网络异常"}）`),
            status,
            details
          )
        );
      },
      fail: (failure) => {
        reject(
          new ApiError(
            "network_error",
            failure.errMsg ? `网络异常：${failure.errMsg}` : "网络异常，请检查 API 地址与网络",
            0
          )
        );
      }
    });
  });
}
