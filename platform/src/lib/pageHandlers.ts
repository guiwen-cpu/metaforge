import type { SandboxPolicy, CodeHook, HandlerRef, UISchema } from "@/types/uiModel";
import type { LogicStep } from "@/types/logicModel";
import { defaultCodeHook, type PageLifecycleEvent } from "./codeHook";

export const PAGE_HANDLER_EVENTS: Array<{
  key: PageLifecycleEvent;
  label: string;
  hint: string;
}> = [
  { key: "onLoad", label: "onLoad · 页面加载", hint: "在数据源刷新前执行，适合初始化查询条件与页面状态。" },
  { key: "onMount", label: "onMount · 挂载完成", hint: "首个数据源刷新完成后执行，适合依赖接口结果的初始化。" },
  { key: "onParamChange", label: "onParamChange · 参数变化", hint: "路由参数或查询串变化时执行，事件中包含 previous。" },
  { key: "onUnmount", label: "onUnmount · 页面卸载", hint: "离开页面后执行，适合清理外部副作用。" },
  { key: "onError", label: "onError · 运行错误", hint: "生命周期、动作或步骤抛错时执行，事件中包含 source 与 message。" },
  { key: "onBeforeLeave", label: "onBeforeLeave · 离开前", hint: "路由离开或菜单内部跳转前执行，事件中包含 source 与 target。" }
];

export const PAGE_HANDLER_MODES: Array<{ value: PageHandlerMode; label: string }> = [
  { value: "none", label: "不处理" },
  { value: "action", label: "动作引用" },
  { value: "steps", label: "内联步骤" },
  { value: "code", label: "TS 代码钩子" }
];

export type PageHandlerMode = "none" | "action" | "steps" | "code";

export function pageHandlerMode(handler: HandlerRef | null | undefined): PageHandlerMode {
  if (!handler) return "none";
  if (handler.code) return "code";
  if (handler.actionRef?.key) return "action";
  if (Array.isArray(handler.steps)) return "steps";
  return "none";
}

export function defaultSandbox(): SandboxPolicy {
  return {
    network: false,
    allowedHosts: [],
    storage: false,
    dom: false,
    cookies: false,
    clipboard: false,
    navigation: false,
    allowedModules: [],
    allowEval: false,
    memoryLimitMb: 32
  };
}

export function hookTemplate(event: PageLifecycleEvent): string {
  switch (event) {
    case "onLoad":
      return `export default function hook(ctx) {\n  ctx.log("onLoad", ctx.route);\n  return { ok: true };\n}`;
    case "onMount":
      return `export default function hook(ctx) {\n  ctx.log("onMount", ctx.input);\n  return { ok: true };\n}`;
    case "onParamChange":
      return `export default function hook(ctx) {\n  ctx.log("onParamChange", ctx.route, ctx.event.previous);\n  return { ok: true };\n}`;
    case "onUnmount":
      return `export default function hook(ctx) {\n  ctx.log("onUnmount", ctx.route);\n  return { ok: true };\n}`;
    case "onError":
      return `export default function hook(ctx) {\n  ctx.log("onError", ctx.event.source, ctx.event.message);\n  return { ok: true };\n}`;
    case "onBeforeLeave":
      return `export default function hook(ctx) {\n  ctx.log("onBeforeLeave", ctx.event.source, ctx.event.target);\n  return { ok: true };\n}`;
    default:
      return `export default function hook(ctx) {\n  return { ok: true };\n}`;
  }
}

export function createPageHandler(
  mode: PageHandlerMode,
  event: PageLifecycleEvent,
  actionKey?: string
): HandlerRef | undefined {
  if (mode === "none") return undefined;
  if (mode === "action") {
    return actionKey
      ? { actionRef: { kind: "action", key: actionKey, version: 1 }, params: {} }
      : { params: {} };
  }
  if (mode === "steps") return { steps: [] };
  const hook = defaultCodeHook(hookTemplate(event));
  hook.sandbox = defaultSandbox();
  return { code: hook };
}

export function normalizeSteps(value: unknown): LogicStep[] {
  return Array.isArray(value) ? (value as LogicStep[]) : [];
}

export function previewInput(hook: CodeHook): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const item of hook.inputs ?? []) {
    const value = item.value;
    if (value && typeof value === "object" && "$lit" in (value as Record<string, unknown>)) {
      input[item.key] = (value as Record<string, unknown>).$lit;
    } else if (value === null || typeof value !== "object") {
      input[item.key] = value;
    } else {
      input[item.key] = null;
    }
  }
  return input;
}

export function previewContext(page: UISchema, event: PageLifecycleEvent): Record<string, unknown> {
  const state = page.state && typeof page.state === "object" ? { ...page.state } : {};
  const route = { path: page.route?.path ?? "", params: {}, query: {} };
  return {
    event: { type: event, phase: event, path: route.path, params: {}, query: {}, previous: {}, source: "preview", target: "" },
    params: {},
    route,
    user: {
      id: "preview",
      username: "preview",
      displayName: "预览用户",
      tenantId: "preview",
      deptId: null,
      deptIds: [],
      roleKeys: ["student"]
    },
    tenant: { id: "preview" },
    data: {},
    page: { key: page.key, state, params: {}, query: {} },
    state,
    form: {},
    row: null,
    rows: null,
    vars: {},
    env: {
      platform: "browser",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      mode: "designer",
      appVersion: page.version ?? 1
    },
    now: new Date().toISOString()
  };
}