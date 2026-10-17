import axios, { AxiosError, type AxiosRequestConfig } from "axios";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isVersionConflict(): boolean {
    return this.code === "version_conflict" || this.code === "version_required";
  }
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "",
  timeout: 20000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("lcp.token");
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  const tenantId = localStorage.getItem("lcp.tenant");
  if (tenantId) {
    config.headers["X-Tenant-Id"] = tenantId;
  }
  return config;
});

interface ErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

function normalize(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const axiosError = error as AxiosError<ErrorBody>;
  const status = axiosError.response?.status ?? 0;
  const body = axiosError.response?.data;
  const code = body?.code ?? (status === 0 ? "network_error" : "http_" + status);
  const message = body?.message ?? axiosError.message ?? "请求失败";
  return new ApiError(status, code, message, body?.details);
}

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<T>(config);
    return response.data;
  } catch (error) {
    throw normalize(error);
  }
}
