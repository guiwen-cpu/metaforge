import { request } from "@/api/request";
import type {
  ActionExecutionResult,
  DataSourceQueryPayload,
  DataSourceQueryResult,
  ExecuteActionPayload,
  RuntimeNavigation,
  RuntimePageView,
  RuntimeApiInvokePayload
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
