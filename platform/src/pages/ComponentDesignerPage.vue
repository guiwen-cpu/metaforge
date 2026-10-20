<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformApi } from "@/api/platform";
import { ApiError, errorMessage } from "@/lib/http";
import { formatDateTime, prettyJson } from "@/lib/format";
import SandboxFrame from "@/components/component/SandboxFrame.vue";
import {
  COMPONENT_KINDS,
  COMPONENT_PRESETS,
  COMPONENT_RUNTIMES,
  DEFAULT_PROP_TYPES,
  PROP_TYPES,
  componentGroupsOf,
  componentKindLabel,
  componentRuntimeLabel,
  componentStats,
  createComponent,
  createPresetComponent,
  defaultCapabilities,
  defaultSandbox,
  integrityOfBytes,
  normalizeComponent,
  sanitizeComponentName,
  sha384Integrity,
  uniqueComponentName,
  validateComponents
} from "@/lib/componentModel";
import { builtinComponentNames, textOf } from "@/lib/uiModel";
import type {
  ComponentDef,
  ComponentEventDef,
  ComponentIssue,
  ComponentPropDef,
  ComponentSlotDef
} from "@/types/uiModel";
import type { AppBundle, AppView, DraftView } from "@/types/platform";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const appId = computed(() => String(route.params.appId));
const app = ref<AppView | null>(null);
const draft = ref<DraftView | null>(null);
const bundle = ref<AppBundle | null>(null);
const components = ref<ComponentDef[]>([]);
const savedSnapshot = ref("[]");
const loading = ref(true);
const saving = ref(false);
const reloading = ref(false);
const query = ref("");

const activeId = ref<string | null>(null);
const editorTab = ref<"basic" | "props" | "io" | "sandbox" | "code">("basic");
const stageTab = ref<"preview" | "contract" | "issues">("preview");
const stageWidth = ref<"full" | "720" | "420">("full");
const previewInteractive = ref(false);
const previewNonce = ref(0);
const previewOverrideText = ref("{}");
const previewOverride = ref<Record<string, unknown>>({});
const previewError = ref("");

const issuesOpen = ref(false);
const jsonOpen = ref(false);
const jsonText = ref("");
const jsonError = ref("");

const publishOpen = ref(false);
const publishing = ref(false);
const publishMessage = ref("");
const publishForce = ref(false);

const createOpen = ref(false);
const createForm = reactive({
  name: "",
  title: "",
  kind: "advanced" as ComponentDef["kind"],
  group: "业务组件"
});
const createError = ref("");

const capabilityKeys = [
  { key: "formField", label: "表单字段", hint: "进入表单模型、参与必填校验" },
  { key: "listColumn", label: "列表列", hint: "可绑定到列表列渲染" },
  { key: "supportsBinding", label: "数据绑定", hint: "属性可绑定表达式" },
  { key: "supportsDataSource", label: "数据源", hint: "可消费页面数据源" },
  { key: "supportsLoop", label: "循环渲染", hint: "支持 loop 配置" },
  { key: "supportsVisibility", label: "条件显示", hint: "支持 visible 表达式" },
  { key: "supportsResponsive", label: "响应式", hint: "支持断点配置" },
  { key: "supportsStyle", label: "样式覆盖", hint: "支持 style 属性" },
  { key: "movable", label: "可移动", hint: "画布内允许拖动排序" },
  { key: "resizable", label: "可缩放", hint: "允许调整宽高" },
  { key: "copyable", label: "可复制", hint: "允许复制节点" },
  { key: "deletable", label: "可删除", hint: "允许删除节点" },
  { key: "virtualScroll", label: "虚拟滚动", hint: "大数据量列表能力" }
];

const sandboxKeys = [
  { key: "network", label: "允许网络", hint: "开启后必须配置 allowedHosts" },
  { key: "storage", label: "本地存储", hint: "严格沙箱默认不提供同源存储" },
  { key: "dom", label: "外部 DOM", hint: "允许访问父页面 DOM，隔离性下降" },
  { key: "cookies", label: "Cookie", hint: "允许读写 Cookie" },
  { key: "clipboard", label: "剪贴板", hint: "允许读写剪贴板" },
  { key: "navigation", label: "页面跳转", hint: "允许导航父页面" },
  { key: "allowEval", label: "eval", hint: "允许动态求值，攻击面显著扩大" }
];

const activeComponent = computed<ComponentDef | null>(
  () => components.value.find((item) => item.id === activeId.value) ?? null
);

const groups = computed(() => componentGroupsOf(components.value));
const stats = computed(() => componentStats(components.value));
const issues = computed<ComponentIssue[]>(() =>
  validateComponents(components.value, Array.from(builtinComponentNames))
);
const errorCount = computed(() => issues.value.filter((item) => item.level === "error").length);
const warningCount = computed(() => issues.value.filter((item) => item.level === "warning").length);
const activeIssues = computed(() =>
  activeComponent.value
    ? issues.value.filter(
        (item) =>
          item.where === activeComponent.value?.name ||
          item.where.startsWith(`${activeComponent.value?.name}.`)
      )
    : []
);
const dirty = computed(() => JSON.stringify(components.value) !== savedSnapshot.value);
const stageTabs: Array<{ key: "preview" | "contract" | "issues"; label: string }> = [
  { key: "preview", label: "预览" },
  { key: "contract", label: "契约" },
  { key: "issues", label: "问题" }
];
const editorTabs: Array<{ key: "basic" | "props" | "io" | "sandbox" | "code"; label: string }> = [
  { key: "basic", label: "基础" },
  { key: "props", label: "属性" },
  { key: "io", label: "插槽事件" },
  { key: "sandbox", label: "沙箱" },
  { key: "code", label: "预览代码" }
];
const stageFrameWidth = computed(() => {
  if (stageWidth.value === "720") return "720px";
  if (stageWidth.value === "420") return "420px";
  return "100%";
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
      logicSchemas: [],
      components: []
    }
  } as AppBundle;
}

function applyDraft(next: DraftView, preserve = true) {
  const previousId = activeId.value;
  draft.value = next;
  bundle.value = next.bundle ?? bundle.value ?? defaultBundle();
  if (!bundle.value.artifacts) bundle.value.artifacts = {};
  const raw = bundle.value.artifacts.components;
  components.value = Array.isArray(raw)
    ? (raw as ComponentDef[]).filter((item) => !!item && typeof item === "object").map(normalizeComponent)
    : [];
  savedSnapshot.value = JSON.stringify(components.value);
  if (preserve && previousId && components.value.some((item) => item.id === previousId)) {
    activeId.value = previousId;
    return;
  }
  activeId.value = components.value[0]?.id ?? null;
}

async function load() {
  loading.value = true;
  try {
    const [appView, draftView] = await Promise.all([
      platformApi.getApp(appId.value),
      platformApi.getDraft(appId.value)
    ]);
    app.value = appView;
    applyDraft(draftView, false);
  } catch (error) {
    ElMessage.error(errorMessage(error));
    router.replace("/");
  } finally {
    loading.value = false;
  }
}
async function reloadDraft() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm("当前组件有未保存修改，重新加载会丢弃这些修改。", "重新加载草稿", {
        type: "warning",
        confirmButtonText: "丢弃并加载",
        cancelButtonText: "取消"
      });
    } catch {
      return;
    }
  }
  reloading.value = true;
  try {
    applyDraft(await platformApi.getDraft(appId.value), false);
    ElMessage.success("草稿已重新加载");
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    reloading.value = false;
  }
}

async function handleConflict() {
  try {
    await ElMessageBox.confirm(
      "草稿已被其他人修改。加载最新草稿会覆盖当前编辑内容，建议先复制契约 JSON 备份。",
      "草稿冲突",
      { type: "warning", confirmButtonText: "加载最新草稿", cancelButtonText: "保留当前内容" }
    );
  } catch {
    return;
  }
  try {
    applyDraft(await platformApi.getDraft(appId.value));
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

async function saveDraft(silent = false) {
  if (!draft.value) return false;
  saving.value = true;
  try {
    const nextBundle = JSON.parse(JSON.stringify(bundle.value ?? defaultBundle())) as AppBundle;
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.components = JSON.parse(JSON.stringify(components.value));
    const next = await platformApi.saveDraft(appId.value, nextBundle, draft.value.revision);
    applyDraft(next);
    app.value = await platformApi.getApp(appId.value);
    if (!silent) ElMessage.success(`组件已保存 · r${next.revision}`);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === "draft_conflict") {
      await handleConflict();
    } else {
      ElMessage.error(errorMessage(error));
    }
    return false;
  } finally {
    saving.value = false;
  }
}

function openPublish() {
  if (errorCount.value) {
    ElMessage.warning("存在发布阻断错误，请先修复校验问题");
    issuesOpen.value = true;
    return;
  }
  publishMessage.value = publishMessage.value || `更新组件：${components.value.length} 个`;
  publishOpen.value = true;
}

async function submitPublish() {
  if (!publishMessage.value.trim()) {
    ElMessage.warning("请填写发布说明");
    return;
  }
  publishing.value = true;
  try {
    const nextBundle = JSON.parse(JSON.stringify(bundle.value ?? defaultBundle())) as AppBundle;
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.components = JSON.parse(JSON.stringify(components.value));
    const detail = await platformApi.publish(appId.value, publishMessage.value.trim(), {
      force: publishForce.value,
      bundle: nextBundle
    });
    publishOpen.value = false;
    applyDraft(await platformApi.getDraft(appId.value), false);
    app.value = await platformApi.getApp(appId.value);
    ElMessage.success(`已发布 v${detail.version_no}`);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    publishing.value = false;
  }
}

function existingNames(): string[] {
  return components.value.map((item) => item.name);
}

function selectComponent(component: ComponentDef) {
  activeId.value = component.id;
  editorTab.value = "basic";
  previewOverride.value = {};
  previewOverrideText.value = "{}";
  previewError.value = "";
}

function addPreset(key: (typeof COMPONENT_PRESETS)[number]["key"]) {
  const component = createPresetComponent(key, existingNames());
  components.value.push(component);
  selectComponent(component);
  ElMessage.success(`已添加预设「${textOf(component.title)}」`);
}

function openCreate() {
  createForm.name = uniqueComponentName(existingNames(), "my-component");
  createForm.title = "自定义组件";
  createForm.kind = "advanced";
  createForm.group = "业务组件";
  createError.value = "";
  createOpen.value = true;
}

function submitCreate() {
  const name = sanitizeComponentName(createForm.name);
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(name)) {
    createError.value = "组件名必须是小写 kebab-case（2-48 位）";
    return;
  }
  if (builtinComponentNames.has(name)) {
    createError.value = "组件名与平台内建组件冲突";
    return;
  }
  if (components.value.some((item) => item.name === name)) {
    createError.value = "组件名已存在";
    return;
  }
  const title = createForm.title.trim();
  if (!title) {
    createError.value = "组件标题不能为空";
    return;
  }
  const component = createComponent(name, {
    title,
    kind: createForm.kind,
    group: createForm.group || "业务组件",
    container: createForm.kind === "container" || createForm.kind === "layout",
    capabilities: defaultCapabilities({
      supportsDataSource: createForm.kind === "data",
      formField: createForm.kind === "field"
    })
  });
  components.value.push(component);
  selectComponent(component);
  createOpen.value = false;
  ElMessage.success("组件已创建");
}

function duplicateComponent() {
  const current = activeComponent.value;
  if (!current) return;
  const name = uniqueComponentName(existingNames(), `${current.name}-copy`);
  const copy = JSON.parse(JSON.stringify(current)) as ComponentDef;
  copy.id = createComponent("tmp").id;
  copy.name = name;
  copy.title = `${textOf(current.title)} 副本`;
  copy.version = 1;
  components.value.push(copy);
  selectComponent(copy);
  ElMessage.success("已复制组件");
}

async function removeComponent() {
  const current = activeComponent.value;
  if (!current) return;
  try {
    await ElMessageBox.confirm(
      `删除组件「${textOf(current.title)}」后，已引用它的页面会失效，发布校验将阻断。`,
      "删除组件",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  const index = components.value.findIndex((item) => item.id === current.id);
  components.value.splice(index, 1);
  activeId.value = components.value[Math.max(0, index - 1)]?.id ?? null;
  ElMessage.success("已删除组件");
}

function patchActive(patch: Partial<ComponentDef>) {
  const current = activeComponent.value;
  if (!current) return;
  Object.assign(current, patch);
}

function setActiveString(key: "title" | "description" | "group" | "source" | "integrity", value: string) {
  const current = activeComponent.value;
  if (!current) return;
  (current as Record<string, unknown>)[key] = value;
}


function setRuntime(value: string) {
  const current = activeComponent.value;
  if (!current) return;
  current.runtime = value as ComponentDef["runtime"];
  if (value === "sandbox" && !current.source) current.source = `inline://${current.name}`;
}

function toggleCapability(key: string, value: boolean) {
  const current = activeComponent.value;
  if (!current) return;
  current.capabilities = defaultCapabilities(current.capabilities);
  current.capabilities[key] = value;
}

function toggleSandbox(key: string, value: boolean) {
  const current = activeComponent.value;
  if (!current) return;
  current.sandbox = defaultSandbox(current.sandbox);
  current.sandbox[key] = value;
}

function setSandboxList(key: "allowedHosts" | "allowedModules", value: string) {
  const current = activeComponent.value;
  if (!current) return;
  current.sandbox = defaultSandbox(current.sandbox);
  current.sandbox[key] = value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setMemoryLimit(value: number | undefined) {
  const current = activeComponent.value;
  if (!current) return;
  current.sandbox = defaultSandbox(current.sandbox);
  current.sandbox.memoryLimitMb = value ?? 64;
}

function ensureProps(): ComponentPropDef[] {
  const current = activeComponent.value;
  if (!current) return [];
  if (!current.props) current.props = [];
  return current.props;
}

function addProp() {
  ensureProps().push({
    key: `prop${(activeComponent.value?.props?.length ?? 0) + 1}`,
    label: "新属性",
    type: "text",
    bindable: true
  });
}

function removeProp(index: number) {
  activeComponent.value?.props?.splice(index, 1);
}

function propEnumText(prop: ComponentPropDef): string {
  return Array.isArray(prop.enum) ? prop.enum.map((item) => String(item)).join(", ") : "";
}

function setPropEnum(prop: ComponentPropDef, value: string) {
  prop.enum = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function propDefault(prop: ComponentPropDef): string {
  const current = activeComponent.value;
  const value = current?.defaultProps?.[prop.key];
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function setPropDefault(prop: ComponentPropDef, value: string) {
  const current = activeComponent.value;
  if (!current) return;
  if (!current.defaultProps) current.defaultProps = {};
  if (value === "") {
    delete current.defaultProps[prop.key];
    return;
  }
  if (prop.type === "boolean") {
    current.defaultProps[prop.key] = value === "true";
    return;
  }
  if (prop.type === "integer" || prop.type === "number") {
    const parsed = Number(value);
    current.defaultProps[prop.key] = Number.isFinite(parsed) ? parsed : value;
    return;
  }
  if (prop.type === "json") {
    try {
      current.defaultProps[prop.key] = JSON.parse(value);
    } catch {
      current.defaultProps[prop.key] = value;
    }
    return;
  }
  current.defaultProps[prop.key] = value;
}

function ensureSlots(): ComponentSlotDef[] {
  const current = activeComponent.value;
  if (!current) return [];
  if (!current.slots) current.slots = [];
  return current.slots;
}

function addSlot() {
  ensureSlots().push({ name: `slot${(activeComponent.value?.slots?.length ?? 0) + 1}`, label: "新插槽" });
}

function removeSlot(index: number) {
  activeComponent.value?.slots?.splice(index, 1);
}

function ensureEvents(): ComponentEventDef[] {
  const current = activeComponent.value;
  if (!current) return [];
  if (!current.events) current.events = [];
  return current.events;
}

function addEvent() {
  ensureEvents().push({ name: `event${(activeComponent.value?.events?.length ?? 0) + 1}`, label: "新事件" });
}

function removeEvent(index: number) {
  activeComponent.value?.events?.splice(index, 1);
}

function setAcceptChildren(value: string) {
  const current = activeComponent.value;
  if (!current) return;
  current.acceptChildren = value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCanBeChildOf(value: string) {
  const current = activeComponent.value;
  if (!current) return;
  current.canBeChildOf = value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setSemanticIntent(value: string) {
  const current = activeComponent.value;
  if (!current) return;
  current.semantic = { ...(current.semantic ?? {}), intent: value };
}

function applyPreviewProps() {
  previewError.value = "";
  try {
    const parsed = JSON.parse(previewOverrideText.value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      previewError.value = "属性覆盖必须是 JSON 对象";
      return;
    }
    previewOverride.value = parsed as Record<string, unknown>;
    previewNonce.value += 1;
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : "JSON 解析失败";
  }
}

function refreshPreview() {
  previewNonce.value += 1;
}

async function regenerateIntegrity() {
  const current = activeComponent.value;
  if (!current) return;
  if ((current.runtime ?? "sandbox") === "remote") {
    const source = String(current.source ?? "").trim();
    if (!/^https:\/\//.test(source) || !source.includes("{version}")) {
      ElMessage.error("远程组件 source 必须是 https:// 且包含 {version} 占位");
      return;
    }
    const url = source.replaceAll("{version}", encodeURIComponent(String(current.version)));
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) {
        ElMessage.error(`下载远程模块失败（HTTP ${response.status}）`);
        return;
      }
      current.integrity = await integrityOfBytes(await response.arrayBuffer());
      ElMessage.success("已根据远程模块真实内容生成 SRI");
    } catch (cause) {
      ElMessage.error(`下载远程模块失败：${errorMessage(cause)}`);
    }
    return;
  }
  const payload = `${current["x-previewHtml"] ?? ""}\n${current["x-previewScript"] ?? ""}`;
  current.integrity = await sha384Integrity(payload);
  ElMessage.success("已根据内联预览内容生成 SRI");
}

function openJson() {
  jsonText.value = prettyJson(components.value);
  jsonError.value = "";
  jsonOpen.value = true;
}

function applyJson() {
  jsonError.value = "";
  try {
    const parsed = JSON.parse(jsonText.value);
    if (!Array.isArray(parsed)) {
      jsonError.value = "组件注册表必须是数组";
      return;
    }
    components.value = (parsed as ComponentDef[]).map(normalizeComponent);
    jsonOpen.value = false;
    activeId.value = components.value[0]?.id ?? null;
    ElMessage.success("已应用组件注册表");
  } catch (error) {
    jsonError.value = error instanceof Error ? error.message : "JSON 解析失败";
  }
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(prettyJson(components.value));
    ElMessage.success("已复制组件注册表");
  } catch {
    ElMessage.warning("浏览器拒绝访问剪贴板");
  }
}

function validateAll() {
  issuesOpen.value = true;
  stageTab.value = "issues";
}

function goBack() {
  router.push(`/apps/${appId.value}`);
}

onMounted(load);
</script>
<template>
  <div v-loading="loading" class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <button class="mb-2 flex items-center gap-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-700" @click="goBack">
          ← 应用详情
        </button>
        <h1 class="text-[22px] font-semibold tracking-tight text-slate-900">自定义组件</h1>
        <p class="mt-1 text-[12.5px] text-slate-500">
          统一契约 + iframe 沙箱。保存草稿后自动进入页面设计器物料面板，发布时随 Bundle 一起版本化。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="dirty" class="rounded-full bg-amber-50 px-2 py-1 text-[10.5px] text-amber-600">未保存</span>
        <span v-else-if="draft" class="rounded-full bg-slate-100 px-2 py-1 text-[10.5px] text-slate-500">r{{ draft.revision }}</span>
        <el-button @click="openJson">注册表 JSON</el-button>
        <el-button @click="validateAll">
          校验
          <span v-if="errorCount" class="ml-1 text-rose-500">{{ errorCount }}</span>
          <span v-else-if="warningCount" class="ml-1 text-amber-500">{{ warningCount }}</span>
        </el-button>
        <el-button :loading="reloading" @click="reloadDraft">重新加载</el-button>
        <el-button :loading="saving" @click="saveDraft()">保存草稿</el-button>
        <el-button type="primary" @click="openPublish">发布</el-button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10.5px] uppercase tracking-wide text-slate-400">组件总数</p>
        <p class="mt-1 text-[20px] font-semibold text-slate-900">{{ stats.total }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10.5px] uppercase tracking-wide text-slate-400">沙箱运行时</p>
        <p class="mt-1 text-[20px] font-semibold text-indigo-600">{{ stats.sandboxed }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10.5px] uppercase tracking-wide text-slate-400">远程模块</p>
        <p class="mt-1 text-[20px] font-semibold text-slate-900">{{ stats.remote }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10.5px] uppercase tracking-wide text-slate-400">属性定义</p>
        <p class="mt-1 text-[20px] font-semibold text-slate-900">{{ stats.props }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-[10.5px] uppercase tracking-wide text-slate-400">校验</p>
        <p class="mt-1 text-[20px] font-semibold" :class="errorCount ? 'text-rose-600' : warningCount ? 'text-amber-600' : 'text-emerald-600'">
          {{ errorCount ? `${errorCount} 错误` : warningCount ? `${warningCount} 警告` : "通过" }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[264px_minmax(0,1fr)_390px]">
      <aside class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 p-3">
          <el-input v-model="query" size="small" placeholder="搜索组件名 / 标题" clearable />
          <div class="mt-2 grid grid-cols-2 gap-2">
            <el-button size="small" @click="openCreate">空白组件</el-button>
            <el-dropdown trigger="click" class="w-full">
              <el-button size="small" type="primary" class="w-full">预设</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="preset in COMPONENT_PRESETS" :key="preset.key" @click="addPreset(preset.key)">
                    {{ preset.icon }} {{ preset.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="max-h-[560px] overflow-auto p-2">
          <div v-for="group in groups" :key="group.label" class="mb-2">
            <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{{ group.label }}</p>
            <button
              v-for="component in group.items.filter((item) => !query || item.name.includes(query) || textOf(item.title).includes(query))"
              :key="component.id"
              class="mb-1 flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition"
              :class="activeId === component.id ? 'border-indigo-200 bg-indigo-50/70' : 'border-transparent hover:bg-slate-50'"
              @click="selectComponent(component)"
            >
              <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-900/90 text-[10px] text-white">
                {{ textOf(component.title).slice(0, 1) || "C" }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12.5px] font-medium text-slate-800">{{ textOf(component.title) || component.name }}</span>
                <span class="block truncate font-mono text-[9.5px] text-slate-400">{{ component.name }}</span>
              </span>
              <span class="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] text-slate-500">{{ componentKindLabel(component.kind) }}</span>
            </button>
          </div>
          <div v-if="!components.length" class="px-3 py-10 text-center">
            <p class="text-[12px] text-slate-400">还没有自定义组件</p>
            <p class="mt-1 text-[10.5px] text-slate-400">从预设开始最快</p>
          </div>
        </div>
      </aside>

      <section class="rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div class="flex items-center gap-1">
            <button
              v-for="tab in stageTabs"
              :key="tab.key"
              class="rounded-md px-2.5 py-1 text-[12px] transition"
              :class="stageTab === tab.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'"
              @click="stageTab = tab.key"
            >
              {{ tab.label }}
              <span v-if="tab.key === 'issues' && activeIssues.length" class="ml-1 text-[9.5px] opacity-80">{{ activeIssues.length }}</span>
            </button>
          </div>
          <div v-if="stageTab === 'preview'" class="flex items-center gap-2">
            <el-select v-model="stageWidth" size="small" style="width: 92px">
              <el-option label="自适应" value="full" />
              <el-option label="720" value="720" />
              <el-option label="420" value="420" />
            </el-select>
            <el-switch v-model="previewInteractive" size="small" active-text="交互" />
            <el-button size="small" @click="refreshPreview">刷新</el-button>
          </div>
        </div>
        <div v-if="!activeComponent" class="flex h-[520px] flex-col items-center justify-center text-center">
          <p class="text-[13px] font-medium text-slate-600">选择或创建一个组件</p>
          <p class="mt-1 max-w-[320px] text-[11.5px] leading-relaxed text-slate-400">
            组件契约包含属性、插槽、事件、能力与沙箱策略。设计器通过 iframe srcdoc 隔离渲染。
          </p>
        </div>

        <div v-else class="p-4">
          <template v-if="stageTab === 'preview'">
            <div class="mx-auto transition-all" :style="{ width: stageFrameWidth, maxWidth: '100%' }">
              <SandboxFrame
                :key="`${activeComponent.id}-${previewNonce}-${previewInteractive}`"
                :component="activeComponent"
                :override-props="previewOverride"
                :interactive="previewInteractive"
                :min-height="120"
                :max-height="620"
                :title="`${textOf(activeComponent.title)} 预览`"
                @error="previewError = $event"
              />
            </div>
            <p v-if="previewError" class="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-600">{{ previewError }}</p>

            <div class="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3 text-[11.5px] lg:grid-cols-3">
              <div><span class="text-slate-400">组件名</span><p class="font-mono text-slate-700">{{ activeComponent.name }}</p></div>
              <div><span class="text-slate-400">类型</span><p class="text-slate-700">{{ componentKindLabel(activeComponent.kind) }}</p></div>
              <div><span class="text-slate-400">运行时</span><p class="text-slate-700">{{ componentRuntimeLabel(activeComponent.runtime) }}</p></div>
              <div><span class="text-slate-400">属性 / 插槽 / 事件</span><p class="text-slate-700">{{ activeComponent.props?.length ?? 0 }} / {{ activeComponent.slots?.length ?? 0 }} / {{ activeComponent.events?.length ?? 0 }}</p></div>
              <div><span class="text-slate-400">容器</span><p class="text-slate-700">{{ activeComponent.container ? "是" : "否" }}</p></div>
              <div><span class="text-slate-400">版本</span><p class="text-slate-700">v{{ activeComponent.version }}</p></div>
            </div>

            <div class="mt-3 rounded-xl border border-slate-200 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[11.5px] font-medium text-slate-600">预览属性覆盖（JSON）</span>
                <el-button size="small" text @click="applyPreviewProps">应用</el-button>
              </div>
              <el-input v-model="previewOverrideText" type="textarea" :rows="3" spellcheck="false" placeholder='{ "title": "覆盖后的标题" }' />
            </div>
          </template>

          <template v-else-if="stageTab === 'contract'">
            <pre class="max-h-[640px] overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-200">{{ prettyJson(activeComponent) }}</pre>
          </template>

          <template v-else>
            <div v-if="!activeIssues.length" class="rounded-xl bg-emerald-50 px-4 py-6 text-center text-[12px] text-emerald-700">
              当前组件校验通过
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="(issue, index) in activeIssues"
                :key="index"
                class="rounded-lg border px-3 py-2 text-[11.5px]"
                :class="issue.level === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50 text-amber-700'"
              >
                <span class="mr-2 text-[9.5px] uppercase">{{ issue.level }}</span>
                <span class="font-mono text-[10px] opacity-70">{{ issue.where }}</span>
                <p class="mt-0.5">{{ issue.message }}</p>
              </div>
            </div>
          </template>
        </div>
      </section>

      <aside class="rounded-xl border border-slate-200 bg-white">
        <div class="flex flex-wrap gap-1 border-b border-slate-100 p-2">
          <button
            v-for="tab in editorTabs"
            :key="tab.key"
            class="rounded-md px-2 py-1 text-[11.5px] transition"
            :class="editorTab === tab.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'"
            @click="editorTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="!activeComponent" class="px-4 py-12 text-center text-[11.5px] text-slate-400">
          选择组件后编辑契约
        </div>

        <div v-else class="max-h-[720px] space-y-4 overflow-auto p-3">
          <template v-if="editorTab === 'basic'">
            <div class="grid grid-cols-2 gap-2">
              <el-button size="small" @click="duplicateComponent">复制组件</el-button>
              <el-button size="small" type="danger" plain @click="removeComponent">删除组件</el-button>
            </div>

            <el-form label-position="top" size="small">
              <el-form-item label="组件名（kebab-case）">
                <el-input :model-value="activeComponent.name" disabled />
                <p class="mt-1 text-[10px] leading-relaxed text-slate-400">
                  组件名是稳定标识，创建后不可修改；需要新名字请先复制组件。
                </p>
              </el-form-item>
              <el-form-item label="标题">
                <el-input :model-value="textOf(activeComponent.title)" @update:model-value="setActiveString('title', $event)" />
              </el-form-item>
              <el-form-item label="说明">
                <el-input :model-value="activeComponent.description ?? ''" type="textarea" :rows="2" @update:model-value="setActiveString('description', $event)" />
              </el-form-item>
              <div class="grid grid-cols-2 gap-2">
                <el-form-item label="类型">
                  <el-select :model-value="activeComponent.kind" @update:model-value="patchActive({ kind: $event })">
                    <el-option v-for="kind in COMPONENT_KINDS" :key="kind.value" :label="kind.label" :value="kind.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="分组">
                  <el-select :model-value="activeComponent.group ?? '业务组件'" allow-create filterable @update:model-value="setActiveString('group', $event)">
                    <el-option v-for="item in ['布局', '容器', '数据', '表单', '展示', '操作', '图表', '业务组件']" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="运行时">
                <el-select :model-value="activeComponent.runtime ?? 'sandbox'" @update:model-value="setRuntime">
                  <el-option v-for="runtime in COMPONENT_RUNTIMES" :key="runtime.value" :label="`${runtime.label} · ${runtime.hint}`" :value="runtime.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="来源 source">
                <el-input :model-value="activeComponent.source ?? ''" placeholder="inline://name 或 https://cdn/module-{version}.js" @update:model-value="setActiveString('source', $event)" />
              </el-form-item>
              <el-form-item label="完整性 integrity（SRI）">
                <div class="flex w-full gap-2">
                  <el-input :model-value="activeComponent.integrity ?? ''" placeholder="sha384-..." @update:model-value="setActiveString('integrity', $event)" />
                  <el-button size="small" @click="regenerateIntegrity">生成</el-button>
                </div>
              </el-form-item>
              <el-form-item label="语义意图（供 AI 使用）">
                <el-input :model-value="String(activeComponent.semantic?.intent ?? '')" placeholder="例如：展示审批单的关键指标" @update:model-value="setSemanticIntent" />
              </el-form-item>
            </el-form>

            <div class="rounded-lg border border-slate-200 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[11.5px] font-medium text-slate-600">容器能力</span>
                <el-switch :model-value="!!activeComponent.container" size="small" @update:model-value="patchActive({ container: $event })" />
              </div>
              <template v-if="activeComponent.container">
                <p class="mb-1 text-[10.5px] text-slate-400">允许的子组件类型</p>
                <el-input :model-value="(activeComponent.acceptChildren ?? []).join(', ')" placeholder="field, display, action" @update:model-value="setAcceptChildren" />
                <p class="mb-1 mt-2 text-[10.5px] text-slate-400">可放置于（父类型，留空不限制）</p>
                <el-input :model-value="(activeComponent.canBeChildOf ?? []).join(', ')" placeholder="container, layout" @update:model-value="setCanBeChildOf" />
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p class="mb-1 text-[10.5px] text-slate-400">最少子节点</p>
                    <el-input-number :model-value="activeComponent.minChildren ?? 0" :min="0" size="small" class="!w-full" @update:model-value="patchActive({ minChildren: $event ?? 0 })" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] text-slate-400">最多子节点</p>
                    <el-input-number :model-value="activeComponent.maxChildren ?? 0" :min="0" size="small" class="!w-full" @update:model-value="patchActive({ maxChildren: $event ?? 0 })" />
                  </div>
                </div>
              </template>
            </div>

            <div class="rounded-lg border border-slate-200 p-3">
              <p class="mb-2 text-[11.5px] font-medium text-slate-600">能力开关</p>
              <div class="space-y-1.5">
                <label v-for="item in capabilityKeys" :key="item.key" class="flex cursor-pointer items-start justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50">
                  <span>
                    <span class="block text-[11.5px] text-slate-700">{{ item.label }}</span>
                    <span class="block text-[9.5px] text-slate-400">{{ item.hint }}</span>
                  </span>
                  <el-switch :model-value="!!activeComponent.capabilities?.[item.key]" size="small" @update:model-value="toggleCapability(item.key, $event)" />
                </label>
              </div>
            </div>
          </template>
          <template v-else-if="editorTab === 'props'">
            <div class="flex items-center justify-between">
              <span class="text-[11.5px] font-medium text-slate-600">属性契约（{{ activeComponent.props?.length ?? 0 }}）</span>
              <el-button size="small" @click="addProp">新增属性</el-button>
            </div>
            <div v-for="(prop, index) in activeComponent.props ?? []" :key="index" class="rounded-lg border border-slate-200 p-2.5">
              <div class="mb-2 flex items-center justify-between">
                <span class="font-mono text-[10.5px] text-slate-500">props[{{ index }}]</span>
                <el-button size="small" text type="danger" @click="removeProp(index)">删除</el-button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <el-input v-model="prop.key" size="small" placeholder="key" />
                <el-input :model-value="textOf(prop.label)" size="small" placeholder="label" @update:model-value="prop.label = $event" />
                <el-select v-model="prop.type" size="small" filterable allow-create>
                  <el-option v-for="type in PROP_TYPES" :key="type" :label="type" :value="type" />
                </el-select>
                <el-input v-model="prop.description" size="small" placeholder="说明" />
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <el-checkbox v-model="prop.required">必填</el-checkbox>
                <el-checkbox v-model="prop.bindable">可绑定</el-checkbox>
                <el-checkbox v-model="prop.advanced">高级</el-checkbox>
              </div>
              <div class="mt-2">
                <p class="mb-1 text-[10px] text-slate-400">默认值</p>
                <el-input :model-value="propDefault(prop)" size="small" placeholder="留空表示无默认值" @update:model-value="setPropDefault(prop, $event)" />
              </div>
              <div v-if="prop.type === 'enum'" class="mt-2">
                <p class="mb-1 text-[10px] text-slate-400">枚举值（逗号分隔）</p>
                <el-input :model-value="propEnumText(prop)" size="small" @update:model-value="setPropEnum(prop, $event)" />
              </div>
            </div>
            <p v-if="!activeComponent.props?.length" class="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-[11px] text-slate-400">
              暂无属性，先新增一个
            </p>
            <p class="text-[10.5px] leading-relaxed text-slate-400">
              常用类型：{{ DEFAULT_PROP_TYPES.join(" / ") }}；业务类型：entityRef / dataSourceRef / fieldList / optionList。
            </p>
          </template>

          <template v-else-if="editorTab === 'io'">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[11.5px] font-medium text-slate-600">插槽（{{ activeComponent.slots?.length ?? 0 }}）</span>
                <el-button size="small" @click="addSlot">新增插槽</el-button>
              </div>
              <div v-for="(slot, index) in activeComponent.slots ?? []" :key="index" class="mb-2 rounded-lg border border-slate-200 p-2.5">
                <div class="grid grid-cols-2 gap-2">
                  <el-input v-model="slot.name" size="small" placeholder="插槽名" />
                  <el-input :model-value="textOf(slot.label)" size="small" placeholder="显示名" @update:model-value="slot.label = $event" />
                </div>
                <div class="mt-2 flex items-center justify-between">
                  <el-checkbox v-model="slot.multiple" size="small">允许多个子节点</el-checkbox>
                  <el-button size="small" text type="danger" @click="removeSlot(index)">删除</el-button>
                </div>
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[11.5px] font-medium text-slate-600">事件（{{ activeComponent.events?.length ?? 0 }}）</span>
                <el-button size="small" @click="addEvent">新增事件</el-button>
              </div>
              <div v-for="(event, index) in activeComponent.events ?? []" :key="index" class="mb-2 rounded-lg border border-slate-200 p-2.5">
                <div class="grid grid-cols-2 gap-2">
                  <el-input v-model="event.name" size="small" placeholder="事件名" />
                  <el-input :model-value="textOf(event.label)" size="small" placeholder="显示名" @update:model-value="event.label = $event" />
                </div>
                <div class="mt-1 text-right">
                  <el-button size="small" text type="danger" @click="removeEvent(index)">删除</el-button>
                </div>
              </div>
            </div>

            <div class="rounded-lg bg-slate-50 p-3 text-[10.5px] leading-relaxed text-slate-500">
              沙箱内通过 parent.postMessage({ source: 'metaforge-sandbox', type: 'event', name, payload }) 触发事件；
              画布内通过 data-mf-event="事件名" 自动绑定点击事件。
            </div>
          </template>

          <template v-else-if="editorTab === 'sandbox'">
            <div class="space-y-1.5 rounded-lg border border-slate-200 p-3">
              <label v-for="item in sandboxKeys" :key="item.key" class="flex cursor-pointer items-start justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50">
                <span>
                  <span class="block text-[11.5px] text-slate-700">{{ item.label }}</span>
                  <span class="block text-[9.5px] text-slate-400">{{ item.hint }}</span>
                </span>
                <el-switch :model-value="!!activeComponent.sandbox?.[item.key]" size="small" @update:model-value="toggleSandbox(item.key, $event)" />
              </label>
            </div>

            <div>
              <p class="mb-1 text-[10.5px] text-slate-400">允许的主机（空白分隔）</p>
              <el-input :model-value="(activeComponent.sandbox?.allowedHosts ?? []).join(' ')" placeholder="api.example.com" @update:model-value="setSandboxList('allowedHosts', $event)" />
            </div>
            <div>
              <p class="mb-1 text-[10.5px] text-slate-400">允许的模块</p>
              <el-input :model-value="(activeComponent.sandbox?.allowedModules ?? []).join(' ')" placeholder="lodash dayjs" @update:model-value="setSandboxList('allowedModules', $event)" />
            </div>
            <div>
              <p class="mb-1 text-[10.5px] text-slate-400">内存上限（MB）</p>
              <el-input-number :model-value="activeComponent.sandbox?.memoryLimitMb ?? 64" :min="8" :max="512" :step="8" size="small" class="!w-full" @update:model-value="setMemoryLimit" />
            </div>

            <div class="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-[10.5px] leading-relaxed text-indigo-700">
              设计器实际使用 iframe srcdoc + sandbox="allow-scripts"：不授予 same-origin，默认 default-src 'none'，
              禁止外链脚本与表单提交。策略字段是运行时声明，由发布端渲染器统一执行。
            </div>
            <div class="rounded-lg border border-slate-200 p-3 text-[10.5px] text-slate-500">
              <p>source：<span class="font-mono">{{ activeComponent.source || '—' }}</span></p>
              <p class="mt-1 break-all">integrity：<span class="font-mono">{{ activeComponent.integrity || '—' }}</span></p>
              <p class="mt-1">remote 运行时必须使用 https://、包含 {version} 占位并提供 SRI；发布后按锁定版本加载。</p>
            </div>
          </template>

          <template v-else>
            <div>
              <p class="mb-1 text-[11px] font-medium text-slate-600">x-previewHtml</p>
              <el-input v-model="activeComponent['x-previewHtml']" type="textarea" :rows="10" spellcheck="false" class="font-mono" />
            </div>
            <div>
              <p class="mb-1 text-[11px] font-medium text-slate-600">x-previewScript</p>
              <el-input v-model="activeComponent['x-previewScript']" type="textarea" :rows="8" spellcheck="false" class="font-mono" />
            </div>
            <div class="rounded-lg bg-slate-50 p-3 text-[10.5px] leading-relaxed text-slate-500">
              可用变量：root、props、emit(name, payload)。这两个字段是契约扩展键，随 Bundle 版本化；
              仅在设计器沙箱内执行，不会进入主应用。
            </div>
            <el-button size="small" class="w-full" @click="regenerateIntegrity">根据预览内容生成 integrity</el-button>
          </template>
        </div>
      </aside>
    </div>

    <div v-if="app" class="flex flex-wrap items-center gap-3 text-[10.5px] text-slate-400">
      <span>应用：{{ app.name }}</span>
      <span>草稿：r{{ app.draft_revision }}</span>
      <span>更新人：{{ draft?.updated_by || "—" }}</span>
      <span>更新时间：{{ formatDateTime(draft?.updated_at) }}</span>
      <span>协议：{{ bundle?.protocolVersion ?? "0.1" }}</span>
    </div>

    <el-dialog v-model="jsonOpen" title="组件注册表 JSON" width="760px">
      <p class="mb-2 text-[11.5px] text-slate-500">整表替换当前草稿中的 artifacts.components。</p>
      <el-input v-model="jsonText" type="textarea" :rows="20" spellcheck="false" class="font-mono" />
      <p v-if="jsonError" class="mt-2 text-[11.5px] text-rose-600">{{ jsonError }}</p>
      <template #footer>
        <el-button @click="copyJson">复制</el-button>
        <el-button @click="jsonOpen = false">取消</el-button>
        <el-button type="primary" @click="applyJson">应用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="issuesOpen" title="组件校验" width="720px">
      <div v-if="!issues.length" class="rounded-xl bg-emerald-50 px-4 py-6 text-center text-[12px] text-emerald-700">
        全部组件校验通过
      </div>
      <div v-else class="max-h-[420px] space-y-2 overflow-auto">
        <div
          v-for="(issue, index) in issues"
          :key="index"
          class="rounded-lg border px-3 py-2 text-[11.5px]"
          :class="issue.level === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50 text-amber-700'"
        >
          <span class="mr-2 text-[9.5px] uppercase">{{ issue.level }}</span>
          <span class="font-mono text-[10px] opacity-70">{{ issue.where }}</span>
          <p class="mt-0.5">{{ issue.message }}</p>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="issuesOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createOpen" title="新建空白组件" width="440px">
      <el-form label-position="top">
        <el-form-item label="组件名">
          <el-input v-model="createForm.name" placeholder="my-component" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="createForm.title" placeholder="自定义组件" />
        </el-form-item>
        <div class="grid grid-cols-2 gap-2">
          <el-form-item label="类型">
            <el-select v-model="createForm.kind">
              <el-option v-for="kind in COMPONENT_KINDS" :key="kind.value" :label="kind.label" :value="kind.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="分组">
            <el-input v-model="createForm.group" />
          </el-form-item>
        </div>
      </el-form>
      <p v-if="createError" class="text-[11.5px] text-rose-600">{{ createError }}</p>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="publishOpen" title="发布组件版本" width="480px">
      <p class="mb-3 text-[11.5px] leading-relaxed text-slate-500">
        发布后会生成新的应用版本，组件注册表随 Bundle 一起快照；可随时回滚到历史版本。
      </p>
      <el-form label-position="top">
        <el-form-item label="发布说明">
          <el-input v-model="publishMessage" type="textarea" :rows="3" placeholder="例如：新增业务卡片与上传字段组件" />
        </el-form-item>
        <el-checkbox v-model="publishForce">跳过非阻断警告</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="publishOpen = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>
