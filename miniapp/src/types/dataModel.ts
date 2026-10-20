export type DataFieldType =
  | "string"
  | "text"
  | "richText"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "json"
  | "enum"
  | "ref"
  | "file"
  | "image"
  | "video"
  | "array"
  | "signature"
  | "location"
  | "formula";

export type StorageKind = "column" | "jsonb";

export type RelationType = "oneToOne" | "oneToMany" | "manyToOne" | "manyToMany";

export interface ArtifactRef {
  kind: string;
  id?: string;
  key?: string;
  version?: number;
  snapshotId?: string;
  [key: string]: unknown;
}

export interface SemanticDef {
  description?: string;
  intent?: string;
  examples?: unknown[];
  synonyms?: string[];
  tags?: string[];
  businessDomain?: string;
  [key: string]: unknown;
}

export interface EnumValueDef {
  value: string | number;
  label: string;
  color?: string;
  order?: number;
  disabled?: boolean;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface UploadHints {
  provider?: string;
  accept?: string[];
  maxSize?: number;
  maxSizeMb?: number;
  maxCount?: number;
  multiple?: boolean;
  preview?: boolean;
  compressImage?: boolean;
  pathTemplate?: string;
  [key: string]: unknown;
}


export interface UiHints {
  widget?: string;
  placeholder?: string;
  help?: string;
  group?: string;
  order?: number;
  colSpan?: number;
  rows?: number;
  prefix?: string;
  suffix?: string;
  options?: unknown;
  hideInList?: boolean;
  hideInForm?: boolean;
  width?: number;
  fixed?: string;
  copyable?: boolean;
  sortable?: boolean;
  upload?: UploadHints;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface ValueTypeRef {
  type: DataFieldType;
  format?: string;
  [key: string]: unknown;
}

export interface DataField {
  id: string;
  key: string;
  label: string;
  type: DataFieldType;
  storage?: StorageKind;
  columnType?: string;
  length?: number;
  precision?: number;
  scale?: number;
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  immutable?: boolean;
  sensitive?: boolean;
  enumRef?: ArtifactRef;
  enumValues?: EnumValueDef[];
  refEntity?: ArtifactRef;
  refField?: string;
  itemType?: ValueTypeRef;
  formula?: string;
  validators?: Array<Record<string, unknown>>;
  uiHints?: UiHints;
  access?: Record<string, unknown>;
  searchable?: boolean;
  sortable?: boolean;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface EntityStorage {
  primaryKey?: string;
  idType?: "ulid" | "uuid" | "bigint" | "snowflake";
  tenantColumn?: string | null;
  jsonbColumn?: string;
  softDelete?: {
    enabled?: boolean;
    column?: string;
    type?: "timestamp" | "boolean";
  };
  timestamps?: {
    createdAt?: string | null;
    updatedAt?: string | null;
    createdBy?: string | null;
    updatedBy?: string | null;
  };
  optimisticLock?: boolean;
  auditLog?: boolean;
  partitionBy?: string | null;
  comment?: string;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface RelationEndpoint {
  entityRef: ArtifactRef;
  fieldKey: string;
  semantic?: SemanticDef;
}

export interface DataRelation {
  id: string;
  key: string;
  name?: string;
  type: RelationType;
  from: RelationEndpoint;
  to: RelationEndpoint;
  join?: {
    tableName?: string;
    fromColumn?: string;
    toColumn?: string;
    extraColumns?: string[];
    [key: string]: unknown;
  };
  onDelete?: "cascade" | "restrict" | "setNull" | "none";
  onUpdate?: "cascade" | "restrict" | "setNull" | "none";
  remoteName?: string;
  required?: boolean;
  lazy?: boolean;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface DataIndex {
  id: string;
  name: string;
  fields: string[];
  unique?: boolean;
  method?: "btree" | "gin" | "gist" | "hash";
  orders?: Array<"asc" | "desc">;
  where?: string;
  concurrently?: boolean;
  note?: string;
  [key: string]: unknown;
}

export interface DataEntity {
  id: string;
  key: string;
  name: string;
  tableName?: string;
  titleField?: string;
  enabled?: boolean;
  storage: EntityStorage;
  fields: DataField[];
  relations?: DataRelation[];
  indexes?: DataIndex[];
  access?: Record<string, unknown>;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface EnumDef {
  id: string;
  key: string;
  name: string;
  scope?: string;
  values: EnumValueDef[];
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface DataSchema {
  id: string;
  key: string;
  name: string;
  scope?: string;
  version: number;
  description?: string;
  entities: DataEntity[];
  enums?: EnumDef[];
  access?: Record<string, unknown>;
  semantic?: SemanticDef;
  [key: string]: unknown;
}