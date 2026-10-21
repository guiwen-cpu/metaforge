import type { CodeHook, SandboxPolicy } from "@/types/uiModel";
import type { CodeRuntime, CodeRuntimeEvent, CodeRuntimeResult } from "./codeSandbox";

export const PAGE_LIFECYCLE_EVENTS = [
  "onLoad",
  "onMount",
  "onParamChange",
  "onUnmount",
  "onError",
  "onBeforeLeave"
] as const;

export type PageLifecycleEvent = (typeof PAGE_LIFECYCLE_EVENTS)[number];

export function defaultCodeHook(source?: string): CodeHook {
  return {
    lang: "ts",
    runtime: "browser",
    source: source ?? `export default function hook(ctx) {\n  ctx.log("页面钩子已执行", ctx.input);\n  return { ok: true };\n}`,
    entry: "default",
    inputs: [],
    outputs: [{ key: "ok", type: "boolean" }],
    timeoutMs: 3000,
    sandbox: {
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
    }
  };
}

export function hookSandbox(hook: CodeHook): SandboxPolicy {
  return hook.sandbox ?? {};
}

export function hookInputs(
  hook: CodeHook,
  resolve: (value: unknown) => unknown
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const item of hook.inputs ?? []) {
    input[item.key] = item.value === undefined ? null : resolve(item.value);
  }
  return input;
}

/** 返回值按 outputs 声明合并进页面状态；无 outputs 时视为纯副作用钩子。 */
export function hookOutputEntries(
  hook: CodeHook,
  value: unknown
): Array<{ key: string; value: unknown }> {
  const outputs = hook.outputs ?? [];
  if (!outputs.length) return [];
  if (outputs.length === 1) {
    const key = outputs[0].key;
    if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
      return [{ key, value: (value as Record<string, unknown>)[key] }];
    }
    return [{ key, value }];
  }
  if (!value || typeof value !== "object") {
    throw new Error("代码钩子声明了多个 output，但返回值不是对象");
  }
  const object = value as Record<string, unknown>;
  return outputs.filter((item) => item.key in object).map((item) => ({ key: item.key, value: object[item.key] }));
}

export interface InvokeCodeHookOptions {
  input?: unknown;
  context?: Record<string, unknown>;
  onEvent?: (event: CodeRuntimeEvent) => void;
}

export function invokeCodeHook(
  runtime: CodeRuntime,
  hook: CodeHook,
  options: InvokeCodeHookOptions = {}
): Promise<CodeRuntimeResult> {
  return runtime.run({
    source: hook.source,
    entry: hook.entry || "default",
    input: options.input ?? {},
    context: options.context ?? {},
    policy: hookSandbox(hook),
    timeoutMs: hook.timeoutMs ?? 3000,
    onEvent: options.onEvent
  });
}
