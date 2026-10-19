<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import {
  actionButtonType,
  isFieldEditable,
  workflowStatusClass,
  workflowStatusMeta
} from "@/lib/runtime";
import ProcessTimeline from "@/components/runtime/ProcessTimeline.vue";
import RuntimeFields from "@/components/runtime/RuntimeFields.vue";
import type { RuntimeAction, TaskDetail } from "@/types/runtime";

const route = useRoute();
const router = useRouter();
const appId = computed(() => String(route.params.appId ?? ""));
const taskId = computed(() => String(route.params.taskId ?? ""));

const detail = ref<TaskDetail | null>(null);
const values = reactive<Record<string, unknown>>({});
const comment = ref("");
const loading = ref(false);
const submitting = ref(false);
const claiming = ref(false);
const error = ref("");

const transferOpen = ref(false);
const transferTarget = ref("");
const transferComment = ref("");
const transferOptions = [
  { label: "bob · 部门负责人", value: "bob" },
  { label: "principal · 院级审批", value: "principal" },
  { label: "alice · 申请人", value: "alice" }
];

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
  detail.value?.fields.filter((field) => !systemKeys.has(field.key)) ?? []
);

const editableKeys = computed(() => {
  if (!detail.value) return [];
  return detail.value.fields
    .filter((field) => isFieldEditable(detail.value as TaskDetail, field.key))
    .map((field) => field.key);
});

const statusMeta = computed(() => workflowStatusMeta(detail.value?.status));
const canAct = computed(() => Boolean(detail.value?.can_act));
const canClaim = computed(() => Boolean(detail.value && !detail.value.finished && !detail.value.assignee));
const requiresComment = computed(() => detail.value?.actions.some((action) => action.comment_required) ?? false);
const startedAt = computed(() => detail.value?.timeline[0]?.start_time || detail.value?.created_at || "");
const nodeLabel = computed(() => {
  if (!detail.value) return "—";
  return detail.value.finished ? `${detail.value.task_name}（已办理）` : detail.value.task_name;
});

function syncValues() {
  for (const key of Object.keys(values)) {
    delete values[key];
  }
  for (const field of detail.value?.fields ?? []) {
    values[field.key] = field.value;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    detail.value = await runtimeApi.getTask(appId.value, taskId.value);
    syncValues();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

function onChange(key: string, value: unknown) {
  values[key] = value;
}

function buildVariables(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of editableKeys.value) {
    out[key] = values[key];
  }
  return out;
}

async function runAction(action: RuntimeAction) {
  if (!detail.value) return;
  if (action.outcome === "transfer") {
    transferTarget.value = "";
    transferComment.value = "";
    transferOpen.value = true;
    return;
  }
  if (action.comment_required && !comment.value.trim()) {
    ElMessage.warning("该操作必须填写审批意见");
    return;
  }
  try {
    await ElMessageBox.confirm(
      action.comment_required
        ? `确认执行「${action.label}」？审批意见将记录到流程中。`
        : `确认执行「${action.label}」并提交到下一节点？`,
      "审批操作",
      {
        type: action.outcome === "approve" ? "info" : "warning",
        confirmButtonText: action.label,
        cancelButtonText: "取消"
      }
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    detail.value = await runtimeApi.complete(appId.value, taskId.value, {
      outcome: action.outcome,
      comment: comment.value.trim() || undefined,
      variables: buildVariables()
    });
    syncValues();
    comment.value = "";
    ElMessage.success(`已${action.label}`);
  } catch (err) {
    ElMessage.error(errorMessage(err));
  } finally {
    submitting.value = false;
  }
}

async function claim() {
  claiming.value = true;
  try {
    detail.value = await runtimeApi.claim(appId.value, taskId.value);
    syncValues();
    ElMessage.success("任务已签收");
  } catch (err) {
    ElMessage.error(errorMessage(err));
  } finally {
    claiming.value = false;
  }
}

async function submitTransfer() {
  const target = transferTarget.value.trim();
  if (!target) {
    ElMessage.warning("请选择或输入目标办理人");
    return;
  }
  submitting.value = true;
  try {
    detail.value = await runtimeApi.transfer(appId.value, taskId.value, {
      to_user_id: target,
      comment: transferComment.value.trim() || undefined
    });
    syncValues();
    transferOpen.value = false;
    ElMessage.success(`任务已转办给 ${target}`);
  } catch (err) {
    ElMessage.error(errorMessage(err));
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  router.push({ name: "app-approvals", params: { appId: appId.value } });
}

function openInstance() {
  if (!detail.value) return;
  router.push({
    name: "app-instance-detail",
    params: { appId: appId.value, instanceId: detail.value.process_instance_id }
  });
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
          <span>{{ detail?.flow_name || "审批详情" }}</span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <h1 class="text-[22px] font-semibold tracking-tight text-slate-900">
            {{ detail?.business_title || "任务详情" }}
          </h1>
          <span v-if="detail" :class="workflowStatusClass(detail.status)">{{ statusMeta.label }}</span>
          <span
            v-if="detail?.finished"
            class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
          >
            只读
          </span>
        </div>
        <p class="mt-1.5 text-[13px] text-slate-500">
          {{ detail?.task_name || "加载中" }} · 业务单号
          <span class="font-mono text-[11.5px] text-slate-400">{{ detail?.business_key || "—" }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="goBack">返回列表</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="mt-5" />

    <div v-loading="loading" class="mt-6 min-h-[320px]">
      <div v-if="detail" class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-5">
          <section class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 class="text-[14px] font-semibold text-slate-800">业务信息</h2>
                <p class="mt-0.5 text-[11px] text-slate-400">
                  {{ canAct && editableKeys.length ? "高亮输入项可在当前节点修改" : "当前节点只读" }}
                </p>
              </div>
              <span
                v-if="canAct && editableKeys.length"
                class="rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-medium text-indigo-600"
              >
                {{ editableKeys.length }} 个可编辑字段
              </span>
            </header>
            <div class="p-5">
              <RuntimeFields
                :fields="displayFields"
                :values="values"
                :editable-keys="editableKeys"
                @change="onChange"
              />
            </div>
          </section>

          <section
            v-if="canAct"
            class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <header class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 class="text-[14px] font-semibold text-slate-800">审批意见</h2>
                <p class="mt-0.5 text-[11px] text-slate-400">
                  {{ requiresComment ? "驳回 / 退回时必须填写意见" : "意见会写入流程记录" }}
                </p>
              </div>
              <span class="text-[11px] text-slate-400">{{ comment.length }} / 1000</span>
            </header>
            <div class="p-5">
              <el-input
                v-model="comment"
                type="textarea"
                :rows="4"
                maxlength="1000"
                placeholder="填写审批意见、退回原因或转办说明…"
              />

              <div class="mt-4 flex flex-wrap items-center gap-2">
                <el-button v-if="canClaim" :loading="claiming" @click="claim">签收任务</el-button>
                <el-button
                  v-for="action in detail.actions"
                  :key="action.key"
                  :type="actionButtonType(action.style)"
                  :loading="submitting"
                  @click="runAction(action)"
                >
                  {{ action.label }}
                </el-button>
                <span class="ml-auto text-[11px] text-slate-400">
                  当前办理人 {{ detail.assignee || "待签收" }}
                </span>
              </div>
            </div>
          </section>

          <section
            v-else
            class="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-center"
          >
            <p class="text-[13px] font-medium text-slate-500">当前任务已结束，无待执行动作</p>
            <p class="mt-1 text-[11.5px] text-slate-400">可在右侧查看流程轨迹，或返回审批中心处理其他任务。</p>
          </section>
        </div>

        <aside class="space-y-5">
          <section class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 class="text-[14px] font-semibold text-slate-800">流程信息</h2>
            <dl class="mt-4 space-y-3 text-[12px]">
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">流程</dt>
                <dd class="text-right font-medium text-slate-700">{{ detail.flow_name }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">当前节点</dt>
                <dd class="text-right font-medium text-slate-700">{{ nodeLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">申请人</dt>
                <dd class="text-right text-slate-600">{{ detail.applicant_id || "—" }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">当前办理人</dt>
                <dd class="text-right text-slate-600">{{ detail.assignee || "待签收" }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">发起时间</dt>
                <dd class="text-right text-slate-600">{{ formatDateTime(startedAt) }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-slate-400">业务单号</dt>
                <dd class="break-all text-right font-mono text-[10.5px] text-slate-500">{{ detail.business_key }}</dd>
              </div>
            </dl>
            <button
              class="mt-4 w-full rounded-lg border border-slate-200 py-2 text-[11.5px] font-medium text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600"
              @click="openInstance"
            >
              查看流程实例 →
            </button>
          </section>

          <section class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 class="text-[14px] font-semibold text-slate-800">流程轨迹</h2>
            <div class="mt-4">
              <ProcessTimeline :items="detail.timeline" />
            </div>
          </section>
        </aside>
      </div>

      <div v-else-if="!loading && !error" class="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <p class="text-[13px] font-medium text-slate-500">未找到任务</p>
        <p class="mt-1 text-[11.5px] text-slate-400">任务可能已被撤回或删除。</p>
      </div>
    </div>

    <el-dialog v-model="transferOpen" title="转办任务" width="460px">
      <p class="mb-4 text-[12px] leading-relaxed text-slate-500">
        转办后任务会从当前办理人的待办中移除。目标用户由演示目录提供，阶段 5 接入组织架构后改为人员选择器。
      </p>
      <el-form label-position="top">
        <el-form-item label="目标办理人" required>
          <el-select
            v-model="transferTarget"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入用户 ID"
            class="w-full"
          >
            <el-option
              v-for="option in transferOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="转办说明">
          <el-input v-model="transferComment" type="textarea" :rows="3" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferOpen = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTransfer">确认转办</el-button>
      </template>
    </el-dialog>
  </div>
</template>
