<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { errorMessage } from "@/lib/http";
import { CodeRuntime, type CodeRuntimeEvent } from "@/lib/codeSandbox";
import { invokeCodeHook, type PageLifecycleEvent } from "@/lib/codeHook";
import {
  PAGE_HANDLER_EVENTS,
  PAGE_HANDLER_MODES,
  createPageHandler,
  defaultSandbox,
  hookTemplate,
  pageHandlerMode,
  previewContext,
  previewInput,
  type PageHandlerMode
} from "@/lib/pageHandlers";
import type { CodeHook, HandlerRef, SandboxPolicy, UISchema } from "@/types/uiModel";

const props = defineProps<{
  page: UISchema;
  actions: Array<{ key: string; name?: string }>;
}>();

const activeEvent = ref<PageLifecycleEvent>("onMount");
const codeRuntime = new CodeRuntime();
const running = ref(false);
const runLogs = ref<string[]>([]);
const runEvents = ref<CodeRuntimeEvent[]>([]);
const runOutput = ref("");
const runError = ref("");
const runElapsed = ref<number | null>(null);
const jsonError = ref("");

const handler = computed<HandlerRef | null>(
  () => (props.page.handlers?.[activeEvent.value] as HandlerRef | undefined) ?? null
);
const code = computed<CodeHook | null>(() => handler.value?.code ?? null);
const eventInfo = computed(
  () => PAGE_HANDLER_EVENTS.find((item) => item.key === activeEvent.value) ?? PAGE_HANDLER_EVENTS[0]
);

const mode = computed<PageHandlerMode>({
  get: () => pageHandlerMode(handler.value),
  set: (next) => setMode(next)
});

function ensureHandlers(): Record<string, HandlerRef | undefined> {
  if (!props.page.handlers) props.page.handlers = {};
  return props.page.handlers as Record<string, HandlerRef | undefined>;
}

function ensureSandbox(): SandboxPolicy {
  const hook = code.value;
  if (!hook) return defaultSandbox();
  if (!hook.sandbox) hook.sandbox = defaultSandbox();
  return hook.sandbox;
}

function clearRun(): void {
  runLogs.value = [];
  runEvents.value = [];
  runOutput.value = "";
  runError.value = "";
  runElapsed.value = null;
  jsonError.value = "";
}

function setMode(next: PageHandlerMode): void {
  if (next === mode.value) return;
  const handlers = ensureHandlers();
  const created = createPageHandler(next, activeEvent.value, props.actions[0]?.key);
  if (created) handlers[activeEvent.value] = created;
  else delete handlers[activeEvent.value];
  clearRun();
}

function setSource(value: string): void {
  if (code.value) code.value.source = value;
}

function setEntry(value: string): void {
  if (code.value) code.value.entry = value.trim() || "default";
}

function setTimeoutMs(value: number | null | undefined): void {
  if (code.value) code.value.timeoutMs = Math.max(50, Math.min(60000, Number(value) || 3000));
}

function setSandboxFlag(key: keyof SandboxPolicy, value: boolean): void {
  const sandbox = ensureSandbox();
  sandbox[key] = value;
}

const allowedHostsText = computed({
  get: () => (code.value?.sandbox?.allowedHosts ?? []).join(", "),
  set: (value: string) => {
    ensureSandbox().allowedHosts = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
});

const inputsJson = computed(() => JSON.stringify(code.value?.inputs ?? [], null, 2));
const outputsJson = computed(() => JSON.stringify(code.value?.outputs ?? [], null, 2));
const stepsJson = computed(() => JSON.stringify(handler.value?.steps ?? [], null, 2));
const actionParamsJson = computed(() => JSON.stringify(handler.value?.params ?? {}, null, 2));

function applyCodeArray(field: "inputs" | "outputs", text: string): void {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("必须是数组");
    if (code.value) code.value[field] = parsed;
    jsonError.value = "";
  } catch (cause) {
    jsonError.value = `${field === "inputs" ? "输入" : "输出"}声明 JSON 无效：${errorMessage(cause)}`;
  }
}

function applySteps(text: string): void {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("必须是数组");
    if (handler.value) handler.value.steps = parsed;
    jsonError.value = "";
  } catch (cause) {
    jsonError.value = `步骤 JSON 无效：${errorMessage(cause)}`;
  }
}

function applyActionParams(text: string): void {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("必须是对象");
    if (handler.value) handler.value.params = parsed as Record<string, unknown>;
    jsonError.value = "";
  } catch (cause) {
    jsonError.value = `参数 JSON 无效：${errorMessage(cause)}`;
  }
}

const actionKey = computed({
  get: () => String(handler.value?.actionRef?.key ?? ""),
  set: (value: string) => {
    if (!handler.value) return;
    handler.value.actionRef = {
      kind: "action",
      key: value,
      version: handler.value.actionRef?.version ?? 1
    };
  }
});

function emitToast(event: CodeRuntimeEvent): void {
  if (event.name !== "ui.toast") return;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  ElMessage({
    type: (payload.type as "success" | "warning" | "info" | "error" | undefined) ?? "info",
    message: String(payload.message ?? "代码钩子事件"),
    duration: 2500
  });
}

async function tryRun(): Promise<void> {
  const hook = code.value;
  if (!hook || running.value) return;
  running.value = true;
  clearRun();
  const started = performance.now();
  try {
    const result = await invokeCodeHook(codeRuntime, hook, {
      input: previewInput(hook),
      context: previewContext(props.page, activeEvent.value),
      onEvent: (event) => {
        runEvents.value = [...runEvents.value, event];
        emitToast(event);
      }
    });
    runLogs.value = result.logs;
    runEvents.value = result.events;
    runOutput.value = JSON.stringify(result.value ?? null, null, 2);
  } catch (cause) {
    const detail = cause as { logs?: string[]; events?: CodeRuntimeEvent[] };
    runLogs.value = detail.logs ?? [];
    runEvents.value = detail.events ?? [];
    runError.value = errorMessage(cause);
  } finally {
    running.value = false;
    runElapsed.value = Math.round(performance.now() - started);
  }
}

function resetTemplate(): void {
  if (!code.value) return;
  code.value.source = hookTemplate(activeEvent.value);
  clearRun();
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

watch(activeEvent, clearRun);
onBeforeUnmount(() => codeRuntime.dispose());
</script>
<template>
  <div class="space-y-3 border-t border-slate-100 pt-3">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-[12px] font-medium text-slate-700">页面事件与代码钩子</p>
        <p class="mt-0.5 text-[10.5px] leading-relaxed text-slate-400">
          代码钩子与内联步骤、动作引用三选一，仅在发布态运行时的浏览器沙箱中执行。
        </p>
      </div>
      <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-500">handlers</span>
    </div>

    <div>
      <label class="mb-1 block text-[11px] text-slate-500">生命周期事件</label>
      <el-select v-model="activeEvent" size="small" class="w-full">
        <el-option v-for="item in PAGE_HANDLER_EVENTS" :key="item.key" :label="item.label" :value="item.key" />
      </el-select>
      <p class="mt-1 text-[10.5px] leading-relaxed text-slate-400">{{ eventInfo.hint }}</p>
    </div>

    <div>
      <label class="mb-1 block text-[11px] text-slate-500">处理方式</label>
      <el-radio-group v-model="mode" size="small" class="flex flex-wrap gap-1">
        <el-radio-button v-for="item in PAGE_HANDLER_MODES" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="mode === 'action'">
      <div>
        <label class="mb-1 block text-[11px] text-slate-500">动作</label>
        <el-select
          v-model="actionKey"
          size="small"
          class="w-full"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入动作 key"
        >
          <el-option
            v-for="item in actions"
            :key="item.key"
            :label="item.name ? `${item.key} · ${item.name}` : item.key"
            :value="item.key"
          />
        </el-select>
        <p v-if="!actions.length" class="mt-1 text-[10.5px] text-amber-600">
          当前 Bundle 还没有动作，保存前请先在逻辑编排中创建动作。
        </p>
      </div>
      <div>
        <label class="mb-1 block text-[11px] text-slate-500">动作参数 · JSON</label>
        <el-input
          :model-value="actionParamsJson"
          type="textarea"
          :rows="4"
          size="small"
          class="font-mono"
          @change="applyActionParams"
        />
      </div>
    </template>

    <template v-else-if="mode === 'steps'">
      <div>
        <label class="mb-1 block text-[11px] text-slate-500">内联步骤 · JSON 数组</label>
        <el-input
          :model-value="stepsJson"
          type="textarea"
          :rows="8"
          size="small"
          class="font-mono"
          @change="applySteps"
        />
        <p class="mt-1 text-[10.5px] leading-relaxed text-slate-400">
          步骤与逻辑编排共用协议；可在页面内直接完成赋值、分支、事件与代码步骤。
        </p>
      </div>
    </template>

    <template v-else-if="mode === 'code' && code">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-medium text-slate-600">TypeScript 源码</span>
        <el-button text size="small" @click="resetTemplate">重置模板</el-button>
      </div>
      <el-input
        :model-value="code.source"
        type="textarea"
        :rows="10"
        size="small"
        class="font-mono"
        spellcheck="false"
        @update:model-value="setSource"
      />
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="mb-1 block text-[11px] text-slate-500">入口</label>
          <el-input :model-value="code.entry ?? 'default'" size="small" @update:model-value="setEntry" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-slate-500">超时（ms）</label>
          <el-input-number
            :model-value="code.timeoutMs ?? 3000"
            :min="50"
            :max="60000"
            :step="500"
            size="small"
            controls-position="right"
            class="!w-full"
            @update:model-value="setTimeoutMs"
          />
        </div>
      </div>

      <details class="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
        <summary class="cursor-pointer text-[11px] font-medium text-slate-600">输入 / 输出与沙箱策略</summary>
        <div class="mt-2 space-y-2">
          <div>
            <label class="mb-1 block text-[10.5px] text-slate-500">输入声明 · JSON 数组</label>
            <el-input
              :model-value="inputsJson"
              type="textarea"
              :rows="4"
              size="small"
              class="font-mono"
              @change="applyCodeArray('inputs', $event)"
            />
          </div>
          <div>
            <label class="mb-1 block text-[10.5px] text-slate-500">输出声明 · JSON 数组</label>
            <el-input
              :model-value="outputsJson"
              type="textarea"
              :rows="3"
              size="small"
              class="font-mono"
              @change="applyCodeArray('outputs', $event)"
            />
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              网络
              <el-switch
                :model-value="!!code.sandbox?.network"
                size="small"
                @update:model-value="setSandboxFlag('network', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              本地存储
              <el-switch
                :model-value="!!code.sandbox?.storage"
                size="small"
                @update:model-value="setSandboxFlag('storage', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              DOM
              <el-switch
                :model-value="!!code.sandbox?.dom"
                size="small"
                @update:model-value="setSandboxFlag('dom', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              Cookie
              <el-switch
                :model-value="!!code.sandbox?.cookies"
                size="small"
                @update:model-value="setSandboxFlag('cookies', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              剪贴板
              <el-switch
                :model-value="!!code.sandbox?.clipboard"
                size="small"
                @update:model-value="setSandboxFlag('clipboard', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              页面跳转
              <el-switch
                :model-value="!!code.sandbox?.navigation"
                size="small"
                @update:model-value="setSandboxFlag('navigation', $event)"
              />
            </label>
            <label class="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
              eval
              <el-switch
                :model-value="!!code.sandbox?.allowEval"
                size="small"
                @update:model-value="setSandboxFlag('allowEval', $event)"
              />
            </label>
          </div>
          <div v-if="code.sandbox?.network">
            <label class="mb-1 block text-[10.5px] text-slate-500">允许域名（逗号分隔）</label>
            <el-input v-model="allowedHostsText" size="small" placeholder="api.example.com, *.example.org" />
          </div>
        </div>
      </details>

      <div class="flex items-center gap-2">
        <el-button size="small" type="primary" plain :loading="running" @click="tryRun">试运行</el-button>
        <span v-if="runElapsed !== null" class="text-[10.5px] text-slate-400">耗时 {{ runElapsed }} ms</span>
        <span class="text-[10.5px] text-slate-400">使用预览上下文，不读取真实数据</span>
      </div>

      <p v-if="jsonError" class="rounded-lg bg-rose-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-rose-600">
        {{ jsonError }}
      </p>
      <p v-if="runError" class="rounded-lg bg-rose-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-rose-600">
        {{ runError }}
      </p>

      <div
        v-if="runOutput || runLogs.length || runEvents.length"
        class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
      >
        <div>
          <p class="text-[10.5px] font-medium text-slate-500">输出</p>
          <pre class="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-slate-700">{{ runOutput || 'null' }}</pre>
        </div>
        <div v-if="runLogs.length">
          <p class="text-[10.5px] font-medium text-slate-500">日志</p>
          <pre class="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-slate-600">{{ runLogs.join('\n') }}</pre>
        </div>
        <div v-if="runEvents.length">
          <p class="text-[10.5px] font-medium text-slate-500">事件</p>
          <div
            v-for="(item, index) in runEvents"
            :key="index"
            class="mt-0.5 rounded bg-white px-1.5 py-1 font-mono text-[10px] text-slate-600"
          >
            <span class="text-indigo-600">{{ item.name }}</span>
            <pre class="mt-0.5 whitespace-pre-wrap break-all">{{ pretty(item.payload) }}</pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>