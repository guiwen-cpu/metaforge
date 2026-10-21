<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { connectionsApi } from "@/api/connections";
import { platformApi } from "@/api/platform";
import { aiApi, type AiGenerateResult } from "@/api/ai";
import { ApiError, errorMessage } from "@/lib/http";
import { formatDateTime, prettyJson } from "@/lib/format";
import { CodeRuntime, type CodeRuntimeEvent } from "@/lib/codeSandbox";
import { invokeCodeHook } from "@/lib/codeHook";
import { canPreviewCodeStep, codeStepContext, codeStepHook, codeStepInput } from "@/lib/logicPreview";
import JsonField from "@/components/logic/JsonField.vue";
import StepList from "@/components/logic/StepList.vue";
import {
  RULE_KINDS,
  STEP_GROUPS,
  STEP_TYPES,
  TRIGGERS,
  allStepsOfAction,
  cloneJson,
  createAction,
  createApi,
  createDefaultLogic,
  createFlow,
  createRule,
  exprText,
  findStepById,
  logicStats,
  newStep,
  normalizeLogicSchema,
  regenerateStepIds,
  ruleKindLabel,
  stepDef,
  stepLabel,
  stepSummary,
  triggerLabel,
  uniqueKey,
  validateLogic
} from "@/lib/logicModel";
import type {
  ActionParam,
  ActionWriteback,
  LogicAction,
  LogicApi,
  LogicFlow,
  LogicRule,
  LogicSchema,
  LogicStep,
  LogicStepType,
  LogicTab
} from "@/types/logicModel";
import type { AppBundle, AppView, DraftView } from "@/types/platform";
import type { ConnectionView } from "@/types/connection";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const appId = computed(() => String(route.params.appId));
const app = ref<AppView | null>(null);
const draft = ref<DraftView | null>(null);
const bundle = ref<AppBundle | null>(null);
const logicSchemas = ref<LogicSchema[]>([]);
const logic = ref<LogicSchema | null>(null);
const connections = ref<ConnectionView[]>([]);
const savedSnapshot = ref("");
const loading = ref(true);
const saving = ref(false);
const reloading = ref(false);

const activeTab = ref<LogicTab>("actions");
const query = ref("");
const selectedActionId = ref<string | null>(null);
const selectedStepId = ref<string | null>(null);
const selectedApiId = ref<string | null>(null);
const selectedFlowId = ref<string | null>(null);
const selectedRuleId = ref<string | null>(null);

const addStepOpen = ref(false);
const addStepQuery = ref("");
const addStepTarget = ref<LogicStep[] | null>(null);

const jsonOpen = ref(false);
const stepJsonOpen = ref(false);
const stepJsonText = ref("");
const stepJsonError = ref("");

const codeRuntime = new CodeRuntime();
const codeRunning = ref(false);
const codeLogs = ref<string[]>([]);
const codeEvents = ref<CodeRuntimeEvent[]>([]);
const codeOutput = ref("");
const codeError = ref("");
const codeElapsed = ref<number | null>(null);

const issuesOpen = ref(false);
const publishOpen = ref(false);
const publishing = ref(false);
const publishMessage = ref("");
const publishForce = ref(false);

const aiOpen = ref(false);
const aiRunning = ref(false);
const aiError = ref("");
const aiResult = ref<AiGenerateResult | null>(null);
const aiForm = reactive({
  entityKey: "",
  prompt: ""
});
const aiFlowPreview = computed(() => (aiResult.value ? (aiResult.value.artifact as LogicFlow) : null));

const tabMeta: Array<{ key: LogicTab; label: string; icon: string; hint: string }> = [
  { key: "actions", label: "动作", icon: "▷", hint: "可执行的业务动作与步骤编排" },
  { key: "apis", label: "API", icon: "⇄", hint: "接口契约、请求前与响应后编排" },
  { key: "flows", label: "流程", icon: "◇", hint: "Flowable 流程、表单与监听器" },
  { key: "rules", label: "规则", icon: "✓", hint: "实体级校验、派生与守卫规则" }
];

const dataSchemas = computed<Array<Record<string, unknown>>>(() => {
  const raw = bundle.value?.artifacts?.dataSchemas;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
});

const entityOptions = computed(() => {
  const result: Array<{ label: string; value: string }> = [];
  for (const schema of dataSchemas.value) {
    const entities = Array.isArray(schema.entities) ? (schema.entities as Array<Record<string, unknown>>) : [];
    for (const entity of entities) {
      result.push({
        label: `${displayText(schema.name) || "数据模型"} / ${displayText(entity.name) || displayText(entity.key)}`,
        value: String(entity.key ?? "")
      });
    }
  }
  return result;
});

const pageOptions = computed(() => {
  const raw = bundle.value?.artifacts?.uiSchemas;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const page = item as Record<string, unknown>;
    return { label: `${displayText(page.title) || displayText(page.key)} · ${String(page.route && (page.route as Record<string, unknown>).path || "")}`, value: String(page.key ?? "") };
  });
});

const assetOptions = computed(() => {
  const raw = bundle.value?.assets;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const asset = item as Record<string, unknown>;
    return { label: `${displayText(asset.name) || displayText(asset.key)}${asset.kind ? ` · ${asset.kind}` : ""}`, value: String(asset.key ?? asset.id ?? "") };
  });
});

const stats = computed(() => (logic.value ? logicStats(logic.value) : { actions: 0, steps: 0, apis: 0, flows: 0, rules: 0 }));

const filteredActions = computed(() => filterItems(logic.value?.actions ?? [], (item) => `${item.key} ${item.name}`));
const filteredApis = computed(() => filterItems(logic.value?.apis ?? [], (item) => `${item.key} ${item.name} ${item.method} ${item.path}`));
const filteredFlows = computed(() => filterItems(logic.value?.flows ?? [], (item) => `${item.key} ${item.name} ${item.processKey}`));
const filteredRules = computed(() => filterItems(logic.value?.rules ?? [], (item) => `${item.key} ${item.name} ${item.kind}`));

const selectedAction = computed<LogicAction | null>(() => logic.value?.actions.find((item) => item.id === selectedActionId.value) ?? null);
const selectedApi = computed<LogicApi | null>(() => logic.value?.apis.find((item) => item.id === selectedApiId.value) ?? null);
const connectionOptions = computed(() =>
  connections.value.filter((item) => item.enabled).map((item) => ({
    value: item.key,
    label: `${item.name} · ${item.key}`,
    connection: item
  }))
);
const selectedApiConnection = computed(() =>
  selectedApi.value ? connectionFor(selectedApi.value) : null
);
const selectedFlow = computed<LogicFlow | null>(() => logic.value?.flows.find((item) => item.id === selectedFlowId.value) ?? null);
const selectedRule = computed<LogicRule | null>(() => logic.value?.rules.find((item) => item.id === selectedRuleId.value) ?? null);

const selectedStep = computed<LogicStep | null>(() => {
  if (!selectedStepId.value) return null;
  if (selectedAction.value) {
    const found = findStepById(selectedAction.value.steps, selectedStepId.value);
    if (found) return found;
  }
  if (selectedRule.value) {
    const found = findStepById(selectedRule.value.then, selectedStepId.value);
    if (found) return found;
  }
  if (selectedApi.value) {
    const before = findStepById(selectedApi.value.before ?? [], selectedStepId.value);
    if (before) return before;
    return findStepById(selectedApi.value.after ?? [], selectedStepId.value);
  }
  return null;
});

const selectedStepDef = computed(() => (selectedStep.value ? stepDef(selectedStep.value.type) : null));
const canRunCodeStep = computed(() => canPreviewCodeStep(selectedStep.value));
const activeSteps = computed<LogicStep[]>(() => {
  if (activeTab.value === "actions") return selectedAction.value?.steps ?? [];
  if (activeTab.value === "rules") return selectedRule.value?.then ?? [];
  return [];
});

const issues = computed(() =>
  logic.value
    ? validateLogic(
        logic.value,
        pageOptions.value.map((item) => item.value),
        assetOptions.value.map((item) => item.value),
        entityOptions.value.map((item) => item.value)
      )
    : []
);
const errorCount = computed(() => issues.value.filter((item) => item.level === "error").length);
const warningCount = computed(() => issues.value.filter((item) => item.level === "warning").length);
const dirty = computed(() => JSON.stringify(logic.value) !== savedSnapshot.value);

const addStepGroups = computed(() => {
  const keyword = addStepQuery.value.trim().toLowerCase();
  return STEP_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter(
      (item) =>
        !keyword ||
        item.label.toLowerCase().includes(keyword) ||
        item.type.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
    )
  })).filter((group) => group.items.length);
});

const branchCases = computed<Array<Record<string, unknown>>>(() => {
  if (!selectedStep.value || selectedStep.value.type !== "branch") return [];
  return Array.isArray(selectedStep.value.cases) ? (selectedStep.value.cases as Array<Record<string, unknown>>) : [];
});

function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.default === "string") return record.default;
  }
  return "";
}

function filterItems<T>(items: T[], text: (item: T) => string): T[] {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return items;
  return items.filter((item) => text(item).toLowerCase().includes(keyword));
}

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
    artifacts: { dataSchemas: [], uiSchemas: [], logicSchemas: [] }
  } as AppBundle;
}

function applyDraft(next: DraftView, preserve = true) {
  draft.value = next;
  bundle.value = next.bundle ?? bundle.value ?? defaultBundle();
  if (!bundle.value.artifacts) bundle.value.artifacts = {};
  const raw = bundle.value.artifacts.logicSchemas;
  const list = Array.isArray(raw)
    ? (cloneJson(raw) as LogicSchema[]).map((item) => normalizeLogicSchema(item))
    : [];
  if (!list.length) {
    const created = createDefaultLogic(app.value?.key ?? "");
    list.push(created);
  }
  logicSchemas.value = list;
  logic.value = list[0] ?? null;
  if (logic.value && logic.value.key && !logic.value.name) logic.value.name = logic.value.key;
  savedSnapshot.value = JSON.stringify(logic.value);
  ensureSelection(preserve);
}

function ensureSelection(preserve: boolean) {
  const current = logic.value;
  if (!current) return;
  if (!preserve || !current.actions.some((item) => item.id === selectedActionId.value)) {
    selectedActionId.value = current.actions[0]?.id ?? null;
  }
  if (!preserve || !current.apis.some((item) => item.id === selectedApiId.value)) {
    selectedApiId.value = current.apis[0]?.id ?? null;
  }
  if (!preserve || !current.flows.some((item) => item.id === selectedFlowId.value)) {
    selectedFlowId.value = current.flows[0]?.id ?? null;
  }
  if (!preserve || !current.rules.some((item) => item.id === selectedRuleId.value)) {
    selectedRuleId.value = current.rules[0]?.id ?? null;
  }
  if (selectedStepId.value && !selectedStep.value) selectedStepId.value = null;
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

onMounted(() => {
  void load();
  void loadConnections();
});

watch(selectedStepId, clearCodePreview);
onBeforeUnmount(() => codeRuntime.dispose());

async function loadConnections() {
  try {
    connections.value = await connectionsApi.listConnections();
  } catch {
    connections.value = [];
  }
}

function connectionFor(api: LogicApi): ConnectionView | null {
  const key = api.connectionRef?.key ?? api.connectionRef?.id;
  if (!key) return null;
  return connections.value.find((item) => item.key === key || item.id === key) ?? null;
}

function connectionKeyOf(api: LogicApi): string {
  return String(api.connectionRef?.key ?? "");
}

function setApiConnection(api: LogicApi, key: string) {
  if (!key) {
    delete api.connectionRef;
    return;
  }
  api.connectionRef = { kind: "connection", key };
}

function apiBaseUrl(api: LogicApi): string {
  return String(api.baseUrl || connectionFor(api)?.base_url || "");
}

async function reloadDraft() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm("当前逻辑有未保存的修改，重新加载会丢弃这些修改。", "重新加载草稿", {
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
    ElMessage.success("逻辑草稿已重新加载");
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    reloading.value = false;
  }
}

async function handleConflict() {
  try {
    await ElMessageBox.confirm("草稿已被其他人修改。加载最新草稿会覆盖当前编辑内容。", "草稿冲突", {
      type: "warning",
      confirmButtonText: "加载最新草稿",
      cancelButtonText: "保留当前内容"
    });
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
  if (!draft.value || !logic.value) return false;
  saving.value = true;
  try {
    const nextBundle = cloneJson(bundle.value ?? defaultBundle());
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.logicSchemas = cloneJson(logicSchemas.value);
    const next = await platformApi.saveDraft(appId.value, nextBundle, draft.value.revision);
    applyDraft(next);
    app.value = await platformApi.getApp(appId.value);
    if (!silent) ElMessage.success(`逻辑已保存 · r${next.revision}`);
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
    ElMessage.warning("存在发布阻断错误，请先在「校验」中修复");
    issuesOpen.value = true;
    return;
  }
  publishMessage.value = publishMessage.value || "更新业务逻辑编排";
  publishOpen.value = true;
}

async function submitPublish() {
  if (!publishMessage.value.trim()) {
    ElMessage.warning("请填写发布说明");
    return;
  }
  publishing.value = true;
  try {
    const nextBundle = cloneJson(bundle.value ?? defaultBundle());
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.logicSchemas = cloneJson(logicSchemas.value);
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

function entityByKey(key: string): Record<string, unknown> | undefined {
  if (!key) return undefined;
  for (const schema of dataSchemas.value) {
    const entities = Array.isArray(schema.entities) ? (schema.entities as Array<Record<string, unknown>>) : [];
    const found = entities.find((entity) => entity.key === key);
    if (found) return found;
  }
  return undefined;
}

function assetKeyOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return String(record.key ?? record.assetId ?? "");
}

function openAiFlow() {
  aiForm.entityKey = entityOptions.value[0]?.value ?? "";
  aiForm.prompt = "";
  aiError.value = "";
  aiResult.value = null;
  aiOpen.value = true;
}

async function submitAiGenerate() {
  if (!aiForm.prompt.trim()) {
    aiError.value = "请先用一句话描述想要的审批流程";
    return;
  }
  aiRunning.value = true;
  aiError.value = "";
  aiResult.value = null;
  try {
    const entity = entityByKey(aiForm.entityKey);
    const payload = {
      kind: "flow" as const,
      prompt: aiForm.prompt.trim(),
      context: {
        dataSchemas: dataSchemas.value,
        entity: entity ?? {}
      }
    };
    aiResult.value = await aiApi.generate(
      aiForm.entityKey ? { ...payload, entity_key: aiForm.entityKey } : payload
    );
  } catch (error) {
    aiError.value = errorMessage(error);
  } finally {
    aiRunning.value = false;
  }
}

function applyAiFlow() {
  const current = logic.value;
  const candidate = aiFlowPreview.value;
  if (!current || !candidate) return;
  if (!candidate.key || !candidate.processKey) {
    aiError.value = "AI 产物缺少流程 key 或 processKey";
    return;
  }
  if (current.flows.some((flow) => flow.key === candidate.key)) {
    aiError.value = `流程 key ${candidate.key} 已存在，请调整提示词后重新生成`;
    return;
  }
  if (current.flows.some((flow) => flow.processKey === candidate.processKey)) {
    aiError.value = `processKey ${candidate.processKey} 已存在`;
    return;
  }
  if (current.flows.some((flow) => flow.id === candidate.id)) {
    aiError.value = "流程 id 与现有流程重复";
    return;
  }

  const assets = (Array.isArray(aiResult.value?.assets) ? aiResult.value?.assets : []) as Array<Record<string, unknown>>;
  const existingAssetKeys = new Set((bundle.value?.assets ?? []).map(assetKeyOf));
  const seenAssetKeys = new Set<string>();
  for (const asset of assets) {
    const key = assetKeyOf(asset);
    if (!key) {
      aiError.value = "AI 返回的资产缺少 key";
      return;
    }
    if (existingAssetKeys.has(key) || seenAssetKeys.has(key)) {
      aiError.value = `资产 key ${key} 已存在`;
      return;
    }
    seenAssetKeys.add(key);
  }
  const bpmnKey = String((candidate.bpmnRef as Record<string, unknown> | undefined)?.key ?? "");
  if (!bpmnKey || !seenAssetKeys.has(bpmnKey)) {
    aiError.value = "AI 产物引用的 BPMN 资产没有随结果返回";
    return;
  }

  const nextLogic = cloneJson(current);
  nextLogic.flows.push(candidate);
  const nextIssues = validateLogic(
    nextLogic,
    pageOptions.value.map((item) => item.value),
    [...assetOptions.value.map((item) => item.value), ...seenAssetKeys],
    entityOptions.value.map((item) => item.value)
  );
  const nextErrors = nextIssues.filter((issue) => issue.level === "error");
  if (nextErrors.length > errorCount.value) {
    const detail = nextErrors
      .slice(-3)
      .map((issue) => `${issue.where}：${issue.message}`)
      .join("；");
    aiError.value = `校验未通过，不能应用：${detail}`;
    return;
  }

  current.flows.push(candidate);
  if (bundle.value) {
    bundle.value.assets = [...(bundle.value.assets ?? []), ...cloneJson(assets)];
  }
  selectFlow(candidate);
  aiOpen.value = false;
  aiResult.value = null;
  ElMessage.success("AI 流程已应用到本地草稿，记得保存");
}

function goBack() {
  router.push(`/apps/${appId.value}`);
}
function tabCount(tab: LogicTab): number {
  if (tab === "actions") return stats.value.actions;
  if (tab === "apis") return stats.value.apis;
  if (tab === "flows") return stats.value.flows;
  return stats.value.rules;
}

function switchTab(tab: LogicTab) {
  activeTab.value = tab;
  selectedStepId.value = null;
}

function selectAction(action: LogicAction) {
  activeTab.value = "actions";
  selectedActionId.value = action.id;
  selectedStepId.value = null;
}

function selectApi(api: LogicApi) {
  activeTab.value = "apis";
  selectedApiId.value = api.id;
  selectedStepId.value = null;
}

function selectFlow(flow: LogicFlow) {
  activeTab.value = "flows";
  selectedFlowId.value = flow.id;
  selectedStepId.value = null;
}

function selectRule(rule: LogicRule) {
  activeTab.value = "rules";
  selectedRuleId.value = rule.id;
  selectedStepId.value = null;
}

function addCurrent() {
  const current = logic.value;
  if (!current) return;
  if (activeTab.value === "actions") {
    const item = createAction(current.actions.map((entry) => entry.key));
    current.actions.push(item);
    selectAction(item);
  } else if (activeTab.value === "apis") {
    const item = createApi(current.apis.map((entry) => entry.key));
    current.apis.push(item);
    selectApi(item);
  } else if (activeTab.value === "flows") {
    const item = createFlow(current.flows.map((entry) => entry.key));
    current.flows.push(item);
    selectFlow(item);
  } else {
    const item = createRule(current.rules.map((entry) => entry.key));
    current.rules.push(item);
    selectRule(item);
  }
}

function copyKey(existing: string[], base: string): string {
  return uniqueKey(existing, `${base}_copy`);
}

function duplicateCurrent() {
  const current = logic.value;
  if (!current) return;
  if (activeTab.value === "actions" && selectedAction.value) {
    const copy = cloneJson(selectedAction.value);
    copy.id = crypto.randomUUID();
    copy.key = copyKey(current.actions.map((item) => item.key), copy.key);
    copy.name = `${copy.name} 副本`;
    regenerateStepIds(copy.steps);
    current.actions.push(copy);
    selectAction(copy);
  } else if (activeTab.value === "apis" && selectedApi.value) {
    const copy = cloneJson(selectedApi.value);
    copy.id = crypto.randomUUID();
    copy.key = copyKey(current.apis.map((item) => item.key), copy.key);
    copy.name = `${copy.name} 副本`;
    if (Array.isArray(copy.before)) regenerateStepIds(copy.before);
    if (Array.isArray(copy.after)) regenerateStepIds(copy.after);
    current.apis.push(copy);
    selectApi(copy);
  } else if (activeTab.value === "flows" && selectedFlow.value) {
    const copy = cloneJson(selectedFlow.value);
    copy.id = crypto.randomUUID();
    copy.key = copyKey(current.flows.map((item) => item.key), copy.key);
    copy.name = `${copy.name} 副本`;
    copy.processKey = copy.key;
    current.flows.push(copy);
    selectFlow(copy);
  } else if (activeTab.value === "rules" && selectedRule.value) {
    const copy = cloneJson(selectedRule.value);
    copy.id = crypto.randomUUID();
    copy.key = copyKey(current.rules.map((item) => item.key), copy.key);
    copy.name = `${copy.name} 副本`;
    regenerateStepIds(copy.then);
    current.rules.push(copy);
    selectRule(copy);
  }
}

async function deleteCurrent() {
  const current = logic.value;
  if (!current) return;
  let list: Array<{ id: string; key: string; name: string }> = [];
  let label = "";
  if (activeTab.value === "actions") {
    list = current.actions;
    label = "动作";
  } else if (activeTab.value === "apis") {
    list = current.apis;
    label = "API";
  } else if (activeTab.value === "flows") {
    list = current.flows;
    label = "流程";
  } else {
    list = current.rules;
    label = "规则";
  }
  const target = list.find((item) => item.id === currentId());
  if (!target) return;
  try {
    await ElMessageBox.confirm(`确认删除${label}「${target.name || target.key}」？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  const index = list.findIndex((item) => item.id === target.id);
  list.splice(index, 1);
  selectedStepId.value = null;
  const next = list[index] ?? list[index - 1] ?? null;
  if (activeTab.value === "actions") selectedActionId.value = next?.id ?? null;
  if (activeTab.value === "apis") selectedApiId.value = next?.id ?? null;
  if (activeTab.value === "flows") selectedFlowId.value = next?.id ?? null;
  if (activeTab.value === "rules") selectedRuleId.value = next?.id ?? null;
}

function currentId(): string | null {
  if (activeTab.value === "actions") return selectedActionId.value;
  if (activeTab.value === "apis") return selectedApiId.value;
  if (activeTab.value === "flows") return selectedFlowId.value;
  return selectedRuleId.value;
}

function openAddStep(target: LogicStep[]) {
  addStepTarget.value = target;
  addStepQuery.value = "";
  addStepOpen.value = true;
}

function applyAddStep(type: string) {
  if (!addStepTarget.value) return;
  const item = newStep(type as LogicStepType);
  addStepTarget.value.push(item);
  selectedStepId.value = item.id;
  addStepOpen.value = false;
  addStepTarget.value = null;
}

function moveStep(steps: LogicStep[], index: number, delta: number) {
  const next = index + delta;
  if (next < 0 || next >= steps.length) return;
  const [item] = steps.splice(index, 1);
  steps.splice(next, 0, item);
}

function removeStep(steps: LogicStep[], id: string) {
  const index = steps.findIndex((item) => item.id === id);
  if (index < 0) return;
  steps.splice(index, 1);
  if (selectedStepId.value === id) selectedStepId.value = null;
}

function duplicateStep(steps: LogicStep[], id: string) {
  const index = steps.findIndex((item) => item.id === id);
  if (index < 0) return;
  const copy = cloneJson(steps[index]);
  regenerateStepIds([copy]);
  steps.splice(index + 1, 0, copy);
  selectedStepId.value = copy.id;
}

function fieldValue(step: LogicStep, key: string): unknown {
  return step[key];
}

function setField(step: LogicStep, key: string, value: unknown) {
  step[key] = value;
}

function clearCodePreview(): void {
  codeLogs.value = [];
  codeEvents.value = [];
  codeOutput.value = "";
  codeError.value = "";
  codeElapsed.value = null;
}

function emitCodeToast(event: CodeRuntimeEvent): void {
  if (event.name !== "ui.toast") return;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  ElMessage({
    type: (payload.type as "success" | "warning" | "info" | "error" | undefined) ?? "info",
    message: String(payload.message ?? "代码步骤事件"),
    duration: 2500
  });
}

async function runCodeStep(): Promise<void> {
  const step = selectedStep.value;
  if (!step || !canPreviewCodeStep(step) || codeRunning.value) return;
  const targetId = step.id;
  codeRunning.value = true;
  clearCodePreview();
  const started = performance.now();
  try {
    const result = await invokeCodeHook(codeRuntime, codeStepHook(step), {
      input: codeStepInput(step),
      context: codeStepContext(step, logic.value),
      onEvent: (event) => {
        codeEvents.value = [...codeEvents.value, event];
        emitCodeToast(event);
      }
    });
    if (selectedStep.value?.id !== targetId) return;
    codeLogs.value = result.logs;
    codeEvents.value = result.events;
    codeOutput.value = JSON.stringify(result.value ?? null, null, 2);
  } catch (cause) {
    if (selectedStep.value?.id !== targetId) return;
    const detail = cause as { logs?: string[]; events?: CodeRuntimeEvent[] };
    codeLogs.value = detail.logs ?? [];
    codeEvents.value = detail.events ?? [];
    codeError.value = errorMessage(cause);
  } finally {
    codeRunning.value = false;
    if (selectedStep.value?.id === targetId) {
      codeElapsed.value = Math.round(performance.now() - started);
    }
  }
}

function prettyCodeValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function refKeyOf(step: LogicStep, key: string): string {
  const value = step[key];
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" ? record.key : "";
}

function setRefField(step: LogicStep, key: string, kind: string, value: string) {
  if (!value) {
    step[key] = undefined;
    return;
  }
  step[key] = { kind, key: value, version: 1 };
}

function refOptions(kind: string): Array<{ label: string; value: string }> {
  const current = logic.value;
  if (!current) return [];
  if (kind === "api") return current.apis.map((item) => ({ label: `${item.key} · ${item.name}`, value: item.key }));
  if (kind === "action") return current.actions.map((item) => ({ label: `${item.key} · ${item.name}`, value: item.key }));
  if (kind === "flow") return current.flows.map((item) => ({ label: `${item.key} · ${item.name}`, value: item.key }));
  if (kind === "page") return pageOptions.value;
  if (kind === "asset") return assetOptions.value;
  if (kind === "entity") return entityOptions.value;
  return [];
}

function openStepJson() {
  if (!selectedStep.value) return;
  stepJsonText.value = prettyJson(selectedStep.value);
  stepJsonError.value = "";
  stepJsonOpen.value = true;
}

function applyStepJson() {
  const step = selectedStep.value;
  if (!step) return;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stepJsonText.value) as Record<string, unknown>;
  } catch {
    stepJsonError.value = "JSON 格式错误";
    return;
  }
  if (!parsed.id || !parsed.type) {
    stepJsonError.value = "节点必须包含 id 与 type";
    return;
  }
  for (const key of Object.keys(step)) delete step[key];
  Object.assign(step, parsed);
  selectedStepId.value = String(parsed.id);
  stepJsonOpen.value = false;
  ElMessage.success("步骤已更新");
}

function addBranchCase() {
  const step = selectedStep.value;
  if (!step) return;
  if (!Array.isArray(step.cases)) step.cases = [];
  (step.cases as Array<Record<string, unknown>>).push({
    name: `case${(step.cases as unknown[]).length + 1}`,
    when: { $lit: true },
    then: []
  });
}

function removeBranchCase(index: number) {
  const step = selectedStep.value;
  if (!step || !Array.isArray(step.cases)) return;
  (step.cases as unknown[]).splice(index, 1);
}

function ensureConfirmList(key: "onConfirm" | "onCancel") {
  const step = selectedStep.value;
  if (!step) return;
  if (!Array.isArray(step[key])) step[key] = [];
}

function ensureHook(key: "before" | "after") {
  const api = selectedApi.value;
  if (!api) return;
  if (!Array.isArray(api[key])) api[key] = [];
}

function addParam() {
  const action = selectedAction.value;
  if (!action) return;
  if (!Array.isArray(action.params)) action.params = [];
  action.params.push({ key: `param${(action.params as unknown[]).length + 1}`, label: "参数", type: "string", required: false });
}

function removeParam(index: number) {
  const action = selectedAction.value;
  if (!action || !Array.isArray(action.params)) return;
  action.params.splice(index, 1);
}

function setFlowVariableMappings(value: unknown) {
  if (!selectedFlow.value) return;
  selectedFlow.value.variables = value as LogicFlow["variables"];
}

function setFlowTaskForms(value: unknown) {
  if (!selectedFlow.value) return;
  selectedFlow.value.taskForms = value as unknown[] | undefined;
}

function setFlowListeners(value: unknown) {
  if (!selectedFlow.value) return;
  selectedFlow.value.listeners = value as unknown[] | undefined;
}

function bpmnKeyOf(flow: LogicFlow): string {
  const ref = flow.bpmnRef as Record<string, unknown> | undefined;
  return String(ref?.key ?? ref?.assetId ?? "");
}

function setBpmnKey(flow: LogicFlow, value: string) {
  flow.bpmnRef = value ? { kind: "bpmn", key: value, version: 1 } : { kind: "bpmn", key: "", version: 1 };
}

async function copyLogicJson() {
  if (!logic.value) return;
  try {
    await navigator.clipboard.writeText(prettyJson(logic.value));
    ElMessage.success("已复制逻辑 JSON");
  } catch {
    ElMessage.warning("浏览器未授予剪贴板权限");
  }
}
const currentTabLabel = computed(() => tabMeta.find((item) => item.key === activeTab.value)?.label ?? "动作");
const currentHint = computed(() => tabMeta.find((item) => item.key === activeTab.value)?.hint ?? "");

function numberValue(step: LogicStep, key: string): number | undefined {
  const value = step[key];
  return typeof value === "number" ? value : undefined;
}

function ruleEntityKey(): string {
  return selectedRule.value?.entityRef?.key ?? "";
}

function setRuleEntity(value: string) {
  if (!selectedRule.value) return;
  selectedRule.value.entityRef = value ? { kind: "entity", key: value, version: 1 } : undefined;
}

function apiMethodClass(method: string): string {
  if (method === "GET") return "bg-emerald-50 text-emerald-700";
  if (method === "POST") return "bg-indigo-50 text-indigo-700";
  if (method === "PUT" || method === "PATCH") return "bg-amber-50 text-amber-700";
  if (method === "DELETE") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function actionStepCount(action: LogicAction): number {
  return allStepsOfAction(action).length;
}

function flowMappingCount(flow: LogicFlow): number {
  return Array.isArray(flow.variables) ? flow.variables.length : 0;
}

function flowTaskFormCount(flow: LogicFlow): number {
  return Array.isArray(flow.taskForms) ? flow.taskForms.length : 0;
}

function flowListenerCount(flow: LogicFlow): number {
  return Array.isArray(flow.listeners) ? flow.listeners.length : 0;
}
</script>
<template>
  <div class="pb-10">
    <div v-if="loading" class="flex h-[60vh] items-center justify-center text-[13px] text-slate-400">
      正在加载逻辑编排…
    </div>

    <template v-else-if="app && logic">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div class="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-lg font-semibold text-white shadow-lg shadow-rose-200">
            {{ app.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-[21px] font-semibold tracking-tight text-slate-900">{{ app.name }} · 逻辑编排</h1>
              <span class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">动作 · API · 流程 · 规则</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span class="font-mono">{{ logic.key }}</span>
              <span>·</span>
              <span>当前版本 {{ app.current_version ? `v${app.current_version}` : "未发布" }}</span>
              <span>·</span>
              <span>草稿 r{{ draft?.revision ?? app.draft_revision }}</span>
              <span>·</span>
              <span>{{ logic.description || "统一编排业务动作、接口与流程" }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <el-button @click="openAiFlow">AI 生成流程</el-button>
          <el-button :loading="reloading" @click="reloadDraft">重新加载</el-button>
          <el-button @click="jsonOpen = true">查看 JSON</el-button>
          <el-button @click="issuesOpen = true">
            校验
            <span
              v-if="errorCount || warningCount"
              class="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
              :class="errorCount ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'"
            >
              {{ errorCount || warningCount }}
            </span>
          </el-button>
          <el-button type="primary" plain :loading="saving" @click="saveDraft(false)">保存草稿</el-button>
          <el-button type="primary" @click="openPublish">发布</el-button>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
        <div class="flex rounded-lg bg-slate-100 p-0.5">
          <button
            v-for="tab in tabMeta"
            :key="tab.key"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] transition"
            :class="activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="switchTab(tab.key)"
          >
            <span class="text-[11px]">{{ tab.icon }}</span>
            {{ tab.label }}
            <span class="rounded bg-slate-100 px-1 text-[9.5px] text-slate-400">{{ tabCount(tab.key) }}</span>
          </button>
        </div>

        <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
        <span class="text-[11.5px] text-slate-400">{{ currentHint }}</span>

        <span
          class="inline-flex items-center gap-1.5 text-[11.5px]"
          :class="dirty ? 'text-amber-600' : 'text-slate-400'"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="dirty ? 'bg-amber-500' : 'bg-emerald-400'" />
          {{ dirty ? "有未保存修改" : "已与服务端同步" }}
        </span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <span class="rounded-md bg-slate-100 px-2 py-1">动作 {{ stats.actions }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">步骤 {{ stats.steps }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">API {{ stats.apis }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">流程 {{ stats.flows }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">规则 {{ stats.rules }}</span>
          <span
            class="rounded-md px-2 py-1"
            :class="errorCount ? 'bg-rose-50 text-rose-600' : warningCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'"
          >
            {{ errorCount ? `${errorCount} 错误` : warningCount ? `${warningCount} 提示` : "校验通过" }}
          </span>
        </div>
      </div>

      <div class="mt-4 grid items-start gap-3 xl:grid-cols-[262px_minmax(0,1fr)_372px]">
        <aside class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div class="border-b border-slate-100 px-3 py-2.5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-[12.5px] font-medium text-slate-700">{{ currentTabLabel }}列表</p>
                <p class="mt-0.5 text-[10px] text-slate-400">选中后在右侧编辑</p>
              </div>
              <button
                class="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-[15px] leading-none text-white transition hover:bg-slate-700"
                title="新建"
                @click="addCurrent"
              >
                +
              </button>
            </div>
            <el-input v-model="query" size="small" placeholder="搜索 key / 名称" clearable class="mt-2" />
          </div>

          <div class="scroll-thin max-h-[720px] space-y-1 overflow-auto p-2">
            <template v-if="activeTab === 'actions'">
              <button
                v-for="item in filteredActions"
                :key="item.id"
                class="flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition"
                :class="selectedActionId === item.id && !selectedStepId ? 'border-indigo-200 bg-indigo-50/60' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'"
                @click="selectAction(item)"
              >
                <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-indigo-100 text-[10px] text-indigo-600">▷</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1">
                    <span class="truncate text-[12px] font-medium text-slate-700">{{ item.name }}</span>
                    <span class="ml-auto shrink-0 rounded bg-white/80 px-1 text-[9.5px] text-slate-400">{{ actionStepCount(item) }} 步</span>
                  </span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{{ item.key }}</span>
                  <span class="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{{ triggerLabel(item.trigger) }}</span>
                </span>
              </button>
              <p v-if="!filteredActions.length" class="px-3 py-10 text-center text-[11.5px] text-slate-400">暂无动作，点击右上角 + 新建</p>
            </template>

            <template v-else-if="activeTab === 'apis'">
              <button
                v-for="item in filteredApis"
                :key="item.id"
                class="flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition"
                :class="selectedApiId === item.id && !selectedStepId ? 'border-indigo-200 bg-indigo-50/60' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'"
                @click="selectApi(item)"
              >
                <span class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold" :class="apiMethodClass(item.method)">{{ item.method }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium text-slate-700">{{ item.name }}</span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{{ item.path }}</span>
                  <span class="mt-1 block truncate font-mono text-[9.5px] text-slate-300">{{ item.key }}</span>
                </span>
              </button>
              <p v-if="!filteredApis.length" class="px-3 py-10 text-center text-[11.5px] text-slate-400">暂无 API 声明</p>
            </template>

            <template v-else-if="activeTab === 'flows'">
              <button
                v-for="item in filteredFlows"
                :key="item.id"
                class="flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition"
                :class="selectedFlowId === item.id ? 'border-rose-200 bg-rose-50/50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'"
                @click="selectFlow(item)"
              >
                <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-rose-100 text-[10px] text-rose-600">◇</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium text-slate-700">{{ item.name }}</span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{{ item.processKey }}</span>
                  <span class="mt-1 flex gap-1 text-[9px] text-slate-400">
                    <span class="rounded bg-slate-100 px-1 py-0.5">表单 {{ flowTaskFormCount(item) }}</span>
                    <span class="rounded bg-slate-100 px-1 py-0.5">监听 {{ flowListenerCount(item) }}</span>
                  </span>
                </span>
              </button>
              <p v-if="!filteredFlows.length" class="px-3 py-10 text-center text-[11.5px] text-slate-400">暂无流程定义</p>
            </template>

            <template v-else>
              <button
                v-for="item in filteredRules"
                :key="item.id"
                class="flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition"
                :class="selectedRuleId === item.id && !selectedStepId ? 'border-teal-200 bg-teal-50/50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'"
                @click="selectRule(item)"
              >
                <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-teal-100 text-[10px] text-teal-600">✓</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium text-slate-700">{{ item.name }}</span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{{ item.key }}</span>
                  <span class="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{{ ruleKindLabel(item.kind) }} · P{{ item.priority ?? 100 }}</span>
                </span>
              </button>
              <p v-if="!filteredRules.length" class="px-3 py-10 text-center text-[11.5px] text-slate-400">暂无规则</p>
            </template>
          </div>

          <div class="flex items-center gap-1 border-t border-slate-100 px-2 py-2">
            <el-button text size="small" :disabled="!currentId()" @click="duplicateCurrent">复制</el-button>
            <el-button text size="small" type="danger" :disabled="!currentId()" @click="deleteCurrent">删除</el-button>
            <span class="ml-auto text-[10px] text-slate-300">{{ currentTabLabel }} {{ tabCount(activeTab) }}</span>
          </div>
        </aside>
        <section class="min-w-0">
          <div class="rounded-2xl border border-slate-200/80 bg-white">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div class="flex items-center gap-2 text-[11.5px] text-slate-500">
                <span class="h-1.5 w-1.5 rounded-full bg-rose-400" />
                逻辑画布
                <span class="text-slate-300">/</span>
                <span class="font-mono text-[10.5px] text-slate-400">{{ currentTabLabel }}</span>
              </div>
              <div class="flex items-center gap-2 text-[10px] text-slate-400">
                <span>选中步骤后在右侧编辑属性</span>
                <span class="rounded bg-slate-100 px-1.5 py-0.5">{{ activeSteps.length }} 个顶层步骤</span>
              </div>
            </div>

            <div class="p-4">
              <template v-if="activeTab === 'actions'">
                <div v-if="!selectedAction" class="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
                  <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-500">▷</div>
                  <h2 class="mt-3 text-[15px] font-semibold text-slate-800">创建第一个业务动作</h2>
                  <p class="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-slate-500">
                    动作是页面可调用的执行单元，可以串接 API、校验、事务、流程与自定义代码。
                  </p>
                  <el-button class="mt-4" type="primary" @click="addCurrent">新建动作</el-button>
                </div>

                <template v-else>
                  <div
                    class="cursor-pointer rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 transition hover:border-indigo-200"
                    @click="selectedStepId = null"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white">{{ triggerLabel(selectedAction.trigger) }}</span>
                          <span class="font-mono text-[10.5px] text-slate-400">{{ selectedAction.key }}</span>
                          <span v-if="selectedAction.idempotent" class="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-600">幂等</span>
                          <span v-if="selectedAction.transaction" class="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-600">整段事务</span>
                        </div>
                        <h2 class="mt-2 text-[17px] font-semibold tracking-tight text-slate-800">{{ selectedAction.name }}</h2>
                        <p class="mt-1 max-w-xl text-[11.5px] leading-relaxed text-slate-500">
                          {{ selectedAction.description || "未填写动作说明，可在右侧补充。" }}
                        </p>
                      </div>
                      <div class="flex shrink-0 gap-2 text-center">
                        <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                          <p class="text-[9.5px] uppercase tracking-wide text-slate-400">顶层步骤</p>
                          <p class="mt-0.5 font-mono text-[16px] font-semibold text-slate-700">{{ selectedAction.steps.length }}</p>
                        </div>
                        <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                          <p class="text-[9.5px] uppercase tracking-wide text-slate-400">全部节点</p>
                          <p class="mt-0.5 font-mono text-[16px] font-semibold text-slate-700">{{ actionStepCount(selectedAction) }}</p>
                        </div>
                        <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                          <p class="text-[9.5px] uppercase tracking-wide text-slate-400">入参</p>
                          <p class="mt-0.5 font-mono text-[16px] font-semibold text-slate-700">{{ selectedAction.params?.length ?? 0 }}</p>
                        </div>
                      </div>
                    </div>
                    <div v-if="selectedAction.when" class="mt-3 rounded-lg bg-amber-50/80 px-3 py-2 text-[10.5px] text-amber-700">
                      前置条件：<span class="font-mono">{{ exprText(selectedAction.when) }}</span>
                    </div>
                  </div>

                  <div class="mt-4 flex items-center justify-between">
                    <div>
                      <p class="text-[12px] font-medium text-slate-700">步骤编排</p>
                      <p class="mt-0.5 text-[10.5px] text-slate-400">条件分支、循环与事务可展开子步骤</p>
                    </div>
                    <el-button size="small" @click="openAddStep(selectedAction.steps)">+ 添加步骤</el-button>
                  </div>

                  <div class="mt-2">
                    <StepList
                      :steps="selectedAction.steps"
                      :selected-id="selectedStepId"
                      @select="selectedStepId = $event"
                      @add="openAddStep"
                      @move="moveStep"
                      @remove="removeStep"
                      @duplicate="duplicateStep"
                    />
                  </div>
                </template>
              </template>

              <template v-else-if="activeTab === 'apis'">
                <div v-if="!selectedApi" class="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
                  <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-500">⇄</div>
                  <h2 class="mt-3 text-[15px] font-semibold text-slate-800">声明第一个 API</h2>
                  <p class="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-slate-500">
                    接口先声明后调用，密钥只放在连接引用里，不进入 Schema。
                  </p>
                  <el-button class="mt-4" type="primary" @click="addCurrent">新建 API</el-button>
                </div>

                <template v-else>
                  <div class="cursor-pointer overflow-hidden rounded-xl bg-slate-900 p-4 text-white" @click="selectedStepId = null">
                    <div class="flex flex-wrap items-center gap-3">
                      <span class="rounded-md px-2 py-1 text-[10.5px] font-semibold" :class="apiMethodClass(selectedApi.method)">{{ selectedApi.method }}</span>
                      <span class="break-all font-mono text-[13px]">{{ apiBaseUrl(selectedApi) }}{{ selectedApi.path }}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                      <span class="rounded bg-white/10 px-2 py-0.5">{{ selectedApi.name }}</span>
                      <span class="font-mono text-slate-400">{{ selectedApi.key }}</span>
                      <span class="rounded bg-white/10 px-2 py-0.5">{{ selectedApi.kind ?? "rest" }}</span>
                      <span v-if="selectedApiConnection" class="rounded bg-emerald-400/15 px-2 py-0.5 text-emerald-200">连接器 {{ selectedApiConnection.key }}</span>
                      <span class="rounded bg-white/10 px-2 py-0.5">超时 {{ selectedApi.timeoutMs ?? 10000 }}ms</span>
                    </div>
                    <p class="mt-2 text-[11px] leading-relaxed text-slate-400">{{ selectedApi.description || "未填写接口说明" }}</p>
                  </div>

                  <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">请求前步骤</p>
                      <p class="mt-0.5 font-mono text-[15px] font-semibold text-slate-700">{{ selectedApi.before?.length ?? 0 }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">响应后步骤</p>
                      <p class="mt-0.5 font-mono text-[15px] font-semibold text-slate-700">{{ selectedApi.after?.length ?? 0 }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">鉴权</p>
                      <p class="mt-0.5 truncate text-[11.5px] font-medium text-slate-600">{{ selectedApi.auth ? "已配置" : "继承默认" }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">Mock</p>
                      <p class="mt-0.5 text-[11.5px] font-medium text-slate-600">{{ selectedApi.mock ? "已开启" : "关闭" }}</p>
                    </div>
                  </div>

                  <div class="mt-4 rounded-xl border border-slate-200 p-3">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-[12px] font-medium text-slate-700">请求前编排</p>
                        <p class="mt-0.5 text-[10.5px] text-slate-400">取 token、算签名、拼参数</p>
                      </div>
                      <el-button size="small" text @click="ensureHook('before')">+ 步骤</el-button>
                    </div>
                    <div v-if="Array.isArray(selectedApi.before)" class="mt-2">
                      <StepList
                        :steps="selectedApi.before"
                        :selected-id="selectedStepId"
                        @select="selectedStepId = $event"
                        @add="openAddStep"
                        @move="moveStep"
                        @remove="removeStep"
                        @duplicate="duplicateStep"
                      />
                    </div>
                    <button v-else class="mt-2 w-full rounded-lg border border-dashed border-slate-200 py-2 text-[10.5px] text-slate-400 hover:border-indigo-300 hover:text-indigo-600" @click="ensureHook('before')">
                      添加请求前步骤
                    </button>
                  </div>

                  <div class="mt-3 rounded-xl border border-slate-200 p-3">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-[12px] font-medium text-slate-700">响应后编排</p>
                        <p class="mt-0.5 text-[10.5px] text-slate-400">落库、转换、发送事件</p>
                      </div>
                      <el-button size="small" text @click="ensureHook('after')">+ 步骤</el-button>
                    </div>
                    <div v-if="Array.isArray(selectedApi.after)" class="mt-2">
                      <StepList
                        :steps="selectedApi.after"
                        :selected-id="selectedStepId"
                        @select="selectedStepId = $event"
                        @add="openAddStep"
                        @move="moveStep"
                        @remove="removeStep"
                        @duplicate="duplicateStep"
                      />
                    </div>
                    <button v-else class="mt-2 w-full rounded-lg border border-dashed border-slate-200 py-2 text-[10.5px] text-slate-400 hover:border-indigo-300 hover:text-indigo-600" @click="ensureHook('after')">
                      添加响应后步骤
                    </button>
                  </div>
                </template>
              </template>
              <template v-else-if="activeTab === 'flows'">
                <div v-if="!selectedFlow" class="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
                  <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-xl text-rose-500">◇</div>
                  <h2 class="mt-3 text-[15px] font-semibold text-slate-800">绑定第一个 Flowable 流程</h2>
                  <p class="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-slate-500">
                    流程定义引用 BPMN 资产，并声明变量映射、任务表单与监听动作。
                  </p>
                  <el-button class="mt-4" type="primary" @click="addCurrent">新建流程</el-button>
                </div>

                <template v-else>
                  <div class="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-orange-50/50 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white">Flowable</span>
                          <span class="font-mono text-[10.5px] text-slate-400">{{ selectedFlow.key }}</span>
                          <span v-if="selectedFlow.allowRecall" class="rounded bg-white px-1.5 py-0.5 text-[9px] text-emerald-600">可撤回</span>
                          <span v-if="selectedFlow.allowReturn" class="rounded bg-white px-1.5 py-0.5 text-[9px] text-emerald-600">可退回</span>
                          <span v-if="selectedFlow.allowTransfer" class="rounded bg-white px-1.5 py-0.5 text-[9px] text-emerald-600">可转办</span>
                        </div>
                        <h2 class="mt-2 text-[17px] font-semibold tracking-tight text-slate-800">{{ selectedFlow.name }}</h2>
                        <p class="mt-1 max-w-xl text-[11.5px] leading-relaxed text-slate-500">{{ selectedFlow.description || "未填写流程说明" }}</p>
                      </div>
                      <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                        <p class="text-[9.5px] uppercase tracking-wide text-slate-400">processKey</p>
                        <p class="mt-0.5 font-mono text-[13px] font-semibold text-slate-700">{{ selectedFlow.processKey }}</p>
                      </div>
                    </div>
                  </div>

                  <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">BPMN 资产</p>
                      <p class="mt-0.5 truncate font-mono text-[11px] font-medium text-slate-700">{{ bpmnKeyOf(selectedFlow) || "未绑定" }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">变量映射</p>
                      <p class="mt-0.5 font-mono text-[15px] font-semibold text-slate-700">{{ flowMappingCount(selectedFlow) }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">任务表单</p>
                      <p class="mt-0.5 font-mono text-[15px] font-semibold text-slate-700">{{ flowTaskFormCount(selectedFlow) }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p class="text-[9.5px] uppercase tracking-wide text-slate-400">监听器</p>
                      <p class="mt-0.5 font-mono text-[15px] font-semibold text-slate-700">{{ flowListenerCount(selectedFlow) }}</p>
                    </div>
                  </div>

                  <div class="mt-4 rounded-xl border border-slate-200 p-3">
                    <p class="text-[12px] font-medium text-slate-700">流程变量映射</p>
                    <div v-if="selectedFlow.variables?.length" class="mt-2 space-y-1">
                      <div
                        v-for="(mapping, index) in selectedFlow.variables"
                        :key="`${mapping.name}-${index}`"
                        class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10.5px]"
                      >
                        <span class="font-mono font-medium text-slate-700">{{ mapping.name }}</span>
                        <span class="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">{{ mapping.direction }}</span>
                        <span class="text-slate-300">←</span>
                        <span class="min-w-0 flex-1 truncate font-mono text-slate-500">{{ exprText(mapping.source) }}</span>
                        <span class="text-[9px] text-slate-400">{{ mapping.type }}</span>
                      </div>
                    </div>
                    <p v-else class="mt-2 text-[11px] text-slate-400">尚未声明变量映射，可在右侧 JSON 编辑器中补充。</p>
                  </div>

                  <div class="mt-3 grid gap-3 md:grid-cols-2">
                    <div class="rounded-xl border border-slate-200 p-3">
                      <p class="text-[12px] font-medium text-slate-700">任务表单</p>
                      <div v-if="selectedFlow.taskForms?.length" class="scroll-thin mt-2 max-h-44 space-y-1.5 overflow-auto">
                        <pre v-for="(form, index) in selectedFlow.taskForms" :key="index" class="scroll-thin max-h-24 overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-600">{{ prettyJson(form) }}</pre>
                      </div>
                      <p v-else class="mt-2 text-[11px] text-slate-400">无任务表单</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 p-3">
                      <p class="text-[12px] font-medium text-slate-700">事件监听器</p>
                      <div v-if="selectedFlow.listeners?.length" class="scroll-thin mt-2 max-h-44 space-y-1.5 overflow-auto">
                        <pre v-for="(listener, index) in selectedFlow.listeners" :key="index" class="scroll-thin max-h-24 overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-600">{{ prettyJson(listener) }}</pre>
                      </div>
                      <p v-else class="mt-2 text-[11px] text-slate-400">无监听器</p>
                    </div>
                  </div>
                </template>
              </template>

              <template v-else>
                <div v-if="!selectedRule" class="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
                  <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-xl text-teal-500">✓</div>
                  <h2 class="mt-3 text-[15px] font-semibold text-slate-800">创建第一条业务规则</h2>
                  <p class="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-slate-500">
                    规则挂在实体上，可按创建 / 更新 / 删除时机执行校验、派生、守卫与通知。
                  </p>
                  <el-button class="mt-4" type="primary" @click="addCurrent">新建规则</el-button>
                </div>

                <template v-else>
                  <div class="cursor-pointer rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 via-white to-white p-4" @click="selectedStepId = null">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">{{ ruleKindLabel(selectedRule.kind) }}</span>
                          <span class="font-mono text-[10.5px] text-slate-400">{{ selectedRule.key }}</span>
                          <span class="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">实体 {{ selectedRule.entityRef?.key || "未绑定" }}</span>
                          <span class="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">时机 {{ selectedRule.on || "any" }}</span>
                          <span class="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">P{{ selectedRule.priority ?? 100 }}</span>
                        </div>
                        <h2 class="mt-2 text-[17px] font-semibold tracking-tight text-slate-800">{{ selectedRule.name }}</h2>
                        <p class="mt-1 max-w-xl text-[11.5px] leading-relaxed text-slate-500">{{ selectedRule.description || "未填写规则说明" }}</p>
                      </div>
                      <div class="flex shrink-0 gap-2 text-center">
                        <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                          <p class="text-[9.5px] uppercase tracking-wide text-slate-400">步骤</p>
                          <p class="mt-0.5 font-mono text-[16px] font-semibold text-slate-700">{{ selectedRule.then.length }}</p>
                        </div>
                        <div class="rounded-lg bg-white px-3 py-2 shadow-sm">
                          <p class="text-[9.5px] uppercase tracking-wide text-slate-400">状态</p>
                          <p class="mt-0.5 text-[11.5px] font-semibold" :class="selectedRule.enabled === false ? 'text-slate-400' : 'text-emerald-600'">
                            {{ selectedRule.enabled === false ? "停用" : "启用" }}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div v-if="selectedRule.when" class="mt-3 rounded-lg bg-amber-50/80 px-3 py-2 text-[10.5px] text-amber-700">
                      触发条件：<span class="font-mono">{{ exprText(selectedRule.when) }}</span>
                    </div>
                  </div>

                  <div class="mt-4 flex items-center justify-between">
                    <div>
                      <p class="text-[12px] font-medium text-slate-700">规则执行步骤</p>
                      <p class="mt-0.5 text-[10.5px] text-slate-400">命中规则后依次执行</p>
                    </div>
                    <el-button size="small" @click="openAddStep(selectedRule.then)">+ 添加步骤</el-button>
                  </div>

                  <div class="mt-2">
                    <StepList
                      :steps="selectedRule.then"
                      :selected-id="selectedStepId"
                      @select="selectedStepId = $event"
                      @add="openAddStep"
                      @move="moveStep"
                      @remove="removeStep"
                      @duplicate="duplicateStep"
                    />
                  </div>
                </template>
              </template>
            </div>
          </div>
        </section>
        <aside class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div class="min-w-0">
              <template v-if="selectedStep">
                <button class="text-[10px] text-slate-400 transition hover:text-indigo-600" @click="selectedStepId = null">← 返回{{ currentTabLabel }}设置</button>
                <p class="mt-0.5 truncate text-[12px] font-medium text-slate-800">{{ stepLabel(selectedStep) }}</p>
                <p class="font-mono text-[9.5px] text-slate-400">{{ selectedStep.type }}</p>
              </template>
              <template v-else>
                <p class="text-[12px] font-medium text-slate-800">{{ currentTabLabel }}设置</p>
                <p class="mt-0.5 text-[9.5px] text-slate-400">在画布中选中步骤可编辑步骤属性</p>
              </template>
            </div>
            <button
              v-if="selectedStep"
              class="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600"
              @click="openStepJson"
            >
              节点 JSON
            </button>
          </div>

          <div class="scroll-thin max-h-[760px] overflow-auto p-3">
            <template v-if="selectedStep">
              <div class="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded text-[11px]" :class="selectedStepDef?.color ?? 'bg-slate-100 text-slate-500'">
                  {{ selectedStepDef?.icon ?? "•" }}
                </span>
                <div class="min-w-0">
                  <p class="text-[11.5px] font-medium text-slate-700">{{ selectedStepDef?.label ?? selectedStep.type }}</p>
                  <p class="mt-0.5 text-[10px] leading-relaxed text-slate-400">{{ selectedStepDef?.description }}</p>
                </div>
              </div>

              <div class="mt-3 space-y-2">
                <div>
                  <label class="mb-1 block text-[10.5px] font-medium text-slate-500">步骤名称</label>
                  <el-input
                    :model-value="String(selectedStep.label ?? '')"
                    size="small"
                    placeholder="留空则显示类型名称"
                    @update:model-value="setField(selectedStep, 'label', $event)"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-[10.5px] font-medium text-slate-500">说明</label>
                  <el-input
                    :model-value="String(selectedStep.note ?? '')"
                    type="textarea"
                    :rows="2"
                    size="small"
                    placeholder="给后续维护者看的备注"
                    @update:model-value="setField(selectedStep, 'note', $event)"
                  />
                </div>
              </div>

              <div v-if="selectedStepDef?.fields.length" class="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
                <div v-for="field in selectedStepDef?.fields ?? []" :key="field.key">
                  <div class="mb-1 flex items-center justify-between">
                    <label class="text-[10.5px] font-medium text-slate-500">{{ field.label }}</label>
                    <span class="font-mono text-[9px] text-slate-300">{{ field.key }}</span>
                  </div>

                  <el-input
                    v-if="field.kind === 'text'"
                    :model-value="String(fieldValue(selectedStep, field.key) ?? '')"
                    size="small"
                    :placeholder="field.placeholder"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  />

                  <el-input
                    v-else-if="field.kind === 'textarea'"
                    :model-value="String(fieldValue(selectedStep, field.key) ?? '')"
                    type="textarea"
                    :rows="field.rows ?? 3"
                    size="small"
                    :placeholder="field.placeholder"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  />

                  <el-input
                    v-else-if="field.kind === 'code'"
                    :model-value="String(fieldValue(selectedStep, field.key) ?? '')"
                    type="textarea"
                    :rows="field.rows ?? 10"
                    size="small"
                    :input-style="{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px', lineHeight: '1.6' }"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  />

                  <el-input-number
                    v-else-if="field.kind === 'number'"
                    :model-value="numberValue(selectedStep, field.key)"
                    size="small"
                    controls-position="right"
                    class="!w-full"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  />

                  <div v-else-if="field.kind === 'bool'" class="flex items-center justify-start rounded-md bg-slate-50 px-2 py-1.5">
                    <el-switch
                      :model-value="Boolean(fieldValue(selectedStep, field.key))"
                      size="small"
                      @update:model-value="setField(selectedStep, field.key, $event)"
                    />
                  </div>

                  <el-select
                    v-else-if="field.kind === 'select'"
                    :model-value="String(fieldValue(selectedStep, field.key) ?? '')"
                    size="small"
                    class="!w-full"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  >
                    <el-option v-for="option in field.options ?? []" :key="option" :label="option" :value="option" />
                  </el-select>

                  <el-select
                    v-else-if="field.kind === 'ref'"
                    :model-value="refKeyOf(selectedStep, field.key)"
                    size="small"
                    filterable
                    clearable
                    class="!w-full"
                    :placeholder="`选择${field.label}`"
                    @update:model-value="setRefField(selectedStep, field.key, field.refKind ?? 'api', $event)"
                  >
                    <el-option v-for="option in refOptions(field.refKind ?? 'api')" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>

                  <JsonField
                    v-else-if="field.kind === 'json'"
                    :model-value="fieldValue(selectedStep, field.key)"
                    :rows="field.key === 'source' ? 12 : 4"
                    :placeholder="field.placeholder"
                    @update:model-value="setField(selectedStep, field.key, $event)"
                  />
                </div>
              </div>

              <div v-if="selectedStep.type === 'code'" class="mt-3 border-t border-slate-100 pt-3">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="text-[10.5px] font-medium text-slate-600">浏览器试运行</p>
                    <p class="mt-0.5 text-[9.5px] leading-relaxed text-slate-400">
                      使用占位输入与上下文，只验证 TS 语法、事件与返回值，不写回任何数据。
                    </p>
                  </div>
                  <el-button size="small" type="primary" plain :loading="codeRunning" :disabled="!canRunCodeStep" @click="runCodeStep">
                    试运行
                  </el-button>
                </div>
                <p v-if="!canRunCodeStep" class="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-700">
                  仅支持语言 ts 且运行端 browser。服务端步骤发布后由动作执行器运行，当前只放行注册入口 calcWorkdays；Java 步骤暂不支持设计器试运行。
                </p>
                <template v-else>
                  <div class="mt-2 flex items-center gap-2 text-[9.5px] text-slate-400">
                    <span>入口 {{ String(selectedStep.entry ?? '') || 'default' }}</span>
                    <span v-if="codeElapsed !== null">· 耗时 {{ codeElapsed }} ms</span>
                  </div>
                  <p v-if="codeError" class="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[10px] leading-relaxed text-rose-600">
                    {{ codeError }}
                  </p>
                  <div
                    v-if="codeOutput || codeLogs.length || codeEvents.length"
                    class="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                  >
                    <div>
                      <p class="text-[9.5px] font-medium text-slate-500">输出</p>
                      <pre class="mt-0.5 max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-700">{{ codeOutput || 'null' }}</pre>
                    </div>
                    <div v-if="codeLogs.length">
                      <p class="text-[9.5px] font-medium text-slate-500">日志</p>
                      <pre class="mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600">{{ codeLogs.join('\n') }}</pre>
                    </div>
                    <div v-if="codeEvents.length">
                      <p class="text-[9.5px] font-medium text-slate-500">事件</p>
                      <div
                        v-for="(item, index) in codeEvents"
                        :key="index"
                        class="mt-0.5 rounded bg-white px-1.5 py-1 font-mono text-[9.5px] text-slate-600"
                      >
                        <span class="text-indigo-600">{{ item.name }}</span>
                        <pre class="mt-0.5 whitespace-pre-wrap break-all">{{ prettyCodeValue(item.payload) }}</pre>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <div v-if="selectedStep.type === 'branch'" class="mt-3 border-t border-slate-100 pt-3">
                <div class="flex items-center justify-between">
                  <p class="text-[10.5px] font-medium text-slate-500">分支条件</p>
                  <el-button text size="small" @click="addBranchCase">+ 分支</el-button>
                </div>
                <div v-for="(caseItem, index) in branchCases" :key="index" class="mt-2 rounded-lg border border-slate-200 p-2">
                  <div class="flex items-center gap-1.5">
                    <el-input
                      :model-value="String(caseItem.name ?? '')"
                      size="small"
                      placeholder="分支名称"
                      @update:model-value="caseItem.name = $event"
                    />
                    <button class="shrink-0 rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-rose-50 hover:text-rose-600" @click="removeBranchCase(index)">×</button>
                  </div>
                  <p class="mb-1 mt-2 text-[9.5px] text-slate-400">条件 when</p>
                  <JsonField :model-value="caseItem.when" :rows="2" @update:model-value="caseItem.when = $event" />
                  <p class="mt-1.5 text-[9.5px] text-slate-400">
                    子步骤 {{ Array.isArray(caseItem.then) ? (caseItem.then as unknown[]).length : 0 }} 个 · 在画布中展开编辑
                  </p>
                </div>
                <p class="mt-2 text-[9.5px] leading-relaxed text-slate-400">else 分支与子步骤在画布中直接添加、排序和删除。</p>
              </div>

              <div v-if="selectedStep.type === 'confirm'" class="mt-3 border-t border-slate-100 pt-3">
                <p class="text-[10.5px] font-medium text-slate-500">分支步骤</p>
                <div class="mt-1.5 flex gap-2">
                  <el-button size="small" @click="ensureConfirmList('onConfirm')">确认后</el-button>
                  <el-button size="small" @click="ensureConfirmList('onCancel')">取消后</el-button>
                </div>
                <p class="mt-1.5 text-[9.5px] leading-relaxed text-slate-400">初始化后可在画布中分别编排确认与取消后的步骤。</p>
              </div>

              <details class="mt-3 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                <summary class="cursor-pointer text-[10.5px] font-medium text-slate-500">通用与高级属性</summary>
                <div class="mt-2.5 space-y-2.5">
                  <div>
                    <p class="mb-1 text-[10px] text-slate-400">执行条件 when</p>
                    <JsonField :model-value="selectedStep.when" :rows="3" @update:model-value="setField(selectedStep, 'when', $event)" />
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10.5px] text-slate-500">禁用步骤</span>
                    <el-switch :model-value="Boolean(selectedStep.disabled)" size="small" @update:model-value="setField(selectedStep, 'disabled', $event)" />
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10.5px] text-slate-500">出错后继续</span>
                    <el-switch :model-value="Boolean(selectedStep.continueOnError)" size="small" @update:model-value="setField(selectedStep, 'continueOnError', $event)" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10px] text-slate-400">语义意图</p>
                    <el-input
                      :model-value="String(selectedStep.semantic?.intent ?? '')"
                      size="small"
                      placeholder="供 AI 理解该步骤的业务目的"
                      @update:model-value="selectedStep.semantic = { ...(selectedStep.semantic ?? {}), intent: $event }"
                    />
                  </div>
                  <p class="break-all font-mono text-[9px] text-slate-300">ID {{ selectedStep.id }}</p>
                </div>
              </details>
            </template>
            <template v-else-if="activeTab === 'actions'">
              <div v-if="!selectedAction" class="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-[11.5px] text-slate-400">
                选择或新建一个动作
              </div>
              <template v-else>
                <div class="space-y-2.5">
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">动作 key</p>
                    <el-input :model-value="selectedAction.key" size="small" @update:model-value="selectedAction.key = $event" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">名称</p>
                    <el-input :model-value="selectedAction.name" size="small" @update:model-value="selectedAction.name = $event" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">触发时机</p>
                    <el-select :model-value="selectedAction.trigger ?? 'manual'" size="small" class="!w-full" @update:model-value="selectedAction.trigger = $event">
                      <el-option v-for="item in TRIGGERS" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">说明</p>
                    <el-input :model-value="String(selectedAction.description ?? '')" type="textarea" :rows="2" size="small" @update:model-value="selectedAction.description = $event" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">前置条件 when</p>
                    <JsonField :model-value="selectedAction.when" :rows="3" @update:model-value="selectedAction.when = $event" />
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10.5px] text-slate-500">整段事务</span>
                    <el-switch :model-value="Boolean(selectedAction.transaction)" size="small" @update:model-value="selectedAction.transaction = $event" />
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10.5px] text-slate-500">幂等去重</span>
                    <el-switch :model-value="selectedAction.idempotent !== false" size="small" @update:model-value="selectedAction.idempotent = $event" />
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">超时毫秒</p>
                    <el-input-number :model-value="selectedAction.timeoutMs" size="small" controls-position="right" class="!w-full" @update:model-value="selectedAction.timeoutMs = $event ?? undefined" />
                  </div>

                  <div class="border-t border-slate-100 pt-2.5">
                    <div class="flex items-center justify-between">
                      <p class="text-[10.5px] font-medium text-slate-500">入参</p>
                      <el-button text size="small" @click="addParam">+ 参数</el-button>
                    </div>
                    <div v-for="(param, index) in selectedAction.params ?? []" :key="`${param.key}-${index}`" class="mt-1.5 rounded-lg border border-slate-200 p-1.5">
                      <div class="grid grid-cols-2 gap-1.5">
                        <el-input v-model="param.key" size="small" placeholder="key" />
                        <el-input v-model="param.label" size="small" placeholder="名称" />
                        <el-select v-model="param.type" size="small" class="!w-full">
                          <el-option v-for="type in ['string', 'number', 'boolean', 'json', 'datetime', 'array', 'object']" :key="type" :label="type" :value="type" />
                        </el-select>
                        <div class="flex items-center justify-between px-1">
                          <span class="text-[10px] text-slate-400">必填</span>
                          <el-switch v-model="param.required" size="small" />
                        </div>
                      </div>
                      <div class="mt-1 flex justify-end">
                        <button class="text-[9.5px] text-slate-400 hover:text-rose-600" @click="removeParam(index)">移除参数</button>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-lg border border-slate-200 bg-slate-50/40 p-2">
                    <p class="text-[10.5px] font-medium text-slate-500">结果回写 writeback</p>
                    <div class="mt-1.5">
                      <JsonField
                        :model-value="selectedAction.writeback"
                        :rows="7"
                        placeholder="{&quot;variables&quot;:{&quot;approvalStatus&quot;:{&quot;$ref&quot;:&quot;$ctx.result.status&quot;}},&quot;success&quot;:{&quot;outcome&quot;:&quot;approve&quot;}}"
                        @update:model-value="selectedAction.writeback = $event as ActionWriteback | undefined"
                      />
                    </div>
                    <p class="mt-1.5 text-[9.5px] leading-relaxed text-slate-400">
                      variables 写流程变量，business 写业务字段；success / failure 声明自动办理的任务 outcome。可用
                      <span class="font-mono">$ctx.result</span>、<span class="font-mono">$ctx.vars</span>、<span class="font-mono">$ctx.error</span>。
                    </p>
                  </div>

                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">语义意图</p>
                    <el-input
                      :model-value="String(selectedAction.semantic?.intent ?? '')"
                      size="small"
                      placeholder="供 AI 理解动作目的"
                      @update:model-value="selectedAction.semantic = { ...(selectedAction.semantic ?? {}), intent: $event }"
                    />
                  </div>
                </div>
              </template>
            </template>

            <template v-else-if="activeTab === 'apis'">
              <div v-if="!selectedApi" class="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-[11.5px] text-slate-400">
                选择或新建一个 API
              </div>
              <div v-else class="space-y-2.5">
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">API key</p>
                  <el-input :model-value="selectedApi.key" size="small" @update:model-value="selectedApi.key = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">名称</p>
                  <el-input :model-value="selectedApi.name" size="small" @update:model-value="selectedApi.name = $event" />
                </div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">方法</p>
                    <el-select :model-value="selectedApi.method" size="small" class="!w-full" @update:model-value="selectedApi.method = $event">
                      <el-option v-for="method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'QUERY', 'MUTATION']" :key="method" :label="method" :value="method" />
                    </el-select>
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">路径</p>
                    <el-input :model-value="selectedApi.path" size="small" @update:model-value="selectedApi.path = $event" />
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">连接器</p>
                  <el-select
                    :model-value="connectionKeyOf(selectedApi)"
                    size="small"
                    clearable
                    filterable
                    placeholder="不使用连接器"
                    class="!w-full"
                    @update:model-value="setApiConnection(selectedApi, String($event ?? ''))"
                  >
                    <el-option
                      v-for="item in connectionOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <div v-if="selectedApiConnection" class="mt-1.5 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-[10.5px] leading-relaxed text-indigo-700">
                    <p class="font-medium">继承 {{ selectedApiConnection.name }}</p>
                    <p class="mt-0.5 break-all font-mono text-[10px] text-indigo-500">
                      {{ selectedApiConnection.base_url || "baseUrl 由 API 提供" }} · {{ selectedApiConnection.config?.timeoutMs ?? 10000 }}ms
                    </p>
                    <p class="mt-0.5">公共头与默认鉴权自动合并；本 API 的 baseUrl、超时、同名头与 auth 优先。</p>
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">Base URL</p>
                  <el-input :model-value="String(selectedApi.baseUrl ?? '')" size="small" :placeholder="selectedApiConnection ? '留空继承连接器' : '内部 API 留空走 BFF'" @update:model-value="selectedApi.baseUrl = $event" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">类型</p>
                    <el-select :model-value="selectedApi.kind ?? 'rest'" size="small" class="!w-full" @update:model-value="selectedApi.kind = $event">
                      <el-option v-for="kind in ['rest', 'graphql', 'soap', 'database', 'internal']" :key="kind" :label="kind" :value="kind" />
                    </el-select>
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">超时毫秒</p>
                    <el-input-number :model-value="selectedApi.timeoutMs" size="small" controls-position="right" class="!w-full" @update:model-value="selectedApi.timeoutMs = $event ?? undefined" />
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">说明</p>
                  <el-input :model-value="String(selectedApi.description ?? '')" type="textarea" :rows="2" size="small" @update:model-value="selectedApi.description = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">鉴权 auth</p>
                  <JsonField :model-value="selectedApi.auth" :rows="3" @update:model-value="selectedApi.auth = $event" />
                  <p v-if="selectedApiConnection && !selectedApi.auth" class="mt-1 text-[10px] text-slate-400">留空则继承连接器的默认鉴权。</p>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">请求契约 request</p>
                  <JsonField :model-value="selectedApi.request" :rows="4" @update:model-value="selectedApi.request = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">响应契约 response</p>
                  <JsonField :model-value="selectedApi.response" :rows="4" @update:model-value="selectedApi.response = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">Mock</p>
                  <JsonField :model-value="selectedApi.mock" :rows="3" @update:model-value="selectedApi.mock = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">语义意图</p>
                  <el-input
                    :model-value="String(selectedApi.semantic?.intent ?? '')"
                    size="small"
                    @update:model-value="selectedApi.semantic = { ...(selectedApi.semantic ?? {}), intent: $event }"
                  />
                </div>
              </div>
            </template>

            <template v-else-if="activeTab === 'flows'">
              <div v-if="!selectedFlow" class="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-[11.5px] text-slate-400">
                选择或新建一个流程
              </div>
              <div v-else class="space-y-2.5">
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">流程 key</p>
                  <el-input :model-value="selectedFlow.key" size="small" @update:model-value="selectedFlow.key = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">名称</p>
                  <el-input :model-value="selectedFlow.name" size="small" @update:model-value="selectedFlow.name = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">processKey</p>
                  <el-input :model-value="selectedFlow.processKey" size="small" @update:model-value="selectedFlow.processKey = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">BPMN 资产</p>
                  <el-select :model-value="bpmnKeyOf(selectedFlow)" size="small" filterable clearable class="!w-full" @update:model-value="setBpmnKey(selectedFlow, $event)">
                    <el-option v-for="item in assetOptions" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">说明</p>
                  <el-input :model-value="String(selectedFlow.description ?? '')" type="textarea" :rows="2" size="small" @update:model-value="selectedFlow.description = $event" />
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10px] text-slate-500">可撤回</span>
                    <el-switch :model-value="selectedFlow.allowRecall !== false" size="small" @update:model-value="selectedFlow.allowRecall = $event" />
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10px] text-slate-500">可退回</span>
                    <el-switch :model-value="selectedFlow.allowReturn !== false" size="small" @update:model-value="selectedFlow.allowReturn = $event" />
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10px] text-slate-500">可转办</span>
                    <el-switch :model-value="selectedFlow.allowTransfer !== false" size="small" @update:model-value="selectedFlow.allowTransfer = $event" />
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span class="text-[10px] text-slate-500">可加签</span>
                    <el-switch :model-value="Boolean(selectedFlow.allowAddSign)" size="small" @update:model-value="selectedFlow.allowAddSign = $event" />
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">变量映射</p>
                  <JsonField :model-value="selectedFlow.variables" :rows="5" @update:model-value="setFlowVariableMappings" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">任务表单</p>
                  <JsonField :model-value="selectedFlow.taskForms" :rows="5" @update:model-value="setFlowTaskForms" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">监听器</p>
                  <JsonField :model-value="selectedFlow.listeners" :rows="5" @update:model-value="setFlowListeners" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">语义意图</p>
                  <el-input
                    :model-value="String(selectedFlow.semantic?.intent ?? '')"
                    size="small"
                    @update:model-value="selectedFlow.semantic = { ...(selectedFlow.semantic ?? {}), intent: $event }"
                  />
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="!selectedRule" class="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-[11.5px] text-slate-400">
                选择或新建一条规则
              </div>
              <div v-else class="space-y-2.5">
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">规则 key</p>
                  <el-input :model-value="selectedRule.key" size="small" @update:model-value="selectedRule.key = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">名称</p>
                  <el-input :model-value="selectedRule.name" size="small" @update:model-value="selectedRule.name = $event" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">规则类型</p>
                    <el-select :model-value="selectedRule.kind" size="small" class="!w-full" @update:model-value="selectedRule.kind = $event">
                      <el-option v-for="item in RULE_KINDS" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">触发时机</p>
                    <el-select :model-value="selectedRule.on ?? 'any'" size="small" class="!w-full" @update:model-value="selectedRule.on = $event">
                      <el-option v-for="item in ['create', 'update', 'delete', 'read', 'any']" :key="item" :label="item" :value="item" />
                    </el-select>
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">绑定实体</p>
                  <el-select :model-value="ruleEntityKey()" size="small" filterable clearable class="!w-full" @update:model-value="setRuleEntity($event)">
                    <el-option v-for="item in entityOptions" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">说明</p>
                  <el-input :model-value="String(selectedRule.description ?? '')" type="textarea" :rows="2" size="small" @update:model-value="selectedRule.description = $event" />
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">触发条件 when</p>
                  <JsonField :model-value="selectedRule.when" :rows="3" @update:model-value="selectedRule.when = $event" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <p class="mb-1 text-[10.5px] font-medium text-slate-500">优先级</p>
                    <el-input-number :model-value="selectedRule.priority" size="small" controls-position="right" class="!w-full" @update:model-value="selectedRule.priority = $event ?? 100" />
                  </div>
                  <div class="flex flex-col justify-end gap-1.5 pb-0.5">
                    <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
                      <span class="text-[10px] text-slate-500">启用</span>
                      <el-switch :model-value="selectedRule.enabled !== false" size="small" @update:model-value="selectedRule.enabled = $event" />
                    </div>
                    <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
                      <span class="text-[10px] text-slate-500">失败即停</span>
                      <el-switch :model-value="selectedRule.stopOnFail !== false" size="small" @update:model-value="selectedRule.stopOnFail = $event" />
                    </div>
                  </div>
                </div>
                <div>
                  <p class="mb-1 text-[10.5px] font-medium text-slate-500">语义意图</p>
                  <el-input
                    :model-value="String(selectedRule.semantic?.intent ?? '')"
                    size="small"
                    @update:model-value="selectedRule.semantic = { ...(selectedRule.semantic ?? {}), intent: $event }"
                  />
                </div>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </template>
    <el-dialog v-model="addStepOpen" title="添加步骤" width="760px" top="6vh">
      <div class="mb-3 flex items-center gap-2">
        <el-input v-model="addStepQuery" placeholder="搜索步骤名称 / 类型 / 说明" clearable class="!w-80" />
        <span class="text-[11.5px] text-slate-400">插入到当前选中节点的子步骤末尾</span>
      </div>
      <div class="scroll-thin max-h-[58vh] space-y-4 overflow-auto pr-1">
        <div v-for="group in addStepGroups" :key="group.label">
          <p class="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{{ group.label }}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="item in group.items"
              :key="item.type"
              class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm"
              @click="applyAddStep(item.type)"
            >
              <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px]" :class="item.color">{{ item.icon }}</span>
              <span class="min-w-0">
                <span class="block text-[12px] font-medium text-slate-700">{{ item.label }}</span>
                <span class="mt-0.5 block text-[10.5px] leading-relaxed text-slate-400">{{ item.description }}</span>
                <span class="mt-1 inline-block rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-400">{{ item.type }}</span>
              </span>
            </button>
          </div>
        </div>
        <p v-if="!addStepGroups.length" class="py-12 text-center text-[12px] text-slate-400">没有匹配的步骤类型</p>
      </div>
      <template #footer>
        <el-button @click="addStepOpen = false">取消</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="aiOpen" title="AI 生成审批流程" width="760px">
      <div class="mb-4 rounded-lg bg-rose-50/60 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-rose-700">
        用自然语言描述审批层级与节点。生成结果先预览，确认后才写入本地草稿；不会自动保存或发布。
      </div>
      <el-form label-position="top">
        <el-form-item label="绑定实体（可选）">
          <el-select v-model="aiForm.entityKey" clearable filterable class="w-full" placeholder="选择数据实体">
            <el-option v-for="item in entityOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="自然语言描述" required>
          <el-input
            v-model="aiForm.prompt"
            type="textarea"
            :rows="3"
            maxlength="4000"
            show-word-limit
            placeholder="例如：生成部门负责人和院级审批的两级请假流程"
          />
        </el-form-item>
      </el-form>
      <p v-if="aiError" class="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] leading-relaxed text-rose-600">
        {{ aiError }}
      </p>
      <div v-if="aiResult && aiFlowPreview" class="mt-3 rounded-xl border border-slate-200 p-3">
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span class="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{{ aiResult.provider }}</span>
          <span class="font-mono">{{ aiFlowPreview.key }}</span>
          <span class="text-slate-300">·</span>
          <span class="font-mono">processKey {{ aiFlowPreview.processKey }}</span>
          <span class="text-slate-300">·</span>
          <span>资产 {{ aiResult.assets.length }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
          <span class="rounded bg-slate-100 px-1.5 py-0.5">变量 {{ aiFlowPreview.variables?.length ?? 0 }}</span>
          <span class="rounded bg-slate-100 px-1.5 py-0.5">任务表单 {{ aiFlowPreview.taskForms?.length ?? 0 }}</span>
          <span class="rounded bg-slate-100 px-1.5 py-0.5">监听器 {{ aiFlowPreview.listeners?.length ?? 0 }}</span>
        </div>
        <ul v-if="aiResult.warnings.length" class="mt-2 space-y-1 text-[11px] leading-relaxed text-amber-700">
          <li v-for="(warning, index) in aiResult.warnings" :key="index">· {{ warning }}</li>
        </ul>
        <pre class="scroll-thin mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-600">{{ prettyJson(aiResult.artifact) }}</pre>
      </div>
      <template #footer>
        <el-button @click="aiOpen = false">取消</el-button>
        <el-button :loading="aiRunning" @click="submitAiGenerate">{{ aiResult ? "重新生成" : "生成预览" }}</el-button>
        <el-button type="primary" :disabled="!aiResult" @click="applyAiFlow">应用到本地</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="stepJsonOpen" :title="`步骤 JSON · ${selectedStepDef?.label ?? ''}`" width="700px" top="6vh">
      <p class="mb-2 text-[11.5px] leading-relaxed text-slate-500">
        直接编辑当前步骤节点；保存后会替换画布中的节点，节点 id 与 type 必须保留。
      </p>
      <textarea
        v-model="stepJsonText"
        spellcheck="false"
        class="scroll-thin h-[420px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11.5px] text-slate-700 outline-none focus:border-indigo-300"
      />
      <p v-if="stepJsonError" class="mt-2 text-[11.5px] text-rose-500">{{ stepJsonError }}</p>
      <template #footer>
        <el-button @click="stepJsonOpen = false">取消</el-button>
        <el-button type="primary" @click="applyStepJson">应用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="jsonOpen" title="逻辑模型 JSON" width="880px" top="5vh">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11.5px] text-slate-400">artifacts.logicSchemas · {{ logic?.key ?? '' }}</span>
        <el-button size="small" @click="copyLogicJson">复制 JSON</el-button>
      </div>
      <pre class="scroll-thin max-h-[64vh] overflow-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11.5px] leading-relaxed text-slate-200">{{ logic ? prettyJson(logic) : "" }}</pre>
      <template #footer>
        <el-button @click="jsonOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="issuesOpen" title="逻辑编排校验" width="760px" top="6vh">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-600">错误 {{ errorCount }}</span>
        <span class="rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-700">提示 {{ warningCount }}</span>
        <span class="text-[11.5px] text-slate-400">错误会阻止发布；草稿仍可保存</span>
      </div>
      <div v-if="!issues.length" class="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center text-[12.5px] text-emerald-700">
        没有发现结构问题，可以发布。
      </div>
      <div v-else class="scroll-thin mt-4 max-h-[58vh] space-y-2 overflow-auto pr-1">
        <div
          v-for="(issue, index) in issues"
          :key="`${issue.where}-${index}`"
          class="rounded-lg border px-3.5 py-2.5"
          :class="issue.level === 'error' ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/40'"
        >
          <div class="flex items-center gap-2">
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="issue.level === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'"
            >
              {{ issue.level === "error" ? "错误" : "提示" }}
            </span>
            <span class="font-mono text-[10.5px] text-slate-500">{{ issue.where }}</span>
          </div>
          <p class="mt-1 text-[12px] leading-relaxed text-slate-700">{{ issue.message }}</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="issuesOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="publishOpen" title="发布逻辑编排" width="500px">
      <p class="mb-4 text-[12px] leading-relaxed text-slate-500">
        发布会把当前动作、API、流程与规则一起生成新版本快照，运行时与出码引擎将读取这一版本。
      </p>
      <el-form label-position="top">
        <el-form-item label="发布说明" required>
          <el-input v-model="publishMessage" maxlength="200" show-word-limit placeholder="例如：上线请假审批与销假动作" />
        </el-form-item>
        <el-checkbox v-model="publishForce">强制发布（内容未变化时也生成新版本）</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="publishOpen = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>
