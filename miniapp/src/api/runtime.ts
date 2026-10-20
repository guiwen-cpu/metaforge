import { ApiError, request } from "@/api/request";
import { API_BASE_URL } from "@/lib/config";
import { getSession, redirectToLogin } from "@/lib/session";
import type {
  ActionExecutionResult,
  DataSourceQueryPayload,
  DataSourceQueryResult,
  ExecuteActionPayload,
  RuntimeNavigation,
  RuntimePageView,
  RuntimeApiInvokePayload,
  AttachmentView
} from "@/types/runtime";

function base(appId: string): string {
  return `/runtime/apps/${encodeURIComponent(appId)}`;
}

export const runtimeApi = {
  navigation(appId: string): Promise<RuntimeNavigation> {
    return request<RuntimeNavigation>({ path: `${base(appId)}/navigation` });
  },

  page(appId: string, pageKey: string): Promise<RuntimePageView> {
    return request<RuntimePageView>({
      path: `${base(appId)}/pages/${encodeURIComponent(pageKey)}`
    });
  },

  queryDataSource(
    appId: string,
    pageKey: string,
    dataSourceId: string,
    payload: DataSourceQueryPayload
  ): Promise<DataSourceQueryResult> {
    return request<DataSourceQueryResult>({
      path: `${base(appId)}/pages/${encodeURIComponent(pageKey)}/data-sources/${encodeURIComponent(
        dataSourceId
      )}/query`,
      method: "POST",
      data: payload
    });
  },

  executeAction(
    appId: string,
    actionKey: string,
    payload: ExecuteActionPayload
  ): Promise<ActionExecutionResult> {
    return request<ActionExecutionResult>({
      path: `${base(appId)}/actions/${encodeURIComponent(actionKey)}/execute`,
      method: "POST",
      data: payload
    });
  },

  listAttachments(
    appId: string,
    pageKey: string,
    bizType: string,
    bizId: string
  ): Promise<AttachmentView[]> {
    const query = `?bizType=${encodeURIComponent(bizType)}&bizId=${encodeURIComponent(bizId)}`;
    return request<AttachmentView[]>({
      path: `${base(appId)}/pages/${encodeURIComponent(pageKey)}/attachments${query}`
    });
  },

  uploadAttachment(
    appId: string,
    pageKey: string,
    filePath: string,
    options: { bizType: string; bizId: string; kind: string; fileName?: string }
  ): Promise<AttachmentView> {
    const session = getSession();
    const header: Record<string, string> = {};
    if (session?.token) header.Authorization = `Bearer ${session.token}`;
    return new Promise<AttachmentView>((resolve, reject) => {
      uni.uploadFile({
        url: `${API_BASE_URL}${base(appId)}/pages/${encodeURIComponent(pageKey)}/attachments`,
        filePath,
        name: "file",
        header,
        formData: {
          bizType: options.bizType,
          bizId: options.bizId,
          kind: options.kind,
          fileName: options.fileName || ""
        },
        success: (response) => {
          const status = Number(response.statusCode ?? 0);
          let body: Record<string, unknown> = {};
          try {
            body = typeof response.data === "string"
              ? (JSON.parse(response.data) as Record<string, unknown>)
              : (response.data as Record<string, unknown>);
          } catch {
            body = { message: response.data };
          }
          if (status >= 200 && status < 300) {
            resolve(body as unknown as AttachmentView);
            return;
          }
          if (status === 401) redirectToLogin();
          reject(
            new ApiError(
              String(body.code ?? "upload_failed"),
              String(body.message ?? body.error ?? `上传失败（HTTP ${status || "网络异常"}）`),
              status
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
  },

  deleteAttachment(appId: string, pageKey: string, id: string): Promise<void> {
    return request<void>({
      path: `${base(appId)}/pages/${encodeURIComponent(pageKey)}/attachments/${encodeURIComponent(id)}`,
      method: "DELETE"
    });
  },

  attachmentContentUrl(attachment: AttachmentView): string {
    const url = attachment.url || "";
    return url.startsWith("http") ? url : `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  },

  invokePageApi(
    appId: string,
    pageKey: string,
    apiKey: string,
    payload: RuntimeApiInvokePayload
  ): Promise<unknown> {
    return request<unknown>({
      path: `${base(appId)}/pages/${encodeURIComponent(pageKey)}/apis/${encodeURIComponent(
        apiKey
      )}/invoke`,
      method: "POST",
      data: payload
    });
  }
};
