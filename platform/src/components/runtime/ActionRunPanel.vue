<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { formatDateTime, prettyJson } from "@/lib/format";
import { durationText } from "@/lib/runtime";
import type { ActionRunDetail, ActionRunSummary, StepTrace } from "@/types/runtime";

const props = defineProps<{
  appId: string;
  processInstanceId: string;
  refreshToken?: number;
}>();

const emit = defineEmits<{ refresh: [] }>();

const items = ref<ActionRunSummary[]>([]);
const loading = ref(false);
const error = ref("");
const expanded = ref<string | null>(null);
const detailLoading = ref<string | null>(null);
const replaying = ref<string | null>(null);
const details = ref<Record<string, ActionRunDetail>>({});

const current = computed(() => (expanded.value ? details.value[expanded.value] ?? null : null));

interface TraceRow {
  trace: StepTrace;
  depth: number;
}

function flattenTrace(list: StepTrace[] | null | undefined, depth = 0, out: TraceRow[] = []): TraceRow[] {
  for (const trace of list ?? []) {
    out.push({ trace, depth });
    flattenTrace(trace.children, depth + 1, out);
  }
  return out;
}

const traceRows = computed(() => flattenTrace(current.value?.trace ?? []));

function statusLabel(status: string): string {
  if (status === "completed") return "成功";
  if (status === "failed") return "失败";
  return status || "未知";
}

function statusClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "failed") return "bg-rose-50 text-rose-600 ring-rose-200";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function traceStatusClass(status: string): string {
  if (status === "success" || status === "completed") return "text-emerald-600";
  if (status === "failed") return "text-rose-600";
  if (status === "skipped") return "text-slate-400";
  return "text-slate-500";
}

async function load() {
  if (!props.appId || !props.processInstanceId) return;
  loading.value = true;
  error.value = "";
  try {
    const feed = await runtimeApi.actionRuns(props.appId, {
      processInstanceId: props.processInstanceId,
      limit: 50
    });
    items.value = feed.items;
    if (expanded.value && !feed.items.some((item) => item.id === expanded.value)) {
      expanded.value = null;
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function loadDetail(id: string) {
  if (details.value[id]) return;
  detailLoading.value = id;
  try {
    details.value = { ...details.value, [id]: await runtimeApi.actionRun(props.appId, id) };
  } catch (err) {
    ElMessage.error(errorMessage(err));
  } finally {
    if (detailLoading.value === id) detailLoading.value = null;
  }
}

async function toggle(row: ActionRunSummary) {
  if (expanded.value === row.id) {
    expanded.value = null;
    return;
  }
  expanded.value = row.id;
  await loadDetail(row.id);
}

async function replay(row: ActionRunSummary) {
  try {
    await ElMessageBox.confirm(
      `将使用原始入参与上下文重放动作 ${row.action_key}，并生成一条新的运行记录。`,
      "重放失败动作",
      { type: "warning", confirmButtonText: "确认重放", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  replaying.value = row.id;
  try {
    const next = await runtimeApi.replayActionRun(props.appId, row.id);
    details.value = { ...details.value, [next.id]: next };
    expanded.value = next.id;
    await load();
    ElMessage[next.status === "completed" ? "success" : "warning"](
      next.status === "completed" ? "重放成功，已生成新的运行记录" : "重放已执行，但动作仍然失败"
    );
    emit("refresh");
  } catch (err) {
    ElMessage.error(errorMessage(err));
  } finally {
    replaying.value = null;
  }
}

watch(
  () => [props.appId, props.processInstanceId, props.refreshToken],
  () => {
    details.value = {};
    expanded.value = null;
    void load();
  }
);

onMounted(load);

defineExpose({ load });
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 class="text-[14px] font-semibold text-slate-800">动作运行日志</h2>
        <p class="mt-0.5 text-[11px] text-slate-400">动作执行结果、回写与流程推进记录</p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="items.length" class="text-[11px] text-slate-400">{{ items.length }} 条</span>
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      </div>
    </header>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="m-4" />

    <div v-if="!items.length && !loading && !error" class="py-10 text-center text-[12px] text-slate-400">
      暂无动作运行记录
    </div>

    <ul v-else class="divide-y divide-slate-100">
      <li v-for="row in items" :key="row.id">
        <div class="flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-slate-50/60">
          <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="toggle(row)">
            <span
              class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset"
              :class="statusClass(row.status)"
            >
              {{ statusLabel(row.status) }}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-[12.5px] font-medium text-slate-700">{{ row.action_key }}</span>
              <span class="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                {{ row.id }}
              </span>
            </span>
          </button>
          <div class="flex shrink-0 items-center gap-3 text-[11px] text-slate-400">
            <span v-if="row.replayed_from" class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">重放</span>
            <span>{{ row.user_id || "—" }}</span>
            <span>{{ durationText(row.duration_ms) }}</span>
            <span>{{ formatDateTime(row.created_at) }}</span>
            <el-button
              v-if="row.status === 'failed'"
              text
              size="small"
              :loading="replaying === row.id"
              @click="replay(row)"
            >
              重放
            </el-button>
            <el-button text size="small" @click="toggle(row)">
              {{ expanded === row.id ? "收起" : "详情" }}
            </el-button>
          </div>
        </div>

        <div v-if="expanded === row.id" class="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <p v-if="detailLoading === row.id && !current" class="py-4 text-center text-[11.5px] text-slate-400">
            加载运行详情…
          </p>
          <template v-else-if="current">
            <el-alert
              v-if="current.error"
              type="error"
              :closable="false"
              show-icon
              class="mb-3"
              :title="`${current.error.code} · ${current.error.message || '动作执行失败'}`"
              :description="current.error.fields?.length ? `字段：${current.error.fields.join(', ')}` : undefined"
            />

            <dl class="grid gap-x-5 gap-y-2 text-[11.5px] sm:grid-cols-2">
              <div class="flex gap-2">
                <dt class="shrink-0 text-slate-400">版本</dt>
                <dd class="font-medium text-slate-600">v{{ current.version_no }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-slate-400">耗时</dt>
                <dd class="font-medium text-slate-600">{{ current.duration_ms }} ms</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-slate-400">任务</dt>
                <dd class="break-all font-mono text-[10px] text-slate-500">{{ current.task_id || "—" }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-slate-400">业务实体</dt>
                <dd class="break-all font-mono text-[10px] text-slate-500">{{ current.business_id || "—" }}</dd>
              </div>
              <div v-if="current.replayed_from" class="flex gap-2 sm:col-span-2">
                <dt class="shrink-0 text-slate-400">原始运行</dt>
                <dd class="break-all font-mono text-[10px] text-slate-500">{{ current.replayed_from }}</dd>
              </div>
            </dl>

            <details v-if="current.writeback" class="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <summary class="cursor-pointer text-[11.5px] font-medium text-slate-600">回写与推进结果</summary>
              <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{{ prettyJson(current.writeback) }}</pre>
            </details>

            <div class="mt-4">
              <p class="text-[11.5px] font-medium text-slate-600">步骤轨迹</p>
              <div v-if="traceRows.length" class="mt-2 space-y-1.5">
                <div
                  v-for="(rowItem, index) in traceRows"
                  :key="`${rowItem.trace.step_id}-${index}`"
                  class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                  :style="{ marginLeft: `${rowItem.depth * 14}px` }"
                >
                  <div class="flex flex-wrap items-center gap-2 text-[11px]">
                    <span class="font-medium text-slate-700">{{ rowItem.trace.label || rowItem.trace.step_id }}</span>
                    <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-500">{{ rowItem.trace.type }}</span>
                    <span class="font-medium" :class="traceStatusClass(rowItem.trace.status)">{{ rowItem.trace.status }}</span>
                    <span class="ml-auto font-mono text-[10px] text-slate-400">{{ rowItem.trace.duration_ms }} ms</span>
                  </div>
                  <p v-if="rowItem.trace.message" class="mt-1 text-[10.5px] leading-relaxed text-slate-500">
                    {{ rowItem.trace.message }}
                  </p>
                </div>
              </div>
              <p v-else class="mt-2 text-[11px] text-slate-400">暂无步骤轨迹</p>
            </div>

            <div class="mt-4 grid gap-2 md:grid-cols-2">
              <details class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary class="cursor-pointer text-[11.5px] font-medium text-slate-600">入参 params</summary>
                <pre class="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{{ prettyJson(current.params) }}</pre>
              </details>
              <details class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary class="cursor-pointer text-[11.5px] font-medium text-slate-600">上下文 context</summary>
                <pre class="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{{ prettyJson(current.context) }}</pre>
              </details>
              <details class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary class="cursor-pointer text-[11.5px] font-medium text-slate-600">执行结果 result</summary>
                <pre class="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{{ prettyJson(current.result) }}</pre>
              </details>
              <details class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary class="cursor-pointer text-[11.5px] font-medium text-slate-600">局部变量 vars</summary>
                <pre class="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-200">{{ prettyJson(current.vars) }}</pre>
              </details>
            </div>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
