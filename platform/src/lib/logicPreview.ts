import type { CodeHook, SandboxPolicy } from "@/types/uiModel";
import type { LogicSchema, LogicStep } from "@/types/logicModel";

/** 逻辑设计器只预览浏览器端 TS 代码步骤；服务端步骤走注册入口。 */
export function canPreviewCodeStep(step: LogicStep | null): boolean {
  if (!step || step.type !== "code") return false;
  return String(step.lang ?? "ts") === "ts" && String(step.runtime ?? "server") === "browser";
}

export function codeStepSandbox(step: LogicStep): SandboxPolicy {
  const raw = step.sandbox && typeof step.sandbox === "object" ? (step.sandbox as SandboxPolicy) : {};
  return {
    network: !!raw.network,
    allowedHosts: Array.isArray(raw.allowedHosts) ? raw.allowedHosts : [],
    storage: !!raw.storage,
    dom: !!raw.dom,
    cookies: !!raw.cookies,
    clipboard: !!raw.clipboard,
    navigation: !!raw.navigation,
    allowedModules: Array.isArray(raw.allowedModules) ? raw.allowedModules : [],
    allowEval: !!raw.allowEval,
    memoryLimitMb: Number(raw.memoryLimitMb) > 0 ? Number(raw.memoryLimitMb) : 32
  };
}

export function codeStepHook(step: LogicStep): CodeHook {
  return {
    lang: "ts",
    runtime: "browser",
    source: String(step.source ?? ""),
    entry: String(step.entry ?? "").trim() || "default",
    inputs: Array.isArray(step.inputs) ? (step.inputs as CodeHook["inputs"]) : [],
    outputs: Array.isArray(step.outputs) ? (step.outputs as CodeHook["outputs"]) : [],
    timeoutMs: Number(step.timeoutMs) > 0 ? Number(step.timeoutMs) : 3000,
    sandbox: codeStepSandbox(step)
  };
}

export function codeStepInput(step: LogicStep): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const item of codeStepHook(step).inputs) {
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

export function codeStepContext(step: LogicStep, schema: LogicSchema | null): Record<string, unknown> {
  const route = { path: "", params: {}, query: {} };
  return {
    event: { type: "preview", phase: "preview", source: "designer", stepId: step.id },
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
    page: { key: schema?.key ?? "", state: {}, params: {}, query: {} },
    state: {},
    form: {},
    row: null,
    rows: null,
    vars: {},
    env: {
      platform: "browser",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      mode: "designer",
      appVersion: schema?.version ?? 1
    },
    now: new Date().toISOString()
  };
}
