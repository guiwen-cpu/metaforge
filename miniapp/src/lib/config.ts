let defaultBaseUrl = "/api/v1";

// #ifndef H5
defaultBaseUrl = "http://127.0.0.1:8080/api/v1";
// #endif

function trimBase(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimBase(
  String(import.meta.env.VITE_API_BASE_URL || defaultBaseUrl)
);

export const DEFAULT_APP_ID = String(
  import.meta.env.VITE_DEFAULT_APP_ID || "eb84d4bd-461f-4945-9f76-7d69ce732d8b"
);

export const DEFAULT_TENANT = String(
  import.meta.env.VITE_DEFAULT_TENANT || "tenant_demo_school"
);

export const SESSION_STORAGE_KEY = "metaforge.miniapp.session.v1";

export const REQUEST_TIMEOUT = 20000;

export const RUNTIME_PLATFORM = typeof window === "undefined" ? "miniapp" : "h5";
