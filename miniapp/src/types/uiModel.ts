import type { ArtifactRef, DataSchema, SemanticDef } from "./dataModel";

export type PageKind = "list" | "form" | "detail" | "dashboard" | "approval" | "report" | "custom" | "login" | "error";

export interface TextDef {
  default?: string;
  i18n?: Record<string, string>;
  [key: string]: unknown;
}

export type PropType =
  | "text"
  | "string"
  | "boolean"
  | "integer"
  | "number"
  | "enum"
  | "color"
  | "icon"
  | "cssLength"
  | "expr"
  | "json"
  | "entityRef"
  | "dataSourceRef"
  | "fieldList"
  | "columnList"
  | "searchFieldList"
  | "buttonList"
  | "optionList"
  | string;

export interface ComponentPropDef {
  key: string;
  label: TextDef | string;
  description?: string;
  type: PropType;
  defaultValue?: unknown;
  required?: boolean;
  bindable?: boolean;
  enum?: unknown[];
  enumLabels?: Record<string, TextDef | string>;
  group?: string;
  order?: number;
  advanced?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  itemType?: PropType;
  itemProps?: ComponentPropDef[];
  [key: string]: unknown;
}

export interface ComponentSlotDef {
  name: string;
  label?: TextDef | string;
  multiple?: boolean;
}

export interface ComponentEventDef {
  name: string;
  label?: TextDef | string;
  params?: Array<{ key: string; type: string }>;
}

export interface ComponentCapabilities {
  formField?: boolean;
  listColumn?: boolean;
  supportsDataSource?: boolean;
  supportsLoop?: boolean;
  virtualScroll?: boolean;
  supportsBinding?: boolean;
  [key: string]: unknown;
}

export interface SandboxPolicy {
  network?: boolean;
  allowedHosts?: string[];
  storage?: boolean;
  dom?: boolean;
  cookies?: boolean;
  clipboard?: boolean;
  navigation?: boolean;
  allowedModules?: string[];
  allowEval?: boolean;
  memoryLimitMb?: number;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface ComponentDef {
  id: string;
  name: string;
  version: number;
  title: TextDef | string;
  kind: "layout" | "container" | "field" | "display" | "action" | "data" | "chart" | "advanced";
  group?: string;
  description?: string;
  runtime?: "builtin" | "remote" | "sandbox";
  container?: boolean;
  acceptChildren?: string[];
  canBeChildOf?: string[];
  minChildren?: number;
  maxChildren?: number;
  props?: ComponentPropDef[];
  slots?: ComponentSlotDef[];
  events?: ComponentEventDef[];
  actions?: Array<Record<string, unknown>>;
  capabilities?: ComponentCapabilities;
  data?: Record<string, unknown>;
  fieldBindings?: Record<string, unknown>;
  defaultProps?: Record<string, unknown>;
  defaultStyle?: Record<string, unknown>;
  responsive?: boolean;
  deprecated?: boolean;
  since?: string;
  source?: string;
  integrity?: string;
  sandbox?: SandboxPolicy;
  semantic?: SemanticDef;
  "x-previewHtml"?: string;
  "x-previewScript"?: string;
  [key: string]: unknown;
}

export interface ComponentIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export interface ComponentRegistry {
  protocolVersion: string;
  registryVersion: number;
  title?: string;
  components: ComponentDef[];
}

export interface RouteSpec {
  path: string;
  name?: string;
  layout?: "default" | "blank" | "side" | "top" | "tabs";
  keepAlive?: boolean;
  cache?: "none" | "page" | "data";
  auth?: boolean;
  roles?: string[];
  redirect?: string;
  meta?: Record<string, unknown>;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface PageParam {
  key: string;
  type: string;
  from?: string;
  required?: boolean;
  description?: string;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface PageDataSource {
  id: string;
  type: "entity" | "api" | "flow" | "static" | "computed";
  name?: string;
  entityRef?: ArtifactRef;
  mode?: "page" | "list" | "one" | "count";
  data?: unknown;
  immediate?: boolean;
  [key: string]: unknown;
}

export interface UINode {
  id: string;
  component: string;
  key?: string;
  label?: TextDef | string;
  props?: Record<string, unknown>;
  bind?: Record<string, unknown>;
  visible?: unknown;
  disable?: unknown;
  style?: Record<string, unknown>;
  responsive?: Record<string, unknown>;
  slots?: Record<string, UINode[]>;
  children?: UINode[];
  handlers?: Record<string, unknown>;
  loop?: Record<string, unknown>;
  locked?: boolean;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface UISchema {
  id: string;
  key: string;
  title: TextDef | string;
  kind: PageKind;
  scope?: string;
  version: number;
  description?: string;
  route: RouteSpec;
  params?: PageParam[];
  dataSources?: PageDataSource[];
  state?: Record<string, unknown>;
  layout: UINode;
  dialogs?: Record<string, UINode>;
  handlers?: Record<string, unknown>;
  access?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  semantic?: SemanticDef;
  [key: string]: unknown;
}

export interface UiIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export interface NodeLocation {
  node: UINode;
  parent: UINode | null;
  list: UINode[];
  index: number;
  slot?: string;
}
