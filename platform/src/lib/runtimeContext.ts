import type { InjectionKey } from "vue";
import type { ComponentDef, UINode, UISchema } from "@/types/uiModel";
import type {
  RuntimeActionDefinition,
  RuntimeDataSourceState,
  RuntimePageView,
  RuntimeStep
} from "@/types/runtime";

export interface RuntimeScope {
  form?: Record<string, unknown> | null;
  row?: Record<string, unknown> | null;
  index?: number | null;
  rows?: unknown[] | null;
  event?: Record<string, unknown> | null;
  dialogKey?: string | null;
  vars?: Record<string, unknown> | null;
}

export interface RuntimeUserContext {
  id: string;
  username: string;
  displayName: string;
  tenantId: string;
  deptId: string | null;
  deptIds: string[];
  roleKeys: string[];
}

export interface RuntimeActionInvocation {
  actionKey: string;
  params?: Record<string, unknown>;
  scope?: RuntimeScope;
  confirmed?: boolean;
}

export interface RuntimeNavigatePayload {
  pageRef?: Record<string, unknown> | null;
  params?: Record<string, unknown>;
  path?: string | null;
}

export interface RuntimeContextApi {
  appId: string;
  view: RuntimePageView;
  page: UISchema;
  components: ComponentDef[];
  state: Record<string, unknown>;
  data: Record<string, RuntimeDataSourceState>;
  user: RuntimeUserContext;
  routeParams: Record<string, string>;
  routeQuery: Record<string, unknown>;
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
  setDataSourceSort(id: string, sort: { field: string; direction: "asc" | "desc" } | null): void;
  openDialog(key: string): void;
  closeDialog(key: string): void;
  navigate(payload: RuntimeNavigatePayload): Promise<void>;
  setExpressionValue(expression: unknown, value: unknown): void;
  findAction(key: string): RuntimeActionDefinition | null;
  dialogOf(key: string): UINode | null;
  notify(message: string, type?: "success" | "warning" | "error" | "info"): void;
}

export const RUNTIME_CONTEXT: InjectionKey<RuntimeContextApi> = Symbol("metaforge-runtime");