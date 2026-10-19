<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformApi } from "@/api/platform";
import { ApiError, errorMessage } from "@/lib/http";
import { appTypeLabel, formatDateTime, prettyJson, shortChecksum, statusMeta } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import type {
  AppBundle,
  AppView,
  DiffEntry,
  DraftView,
  VersionDetail,
  VersionDiff,
  VersionSummary
} from "@/types/platform";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const appId = computed(() => String(route.params.appId));
const app = ref<AppView | null>(null);
const loading = ref(true);
const activeTab = ref("draft");

const draft = ref<DraftView | null>(null);
const draftText = ref("");
const lastSavedText = ref("");
const saving = ref(false);
const draftDirty = computed(() => draftText.value !== lastSavedText.value);

const versions = ref<VersionSummary[]>([]);
const versionTotal = ref(0);
const versionPage = ref(1);
const versionSize = 10;
const versionLoading = ref(false);

const publishOpen = ref(false);
const publishing = ref(false);
const publishMessage = ref("");
const publishForce = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const versionDetail = ref<VersionDetail | null>(null);

const diffOpen = ref(false);
const diffLoading = ref(false);
const diffFrom = ref<number | null>(null);
const diffTo = ref<number | null>(null);
const diffResult = ref<VersionDiff | null>(null);

const editOpen = ref(false);
const editSaving = ref(false);
const editForm = reactive({
  name: "",
  description: "",
  category: "",
  type: "business"
});

function defaultBundle(): AppBundle {
  return {
    protocolVersion: "0.1",
    tenantId: sessionStore.tenantId,
    app: {
      id: app.value?.id ?? "",
      key: app.value?.key ?? "",
      name: app.value?.name ?? "",
      description: app.value?.description ?? ""
    },
    artifacts: {
      dataSchemas: [],
      uiSchemas: [],
      logicSchemas: []
    }
  } as AppBundle;
}

function applyDraft(next: DraftView) {
  draft.value = next;
  const bundle = next.bundle ?? defaultBundle();
  lastSavedText.value = prettyJson(bundle);
  draftText.value = lastSavedText.value;
}

async function loadApp() {
  try {
    app.value = await platformApi.getApp(appId.value);
  } catch (error) {
    ElMessage.error(errorMessage(error));
    router.replace("/");
  }
}

async function loadDraft() {
  try {
    applyDraft(await platformApi.getDraft(appId.value));
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

async function loadVersions(page = versionPage.value) {
  versionLoading.value = true;
  try {
    const result = await platformApi.listVersions(appId.value, { page, size: versionSize });
    versions.value = result.items;
    versionTotal.value = result.total;
    versionPage.value = page;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    versionLoading.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  try {
    await Promise.all([loadApp(), loadDraft(), loadVersions(1)]);
  } finally {
    loading.value = false;
  }
}

function parseDraft(): AppBundle | null {
  try {
    const parsed = JSON.parse(draftText.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("根节点必须是 JSON 对象");
    }
    return parsed as AppBundle;
  } catch (error) {
    ElMessage.error(`JSON 解析失败：${(error as Error).message}`);
    return null;
  }
}

function formatDraft() {
  const parsed = parseDraft();
  if (!parsed) return;
  draftText.value = prettyJson(parsed);
}

function restoreTemplate() {
  draftText.value = prettyJson(defaultBundle());
}

async function reloadDraft() {
  if (draftDirty.value) {
    try {
      await ElMessageBox.confirm("当前编辑内容尚未保存，重新加载会丢弃这些修改。", "重新加载草稿", {
        type: "warning",
        confirmButtonText: "丢弃并加载",
        cancelButtonText: "取消"
      });
    } catch {
      return;
    }
  }
  await loadDraft();
  ElMessage.success("草稿已重新加载");
}

async function handleConflict() {
  try {
    await ElMessageBox.confirm(
      "草稿已被其他人修改。加载最新草稿会覆盖当前编辑内容，建议先复制需要保留的部分。",
      "草稿冲突",
      { type: "warning", confirmButtonText: "加载最新草稿", cancelButtonText: "保留当前内容" }
    );
  } catch {
    return;
  }
  await loadDraft();
}

async function saveDraft() {
  if (!draft.value) return;
  const bundle = parseDraft();
  if (!bundle) return;
  saving.value = true;
  try {
    const next = await platformApi.saveDraft(appId.value, bundle, draft.value.revision);
    applyDraft(next);
    ElMessage.success(`草稿已保存 · r${next.revision}`);
    await loadApp();
  } catch (error) {
    if (error instanceof ApiError && error.code === "draft_conflict") {
      await handleConflict();
    } else {
      ElMessage.error(errorMessage(error));
    }
  } finally {
    saving.value = false;
  }
}

function openPublish() {
  if (draftDirty.value) {
    ElMessage.warning("草稿有未保存的修改，请先保存再发布");
    return;
  }
  publishMessage.value = `发布 v${(app.value?.current_version ?? 0) + 1}`;
  publishForce.value = false;
  publishOpen.value = true;
}

async function submitPublish() {
  if (!publishMessage.value.trim()) {
    ElMessage.warning("请填写发布说明");
    return;
  }
  publishing.value = true;
  try {
    const detail = await platformApi.publish(appId.value, publishMessage.value.trim(), {
      force: publishForce.value
    });
    publishOpen.value = false;
    if (detail.unchanged) {
      ElMessage.info("内容与当前版本一致，未生成新版本；如需留档可勾选「强制发布」");
    } else {
      ElMessage.success(`已发布 v${detail.version_no}`);
    }
    await Promise.all([loadApp(), loadVersions(1)]);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    publishing.value = false;
  }
}

async function openVersion(row: VersionSummary) {
  detailOpen.value = true;
  detailLoading.value = true;
  versionDetail.value = null;
  try {
    versionDetail.value = await platformApi.getVersion(appId.value, row.version_no);
  } catch (error) {
    ElMessage.error(errorMessage(error));
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function openDiff(row?: VersionSummary) {
  if (!versions.value.length) {
    ElMessage.warning("还没有可对比的版本");
    return;
  }
  const current = app.value?.current_version ?? versions.value[0]?.version_no ?? null;
  diffFrom.value = row?.version_no ?? versions.value[versions.value.length - 1]?.version_no ?? null;
  diffTo.value = current;
  diffResult.value = null;
  diffOpen.value = true;
}

async function runDiff() {
  if (diffFrom.value == null || diffTo.value == null) {
    ElMessage.warning("请选择两个版本");
    return;
  }
  diffLoading.value = true;
  try {
    diffResult.value = await platformApi.diff(appId.value, diffFrom.value, diffTo.value);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    diffLoading.value = false;
  }
}

async function restoreAsDraft(row: VersionSummary) {
  try {
    await ElMessageBox.confirm(
      `将 v${row.version_no} 的内容恢复成草稿。不会产生新版本，也不会改变线上版本。`,
      "恢复草稿",
      { confirmButtonText: "恢复", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    const next = await platformApi.restoreDraft(
      appId.value,
      row.version_no,
      draft.value?.revision
    );
    applyDraft(next);
    activeTab.value = "draft";
    ElMessage.success(`v${row.version_no} 已恢复成草稿 · r${next.revision}`);
    await loadApp();
  } catch (error) {
    if (error instanceof ApiError && error.code === "draft_conflict") {
      await handleConflict();
    } else {
      ElMessage.error(errorMessage(error));
    }
  }
}

async function rollback(row: VersionSummary) {
  let message = "";
  try {
    const result = await ElMessageBox.prompt(
      `以 v${row.version_no} 的内容发布一个新版本。历史版本不会被改写。`,
      "回滚版本",
      {
        confirmButtonText: "回滚",
        cancelButtonText: "取消",
        inputPlaceholder: "填写回滚原因",
        inputValidator: (value: string) => (value && value.trim() ? true : "请填写回滚原因")
      }
    );
    message = result.value;
  } catch {
    return;
  }
  try {
    const detail = await platformApi.rollback(appId.value, row.version_no, message.trim());
    ElMessage.success(`已回滚并发布 v${detail.version_no}`);
    await Promise.all([loadApp(), loadVersions(1)]);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

function openEdit() {
  if (!app.value) return;
  editForm.name = app.value.name;
  editForm.description = app.value.description ?? "";
  editForm.category = app.value.category ?? "";
  editForm.type = app.value.type;
  editOpen.value = true;
}

async function submitEdit() {
  if (!editForm.name.trim()) {
    ElMessage.warning("应用名称不能为空");
    return;
  }
  editSaving.value = true;
  try {
    app.value = await platformApi.updateApp(appId.value, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      category: editForm.category.trim(),
      type: editForm.type
    });
    editOpen.value = false;
    ElMessage.success("应用信息已更新");
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    editSaving.value = false;
  }
}

function goVersions() {
  activeTab.value = "versions";
  loadVersions(1);
}

function kindLabel(kind: DiffEntry["kind"]) {
  return kind === "added" ? "新增" : kind === "removed" ? "删除" : "修改";
}

function kindClass(kind: DiffEntry["kind"]) {
  if (kind === "added") return "bg-emerald-50 text-emerald-700";
  if (kind === "removed") return "bg-rose-50 text-rose-600";
  return "bg-amber-50 text-amber-700";
}

function renderValue(value: unknown) {
  if (typeof value === "string") return value;
  return prettyJson(value);
}

function sourceLabel(row: VersionSummary) {
  if (row.rollback_of_version) return `回滚自 v${row.rollback_of_version}`;
  if (row.based_on_version) return `基于 v${row.based_on_version}`;
  return "首版";
}

onMounted(loadAll);
</script>

<template>
  <div class="mx-auto max-w-[1240px]">
    <button class="mb-4 flex items-center gap-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-700" @click="router.push('/')">
      <span>←</span> 应用工作台
    </button>

    <div v-if="loading" class="rounded-2xl border border-slate-200 bg-white p-10">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else-if="app">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div class="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-indigo-200">
            {{ app.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-[21px] font-semibold tracking-tight text-slate-900">{{ app.name }}</h1>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="{
                  'bg-amber-50 text-amber-700': statusMeta(app.status).tone === 'draft',
                  'bg-emerald-50 text-emerald-700': statusMeta(app.status).tone === 'published',
                  'bg-slate-100 text-slate-500': statusMeta(app.status).tone === 'archived'
                }"
              >
                {{ statusMeta(app.status).label }}
              </span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span class="font-mono">{{ app.key }}</span>
              <span>·</span>
              <span>{{ appTypeLabel(app.type) }}</span>
              <template v-if="app.category">
                <span>·</span>
                <span>{{ app.category }}</span>
              </template>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <el-button @click="router.push(`/apps/${app.id}/model`)">数据模型</el-button>
          <el-button @click="router.push(`/apps/${app.id}/pages`)">页面设计器</el-button>
          <el-button @click="openEdit">编辑信息</el-button>
          <el-button type="primary" @click="openPublish">发布当前草稿</el-button>
        </div>
      </div>

      <p v-if="app.description" class="mt-4 max-w-3xl text-[13px] leading-relaxed text-slate-500">
        {{ app.description }}
      </p>

      <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">当前版本</p>
          <p class="mt-1.5 font-mono text-[19px] font-semibold text-slate-800">
            {{ app.current_version ? `v${app.current_version}` : "—" }}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">草稿修订</p>
          <p class="mt-1.5 font-mono text-[19px] font-semibold text-slate-800">r{{ draft?.revision ?? app.draft_revision }}</p>
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">最近保存</p>
          <p class="mt-1.5 text-[12.5px] text-slate-700">{{ formatDateTime(app.draft_updated_at) }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">{{ app.draft_updated_by || "—" }}</p>
        </div>
        <div class="rounded-xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">版本总数</p>
          <p class="mt-1.5 font-mono text-[19px] font-semibold text-slate-800">{{ versionTotal }}</p>
        </div>
      </div>

      <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <el-tabs v-model="activeTab" class="px-5 pt-1">
          <el-tab-pane label="草稿" name="draft">
            <div class="flex flex-wrap items-center gap-2.5 pb-3">
              <span class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
                revision {{ draft?.revision ?? "—" }}
              </span>
              <span
                class="inline-flex items-center gap-1.5 text-[11.5px]"
                :class="draftDirty ? 'text-amber-600' : 'text-slate-400'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="draftDirty ? 'bg-amber-500' : 'bg-emerald-400'" />
                {{ draftDirty ? "有未保存修改" : "已与服务器同步" }}
              </span>
              <span class="text-[11.5px] text-slate-300">·</span>
              <span class="text-[11.5px] text-slate-400">{{ draftText.length.toLocaleString() }} 字符</span>

              <div class="ml-auto flex items-center gap-1.5">
                <el-button size="small" @click="formatDraft">格式化</el-button>
                <el-button size="small" @click="reloadDraft">重新加载</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button>
              </div>
            </div>

            <div class="grid gap-4 pb-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div class="overflow-hidden rounded-xl border border-slate-200 bg-[#0f172a]">
                <div class="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
                  <span class="font-mono text-[11px] text-slate-400">AppBundle.json</span>
                  <span class="text-[10px] uppercase tracking-wide text-slate-500">editor</span>
                </div>
                <textarea
                  v-model="draftText"
                  spellcheck="false"
                  class="json-pane scroll-thin block h-[520px] w-full resize-y border-0 bg-transparent p-4 text-slate-200 outline-none"
                />
              </div>

              <div class="space-y-3">
                <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p class="text-[12px] font-medium text-slate-700">编辑约定</p>
                  <ul class="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-slate-500">
                    <li>草稿允许不完整，保存不做协议校验。</li>
                    <li>发布时会校验 protocolVersion 与 app.key。</li>
                    <li>保存会推进 revision，冲突时需重新加载。</li>
                    <li>草稿不携带 snapshot，版本戳只属于已发布版本。</li>
                  </ul>
                </div>

                <div class="rounded-xl border border-slate-200 p-4">
                  <p class="text-[12px] font-medium text-slate-700">快捷操作</p>
                  <div class="mt-2.5 flex flex-col gap-1.5">
                    <el-button size="small" @click="goVersions">查看版本历史</el-button>
                    <el-button size="small" @click="openDiff()">对比两个版本</el-button>
                    <el-button v-if="!draft?.bundle" size="small" text class="!justify-start !text-indigo-600" @click="restoreTemplate">
                      填入最小可发布模板
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="版本历史" name="versions">
            <div class="flex flex-wrap items-center gap-2.5 pb-3">
              <span class="text-[12px] text-slate-400">共 {{ versionTotal }} 个版本，发布内容不可改写。</span>
              <div class="ml-auto flex items-center gap-1.5">
                <el-button size="small" @click="loadVersions(versionPage)">刷新</el-button>
                <el-button size="small" @click="openDiff()">对比版本</el-button>
              </div>
            </div>

            <el-table v-loading="versionLoading" :data="versions" class="w-full" row-key="id">
              <el-table-column label="版本" width="86">
                <template #default="{ row }">
                  <span class="font-mono text-[12.5px] font-medium text-slate-800">v{{ row.version_no }}</span>
                  <span
                    v-if="row.version_no === app.current_version"
                    class="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] text-emerald-700"
                  >当前</span>
                </template>
              </el-table-column>

              <el-table-column label="发布说明" min-width="220">
                <template #default="{ row }">
                  <p class="truncate text-[12.5px] text-slate-700">{{ row.message }}</p>
                  <p class="mt-0.5 text-[10.5px] text-slate-400">{{ sourceLabel(row) }}</p>
                </template>
              </el-table-column>

              <el-table-column label="内容摘要" width="130">
                <template #default="{ row }">
                  <span class="font-mono text-[11px] text-slate-400" :title="row.checksum.value">
                    {{ shortChecksum(row.checksum.value) }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column label="发布人" width="110">
                <template #default="{ row }">
                  <span class="text-[12px] text-slate-500">{{ row.created_by }}</span>
                </template>
              </el-table-column>

              <el-table-column label="发布时间" width="160">
                <template #default="{ row }">
                  <span class="text-[12px] text-slate-500">{{ formatDateTime(row.created_at) }}</span>
                </template>
              </el-table-column>

              <el-table-column label="" width="220" align="right">
                <template #default="{ row }">
                  <div class="flex items-center justify-end gap-0.5">
                    <el-button text size="small" @click="openVersion(row)">查看</el-button>
                    <el-button text size="small" @click="openDiff(row)">Diff</el-button>
                    <el-button text size="small" @click="restoreAsDraft(row)">恢复草稿</el-button>
                    <el-button text size="small" class="!text-amber-600" @click="rollback(row)">回滚</el-button>
                  </div>
                </template>
              </el-table-column>

              <template #empty>
                <div class="py-12">
                  <el-empty description="还没有发布版本">
                    <el-button type="primary" @click="openPublish">发布当前草稿</el-button>
                  </el-empty>
                </div>
              </template>
            </el-table>

            <div v-if="versionTotal > versionSize" class="flex justify-end py-3">
              <el-pagination
                layout="prev, pager, next"
                :current-page="versionPage"
                :page-size="versionSize"
                :total="versionTotal"
                background
                @current-change="loadVersions"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </template>

    <el-dialog v-model="publishOpen" title="发布当前草稿" width="480px">
      <div class="mb-4 rounded-lg bg-slate-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
        发布会对草稿做完整性校验并盖版本戳。内容与当前版本一致时默认不生成新版本。
      </div>
      <el-form label-position="top">
        <el-form-item label="发布说明" required>
          <el-input
            v-model="publishMessage"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="例如：上线请假申请与两级审批"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="publishForce">内容未变也强制生成新版本</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishOpen = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailOpen" title="版本详情" size="760px">
      <div v-loading="detailLoading" class="h-full">
        <template v-if="versionDetail">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="版本">v{{ versionDetail.version_no }}</el-descriptions-item>
            <el-descriptions-item label="发布人">{{ versionDetail.created_by }}</el-descriptions-item>
            <el-descriptions-item label="发布时间">{{ formatDateTime(versionDetail.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ sourceLabel(versionDetail) }}</el-descriptions-item>
            <el-descriptions-item label="内容摘要" :span="2">
              <span class="break-all font-mono text-[11px] text-slate-500">{{ versionDetail.content_checksum }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="发布说明" :span="2">{{ versionDetail.message }}</el-descriptions-item>
          </el-descriptions>

          <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#0f172a]">
            <div class="border-b border-white/10 px-3.5 py-2 font-mono text-[11px] text-slate-400">bundle.json</div>
            <pre class="json-pane scroll-thin max-h-[calc(100vh-320px)] overflow-auto p-4 text-slate-200">{{ prettyJson(versionDetail.bundle) }}</pre>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="diffOpen" title="版本对比" width="860px" top="6vh">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <p class="mb-1 text-[11px] text-slate-400">基准版本</p>
          <el-select v-model="diffFrom" class="!w-[180px]" filterable>
            <el-option v-for="item in versions" :key="item.id" :label="`v${item.version_no} · ${item.message}`" :value="item.version_no" />
          </el-select>
        </div>
        <span class="pb-2 text-slate-300">→</span>
        <div>
          <p class="mb-1 text-[11px] text-slate-400">目标版本</p>
          <el-select v-model="diffTo" class="!w-[180px]" filterable>
            <el-option v-for="item in versions" :key="item.id" :label="`v${item.version_no} · ${item.message}`" :value="item.version_no" />
          </el-select>
        </div>
        <el-button type="primary" :loading="diffLoading" @click="runDiff">开始对比</el-button>
      </div>

      <div v-if="diffResult" class="mt-5">
        <el-alert v-if="diffResult.identical" type="success" :closable="false" show-icon title="两个版本的元数据内容完全一致" />
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-md bg-emerald-50 px-2 py-1 text-[11.5px] text-emerald-700">新增 {{ diffResult.summary.added }}</span>
            <span class="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-600">删除 {{ diffResult.summary.removed }}</span>
            <span class="rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-700">修改 {{ diffResult.summary.changed }}</span>
            <span class="text-[11.5px] text-slate-400">共 {{ diffResult.summary.total }} 处</span>
            <span v-if="diffResult.truncated" class="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">仅展示前 200 条</span>
          </div>

          <div class="scroll-thin mt-3 max-h-[56vh] space-y-2 overflow-auto pr-1">
            <div v-for="(entry, index) in diffResult.changes" :key="`${entry.path}-${index}`" class="rounded-lg border border-slate-200 bg-white">
              <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                <span class="rounded px-1.5 py-0.5 text-[10.5px] font-medium" :class="kindClass(entry.kind)">{{ kindLabel(entry.kind) }}</span>
                <span class="break-all font-mono text-[11.5px] text-slate-700">{{ entry.path }}</span>
                <span v-if="entry.artifact_key" class="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {{ entry.artifact_kind }} · {{ entry.artifact_key }}
                </span>
              </div>
              <div class="grid gap-2 p-3 md:grid-cols-2">
                <div v-if="entry.kind !== 'added'">
                  <p class="mb-1 text-[10px] uppercase tracking-wide text-rose-400">before</p>
                  <pre class="scroll-thin max-h-48 overflow-auto rounded-md bg-rose-50/60 p-2 font-mono text-[11px] leading-relaxed text-slate-700">{{ renderValue(entry.before) }}</pre>
                </div>
                <div v-if="entry.kind !== 'removed'">
                  <p class="mb-1 text-[10px] uppercase tracking-wide text-emerald-500">after</p>
                  <pre class="scroll-thin max-h-48 overflow-auto rounded-md bg-emerald-50/60 p-2 font-mono text-[11px] leading-relaxed text-slate-700">{{ renderValue(entry.after) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </el-dialog>

    <el-dialog v-model="editOpen" title="编辑应用信息" width="480px">
      <el-form label-position="top">
        <el-form-item label="应用名称" required>
          <el-input v-model="editForm.name" maxlength="64" />
        </el-form-item>
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="应用类型">
            <el-select v-model="editForm.type" class="w-full">
              <el-option label="业务系统" value="business" />
              <el-option label="教育" value="education" />
              <el-option label="办公" value="office" />
              <el-option label="模板" value="template" />
            </el-select>
          </el-form-item>
          <el-form-item label="分类">
            <el-input v-model="editForm.category" />
          </el-form-item>
        </div>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>