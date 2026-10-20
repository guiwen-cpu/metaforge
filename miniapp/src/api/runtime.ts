import { request } from "@/api/request";
import type {
  ActionExecutionResult,
  DataSourceQueryPayload,
  DataSourceQueryResult,
  ExecuteActionPayload,
  RuntimeNavigation,
  RuntimePageView
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
  }
};
