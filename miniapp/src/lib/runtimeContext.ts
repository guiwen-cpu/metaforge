import type { InjectionKey } from "vue";
import type {
  RuntimeActionDefinition,
  RuntimeDataSourceState,
  RuntimePageView,
  RuntimeStep
} from "@/types/runtime";
import type { UINode } from "@/types/uiModel";

export interface RuntimeUserContext {
  id: string;
  username: string;
  displayName: string;
  tenantId: string;
  deptId: string | null;
  deptIds: string[];
  roleKeys: string[];
}

export interface RuntimeScope {
  form?: Record<string, unknown>;
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[] | null;
  event?: Record<string, unknown>;
  vars?: Record<string, unknown>;
}

export interface RuntimeNavigatePayload {
  path?: string | null;
  pageRef?: Record<string, unknown> | null;
  params?: Record<string, unknown>;
}

export interface RuntimeActionInvocation {
  actionKey: string;
  params?: Record<string, unknown>;
  scope?: RuntimeScope;
  confirmed?: boolean;
}

export interface MiniDataSourceState extends RuntimeDataSourceState {
  value?: unknown;
}

export interface RuntimeContextApi {
  appId: string;
  view: RuntimePageView;
  page: RuntimePageView["page"];
  components: RuntimePageView["components"];
  readonly state: Record<string, unknown>;
  readonly data: Record<string, MiniDataSourceState>;
  readonly user: RuntimeUserContext;
  readonly routeParams: Record<string, string>;
  readonly routeQuery: Record<string, unknown>;
  evaluate(value: unknown, scope?: RuntimeScope, params?: Record<string, unknown>): unknown;
  visible(node: UINode, scope?: RuntimeScope): boolean;
  disabled(node: UINode, scope?: RuntimeScope): boolean;
  permitted(value: unknown, scope?: RuntimeScope): boolean;
  runHandler(
    node: UINode,
    name: string,
    event: Record<string, unknown>,
    scope?: RuntimeScope
  ): Promise<void>;
  runSteps(
    steps: RuntimeStep[] | undefined,
    scope?: RuntimeScope,
    params?: Record<string, unknown>
  ): Promise<void>;
  runAction(invocation: RuntimeActionInvocation): Promise<void>;
  refreshDataSource(id: string, options?: { silent?: boolean }): Promise<void>;
  refreshAll(): Promise<void>;
  setDataSourceSort(
    id: string,
    sort: { field: string; direction: "asc" | "desc" } | null
  ): void;
  openDialog(key: string): void;
  closeDialog(key: string): void;
  navigate(payload: RuntimeNavigatePayload): Promise<void>;
  setExpressionValue(expression: unknown, value: unknown): void;
  findAction(key: string): RuntimeActionDefinition | null;
  dialogOf(key: string): UINode | null;
  confirm(message: string, title?: string, danger?: boolean): Promise<boolean>;
  notify(message: string, type?: "success" | "warning" | "error" | "info"): void;
}

export const RUNTIME_CONTEXT: InjectionKey<RuntimeContextApi> = Symbol("metaforge-runtime");
