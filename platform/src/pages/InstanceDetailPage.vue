<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import { workflowStatusClass, workflowStatusMeta } from "@/lib/runtime";
import ActionRunPanel from "@/components/runtime/ActionRunPanel.vue";
import ProcessTimeline from "@/components/runtime/ProcessTimeline.vue";
import RuntimeFields from "@/components/runtime/RuntimeFields.vue";
import type { InstanceView } from "@/types/runtime";

const route = useRoute();
const router = useRouter();
const appId = computed(() => String(route.params.appId ?? ""));
const instanceId = computed(() => String(route.params.instanceId ?? ""));

const instance = ref<InstanceView | null>(null);
const loading = ref(false);
const error = ref("");
const runPanel = ref<InstanceType<typeof ActionRunPanel> | null>(null);

const systemKeys = new Set([
  "status",
  "current_task",
  "approver_id",
  "approved_at",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "process_instance_id",
  "tenant_id",
  "deleted_at",
  "version"
]);

const displayFields = computed(() =>
  instance.value?.fields.filter((field) => !systemKeys.has(field.key)) ?? []
);

const statusMeta = computed(() => workflowStatusMeta(instance.value?.status));
const startedAt = computed(() => instance.value?.timeline[0]?.start_time || "");
const applicant = computed(() => {
  const value = instance.value?.business.applicant_id;
  return value === null || value === undefined ? "—" : String(value);
});
const currentNode = computed(() => {
  if (!instance.value) return "—";
  if (instance.value.finished) return "流程已结束";
  return instance.value.active_tasks[0]?.task_name || "审批进行中";
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    instance.value = await runtimeApi.getInstance(appId.value, instanceId.value);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push({ name: "app-approvals", params: { appId: appId.value } });
}

async function refreshAll() {
  await Promise.all([load(), runPanel.value?.load()]);
}

function openTask(taskId: string) {
  router.push({ name: "app-approval-detail", params: { appId: appId.value, taskId } });
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[1280px]">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-[12px] text-slate-400">
          <button class="transition hover:text-indigo-600" @click="goBack">← 审批中心</button>
          <span class="text-slate-300">/</span>
          <span>{{ instance?.flow_name || "流程实例" }}</span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <h1 class="text-[22px] font-semibold tracking-tight text-slate-900">
            {{ instance?.business_title || "流程实例" }}
          </h1>
          <span v-if="instance" :class="workflowStatusClass(instance.status)">{{ statusMeta.label }}</span>
          <span
            v-if="instance?.finished"
            class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
          >
            已结束
          </span>
        </div>
        <p class="mt-1.5 text-[13px] text-slate-500">
          我发起的流程 · 业务单号
          <span class="font-mono text-[11.5px] text-slate-400">{{ instance?.business_key || "—" }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <el-button :loading="loading" @click="refreshAll">刷新</el-button>
        <el-button @click="goBack">返回列表</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="mt-5" />

    <div v-loading="loading" class="mt-6 min-h-[320px]">
      <div v-if="instance" class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-5">
          <section class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 class="text-[14px] font-semibold text-slate-800">业务信息</h2>
                <p class="mt-0.5 text-[11px] text-slate-400">实例快照来自发布态业务表</p>
              </div>
            </header>
            <div class="p-5">
              <RuntimeFields
                :fields="displayFields"
                :values="instance.business"
                :editable-keys="[]"
              />
            </div>
          </section>

          <ActionRunPanel
            ref="runPanel"
            :app-id="appId"
            :process-instance-id="instance.process_instance_id"
            @refresh="load"
          />

          <section class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header class="border-b border-slate-100 px-5 py-3.5">
              <h2 class="text-[14px] font-semibold text-slate-800">当前任务</h2>
              <p class="mt-0.5 text-[11px] text-slate-400">
                {{ instance.finished ? "流程已经结束，没有运行中的任务" : `共 ${instance.active_tasks.length} 个活动任务` }}
              </p>
            </header>
            <div class="p-5">
              <div v-if="instance.active_tasks.length" class="space-y-2">
                <button
                  v-for="task in instance.active_tasks"
                  :key="task.task_id"
                  class="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
                  @click="openTask(task.task_id)"
                >
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium text-slate-700">{{ task.task_name }}</p>
                    <p class="mt-0.5 text-[11px] text-slate-400">
                      {{ task.assignee || "待签收" }} · {{ formatDateTime(task.created_at) }}
                    </p>
                  </div>
                  <span class="shrink-0 text-[11.5px] font-medium text-indigo-600">去办理 →</span>
                </button>
              </div>
              <p v-else class="py-4 text-center text-[12px] text-slate-400">
                {{ instance.finished ? "流程已归档" : "暂无活动任务" }}
              </p>
            </div>
          </section>
        </div>

        <aside class="space-y-5">
          <section class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 class="text-[14px] font-semibold text-slate-800">流程信息</h2>
            <dl class="mt-4 space-y-3 text-[12px]">
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">流程</dt>
                <dd class="text-right font-medium text-slate-700">{{ instance.flow_name }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">当前节点</dt>
                <dd class="text-right font-medium text-slate-700">{{ currentNode }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">申请人</dt>
                <dd class="text-right text-slate-600">{{ applicant }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">发起时间</dt>
                <dd class="text-right text-slate-600">{{ formatDateTime(startedAt) }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">实例 ID</dt>
                <dd class="break-all text-right font-mono text-[10px] text-slate-400">{{ instance.process_instance_id }}</dd>
              </div>
            </dl>
          </section>

          <section class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 class="text-[14px] font-semibold text-slate-800">流程轨迹</h2>
            <div class="mt-4">
              <ProcessTimeline :items="instance.timeline" />
            </div>
          </section>
        </aside>
      </div>

      <div v-else-if="!loading && !error" class="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <p class="text-[13px] font-medium text-slate-500">未找到流程实例</p>
        <p class="mt-1 text-[11.5px] text-slate-400">实例可能已被删除或不属于当前应用。</p>
      </div>
    </div>
  </div>
</template>
