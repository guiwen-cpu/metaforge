export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface AppView {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  type: string;
  category?: string | null;
  status: "draft" | "published" | "archived" | string;
  current_version: number | null;
  draft_revision: number;
  draft_updated_at?: string | null;
  draft_updated_by?: string | null;
  semantic?: unknown;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppMeta {
  id?: string;
  key: string;
  name?: string;
  description?: string;
  icon?: string;
  type?: string;
  category?: string;
  semantic?: unknown;
  [key: string]: unknown;
}

export interface AppBundle {
  protocolVersion: string;
  tenantId: string;
  app: AppMeta;
  artifacts: {
    dataSchemas?: unknown[];
    uiSchemas?: unknown[];
    logicSchemas?: unknown[];
    components?: unknown[];
    enums?: unknown[];
    roles?: unknown[];
    permissions?: unknown[];
    semantic?: unknown;
    [key: string]: unknown;
  };
  snapshot?: {
    snapshotId?: string;
    version?: number;
    message?: string;
    publishedAt?: string;
    publishedBy?: { id?: string; type?: string; name?: string };
    [key: string]: unknown;
  };
  assets?: unknown[];
  navigation?: unknown;
  publish?: unknown;
  meta?: unknown;
  semantic?: unknown;
  [key: string]: unknown;
}

export interface DraftView {
  app_id: string;
  revision: number;
  bundle: AppBundle | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface ChecksumView {
  algo: string;
  value: string;
}

export interface VersionSummary {
  id: string;
  version_no: number;
  status: string;
  message: string;
  checksum: ChecksumView;
  protocol_version?: string | null;
  snapshot_id: string;
  rollback_of_version?: number | null;
  based_on_version?: number | null;
  created_by: string;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  content_checksum: string;
  bundle: AppBundle;
  unchanged: boolean;
}

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  path: string;
  kind: DiffKind;
  artifact_kind?: string | null;
  artifact_key?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface VersionDiff {
  from_version: number;
  to_version: number;
  identical: boolean;
  content_checksum: { from: string; to: string };
  summary: { added: number; removed: number; changed: number; total: number };
  changes: DiffEntry[];
  truncated: boolean;
}