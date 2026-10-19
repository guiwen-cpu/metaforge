import { http } from "@/lib/http";
import type {
  AppBundle,
  AppView,
  DraftView,
  PageResult,
  VersionDetail,
  VersionDiff,
  VersionSummary
} from "@/types/platform";

export interface CreateAppPayload {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  type?: string;
  category?: string;
}

export interface UpdateAppPayload {
  name?: string;
  description?: string;
  icon?: string;
  type?: string;
  category?: string;
}

export interface ListAppsParams {
  page?: number;
  size?: number;
  q?: string;
  status?: string;
}

export const platformApi = {
  async listApps(params: ListAppsParams = {}): Promise<PageResult<AppView>> {
    const { data } = await http.get<PageResult<AppView>>("/platform/apps", { params });
    return data;
  },

  async createApp(payload: CreateAppPayload): Promise<AppView> {
    const { data } = await http.post<AppView>("/platform/apps", payload);
    return data;
  },

  async getApp(appId: string): Promise<AppView> {
    const { data } = await http.get<AppView>(`/platform/apps/${appId}`);
    return data;
  },

  async updateApp(appId: string, payload: UpdateAppPayload): Promise<AppView> {
    const { data } = await http.patch<AppView>(`/platform/apps/${appId}`, payload);
    return data;
  },

  async deleteApp(appId: string): Promise<void> {
    await http.delete(`/platform/apps/${appId}`);
  },

  async getDraft(appId: string): Promise<DraftView> {
    const { data } = await http.get<DraftView>(`/platform/apps/${appId}/draft`);
    return data;
  },

  async saveDraft(appId: string, bundle: AppBundle, revision: number): Promise<DraftView> {
    const { data } = await http.put<DraftView>(`/platform/apps/${appId}/draft`, {
      bundle,
      revision
    });
    return data;
  },

  async publish(
    appId: string,
    message: string,
    options: { force?: boolean; bundle?: AppBundle } = {}
  ): Promise<VersionDetail> {
    const { data } = await http.post<VersionDetail>(`/platform/apps/${appId}/versions`, {
      message,
      force: options.force ?? false,
      ...(options.bundle ? { bundle: options.bundle } : {})
    });
    return data;
  },

  async listVersions(
    appId: string,
    params: { page?: number; size?: number } = {}
  ): Promise<PageResult<VersionSummary>> {
    const { data } = await http.get<PageResult<VersionSummary>>(
      `/platform/apps/${appId}/versions`,
      { params }
    );
    return data;
  },

  async getVersion(appId: string, versionNo: number): Promise<VersionDetail> {
    const { data } = await http.get<VersionDetail>(
      `/platform/apps/${appId}/versions/${versionNo}`
    );
    return data;
  },

  async diff(appId: string, from: number, to: number): Promise<VersionDiff> {
    const { data } = await http.get<VersionDiff>(
      `/platform/apps/${appId}/versions/${from}/diff/${to}`
    );
    return data;
  },

  async restoreDraft(
    appId: string,
    versionNo: number,
    revision?: number
  ): Promise<DraftView> {
    const { data } = await http.post<DraftView>(
      `/platform/apps/${appId}/versions/${versionNo}/restore-draft`,
      revision === undefined ? {} : { revision }
    );
    return data;
  },

  async rollback(appId: string, versionNo: number, message: string): Promise<VersionDetail> {
    const { data } = await http.post<VersionDetail>(
      `/platform/apps/${appId}/versions/${versionNo}/rollback`,
      { message }
    );
    return data;
  }
};