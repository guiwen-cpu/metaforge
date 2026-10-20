<script setup lang="ts">
import { computed, onMounted, provide, reactive, ref, watch } from "vue";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/api/request";
import { getSession } from "@/lib/session";
import { evalDeep, getPath, setPath, truthy } from "@/lib/runtimeExpression";
import {
  buildSearchFilters,
  dataSourceSnapshot,
  initialPageState,
  searchFieldsOf
} from "@/lib/runtimeModel";
import {
  RUNTIME_CONTEXT,
  type MiniDataSourceState,
  type RuntimeActionInvocation,
  type RuntimeContextApi,
  type RuntimeNavigatePayload,
  type RuntimeScope,
  type RuntimeUserContext
} from "@/lib/runtimeContext";
import type { UINode } from "@/types/uiModel";
import type {
  DataSourceSort,
  RuntimeActionDefinition,
  RuntimePageView,
  RuntimeStep
} from "@/types/runtime";
import RuntimeNodeRenderer from "./RuntimeNodeRenderer.vue";

const props = defineProps<{
  appId: string;
  view: RuntimePageView;
  routeParams?: Record<string, string>;
  routeQuery?: Record<string, unknown>;
  navigate?: (payload: RuntimeNavigatePayload) => Promise<void> | void;
  goBack?: () => void;
}>();

const state = reactive<Record<string, unknown>>({});
const data = reactive<Record<string, MiniDataSourceState>>({});
const sortState = reactive<Record<string, DataSourceSort[] | null>>({});
const ready = ref(false);
const loadError = ref("");
const requestSeq = reactive<Record<string, number>>({});

const page = computed(() => props.view.page);
const dialogs = computed(() => (props.view.page.dialogs ?? {}) as Record<string, UINode>);
const routeParams = computed(() => props.routeParams ?? {});
const routeQuery = computed(() => props.routeQuery ?? {});
const dataSourceConfigs = computed(() => {
  const list = (props.view.page.dataSources ?? []) as Array<Record<string, unknown>>;
  return new Map(list.map((item) => [String(item.id ?? ""), item]));
});

const user = computed<RuntimeUserContext>(() => {
  const session = getSession();
  const profile = session?.user;
  return {
    id: profile?.id || "",
    username: profile?.username || "",
    displayName: profile?.displayName || profile?.username || "当前用户",
    tenantId: session?.tenant || "",
    deptId: profile?.deptId ?? null,
    deptIds: profile?.deptId ? [profile.deptId] : [],
    roleKeys: profile?.roleKeys ?? []
  };
});

function rootsFor(scope: RuntimeScope = {}, params: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user: user.value,
    tenant: { id: user.value.tenantId },
    page: { state, params: routeParams.value, query: routeQuery.value },
    route: {
      path: props.view.path ?? page.value.route?.path ?? "",
      params: routeParams.value,
      query: routeQuery.value
    },
    data,
    form: scope.form ?? (state.form as Record<string, unknown> | undefined) ?? {},
    row: scope.row ?? {},
    rows: scope.rows ?? [],
    ctx: { params, event: scope.event ?? {}, vars: scope.vars ?? {} },
    now: new Date().toISOString(),
    env: {
      platform: "miniapp",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      mode: "runtime",
      appVersion: props.view.version_no
    }
  };
}

function evaluate(value: unknown, scope: RuntimeScope = {}, params: Record<string, unknown> = {}): unknown {
  return evalDeep(value, rootsFor(scope, params));
}

function visible(node: UINode, scope: RuntimeScope = {}): boolean {
  if (node.visible === undefined || node.visible === null) return true;
  return truthy(evaluate(node.visible, scope));
}

function disabled(node: UINode, scope: RuntimeScope = {}): boolean {
  const source = node.disable ?? node.props?.disabled;
  if (source === undefined || source === null) return false;
  return truthy(evaluate(source, scope));
}

function permitted(value: unknown, scope: RuntimeScope = {}): boolean {
  if (value === undefined || value === null) return true;
  return truthy(evaluate(value, scope));
}

function notify(
  message: string,
  type: "success" | "warning" | "error" | "info" = "info"
): void {
  if (!message) return;
  if (type === "error") {
    uni.showModal({ title: "操作失败", content: message, showCancel: false });
    return;
  }
  uni.showToast({
    title: message,
    icon: type === "success" ? "success" : "none",
    duration: 2600
  });
}

function confirm(message: string, title = "操作确认", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content: message,
      confirmText: "确定",
      cancelText: "取消",
      confirmColor: danger ? "#e11d48" : "#4f46e5",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    });
  });
}

function findAction(key: string): RuntimeActionDefinition | null {
  return (props.view.actions ?? []).find((item) => item.key === key) ?? null;
}

function dialogOf(key: string): UINode | null {
  return dialogs.value[key] ?? null;
}

function setExpressionValue(expression: unknown, value: unknown): void {
  if (!expression || typeof expression !== "object") return;
  const ref = (expression as Record<string, unknown>).$ref;
  if (typeof ref !== "string") return;
  if (ref.startsWith("$page.state.")) {
    setPath(state, ref.slice("$page.state.".length), value);
    return;
  }
  if (ref.startsWith("$state.")) {
    setPath(state, ref.slice("$state.".length), value);
  }
}

function assignTarget(
  target: string,
  value: unknown,
  scope: RuntimeScope = {},
  params: Record<string, unknown> = {}
): void {
  if (!target) return;
  if (target === "state") {
    Object.assign(state, value && typeof value === "object" ? value : {});
    return;
  }
  if (target.startsWith("state.")) {
    // 本地渲染器尚未执行 apiCall 时，编辑态已由数据源回填；不要用空结果覆盖表单。
    if (target === "state.form" && (value === undefined || value === null)) return;
    setPath(state, target.slice("state.".length), value);
    return;
  }
  if (target === "form") {
    const form = state.form;
    if (form && typeof form === "object") {
      for (const key of Object.keys(form)) delete (form as Record<string, unknown>)[key];
      Object.assign(form, value && typeof value === "object" ? value : {});
    }
    return;
  }
  if (target.startsWith("form.")) {
    const form = state.form;
    if (form && typeof form === "object") {
      setPath(form as Record<string, unknown>, target.slice("form.".length), value);
    }
    return;
  }
  if (target.startsWith("ctx.params.") || target.startsWith("params.")) {
    const prefix = target.startsWith("ctx.params.") ? "ctx.params." : "params.";
    setPath(params, target.slice(prefix.length), value);
    return;
  }
  if (target.startsWith("ctx.vars.") || target.startsWith("vars.")) {
    const prefix = target.startsWith("ctx.vars.") ? "ctx.vars." : "vars.";
    const vars = scope.vars ?? {};
    setPath(vars, target.slice(prefix.length), value);
    scope.vars = vars;
    return;
  }
  if (target.startsWith("data.")) {
    const rest = target.slice("data.".length);
    const [sourceId, ...path] = rest.split(".");
    const source = data[sourceId];
    if (source && path.length) {
      setPath(source as unknown as Record<string, unknown>, path.join("."), value);
    }
  }
}

async function runSteps(
  steps: RuntimeStep[] | undefined,
  scope: RuntimeScope = {},
  params: Record<string, unknown> = {}
): Promise<void> {
  for (const step of steps ?? []) {
    if (!step || typeof step.type !== "string") continue;
    const stepScope: RuntimeScope = { ...scope, event: scope.event ?? {} };
    switch (step.type) {
      case "assign": {
        const value = evaluate(step.value, stepScope, params);
        assignTarget(String(step.target ?? ""), value, stepScope, params);
        break;
      }
      case "branch": {
        const cases = Array.isArray(step.cases) ? (step.cases as Array<Record<string, unknown>>) : [];
        let matched = false;
        for (const branch of cases) {
          if (truthy(evaluate(branch.when, stepScope, params))) {
            matched = true;
            await runSteps(branch.then as RuntimeStep[] | undefined, stepScope, params);
            break;
          }
        }
        if (!matched && Array.isArray(step.else)) {
          await runSteps(step.else as RuntimeStep[], stepScope, params);
        }
        break;
      }
      case "emit": {
        const payload = evaluate(step.payload, stepScope, params);
        await handleEvent({ event: step.event, payload: payload ?? {} });
        break;
      }
      case "log":
        if (step.level === "error") console.error("[runtime]", step.message);
        else console.debug("[runtime]", step.message);
        break;
      case "fail": {
        const when = step.when === undefined ? true : truthy(evaluate(step.when, stepScope, params));
        if (when) {
          const message = String(evaluate(step.message, stepScope, params) ?? "业务规则不通过");
          throw new Error(message);
        }
        break;
      }
      case "navigate": {
        if (step.back) {
          if (props.goBack) props.goBack();
          break;
        }
        const stepParams = (evaluate(step.params, stepScope, params) ?? {}) as Record<string, unknown>;
        await navigate({
          path: step.path ? String(step.path) : null,
          pageRef: (step.pageRef ?? null) as Record<string, unknown> | null,
          params: stepParams
        });
        break;
      }
      case "openDialog":
        openDialog(String(step.dialogKey ?? ""));
        break;
      case "closeDialog":
        closeDialog(String(step.dialogKey ?? ""));
        break;
      case "apiCall": {
        const apiKey = String((step.apiRef as Record<string, unknown> | undefined)?.key ?? "");
        if (!apiKey) throw new Error("apiCall 缺少 apiRef.key");
        const stepParams = (evaluate(step.params, stepScope, params) ?? {}) as Record<
          string,
          unknown
        >;
        const result = await runtimeApi.invokePageApi(
          props.appId,
          props.view.key,
          apiKey,
          {
            params: stepParams,
            context: {
              page: {
                state,
                params: routeParams.value,
                query: routeQuery.value
              },
              route: {
                path: props.view.path ?? page.value.route?.path ?? "",
                params: routeParams.value,
                query: routeQuery.value
              },
              form: stepScope.form ?? state.form ?? {},
              row: stepScope.row ?? {},
              rows: stepScope.rows ?? [],
              data: dataSourceSnapshot(data),
              event: stepScope.event ?? {}
            }
          }
        );
        const resultPath = String(step.resultPath ?? "");
        const output = resultPath ? getPath(result, resultPath) : result;
        assignTarget(String(step.assignTo ?? ""), output, stepScope, params);
        break;
      }
      default:
        break;
    }
  }
}

async function runHandler(
  node: UINode,
  name: string,
  event: Record<string, unknown>,
  scope: RuntimeScope = {}
): Promise<void> {
  const handler = node.handlers?.[name] as Record<string, unknown> | undefined;
  if (!handler) return;
  const handlerScope: RuntimeScope = { ...scope, event: { ...(scope.event ?? {}), ...event } };
  const params = (evaluate(handler.params, handlerScope) ?? {}) as Record<string, unknown>;
  const actionRef = handler.actionRef as Record<string, unknown> | undefined;
  if (actionRef?.key) {
    const rawConfirmed = handlerScope.event?.__confirmed;
    await runAction({
      actionKey: String(actionRef.key),
      params,
      scope: handlerScope,
      confirmed: typeof rawConfirmed === "boolean" ? rawConfirmed : undefined
    });
    return;
  }
  if (Array.isArray(handler.steps)) {
    await runSteps(handler.steps as RuntimeStep[], handlerScope, params);
  }
}

function confirmStepOf(action: RuntimeActionDefinition): Record<string, unknown> | null {
  for (const step of action.steps ?? []) {
    if (step.type === "confirm") return step as unknown as Record<string, unknown>;
  }
  return null;
}

function applyState(next: Record<string, unknown> | null | undefined): void {
  if (!next || typeof next !== "object") return;
  Object.assign(state, next);
}

async function handleEvent(item: unknown): Promise<void> {
  if (!item || typeof item !== "object") return;
  const event = item as Record<string, unknown>;
  const name = String(event.event ?? "");
  const payload = event.payload;
  if (name.indexOf("ds:") === 0 && name.lastIndexOf(":refresh") === name.length - 8) {
    const id = name.slice(3, name.length - 8);
    if (id) await refreshDataSource(id, { silent: true });
    return;
  }
  if (name === "ui.toast" && payload && typeof payload === "object") {
    const toast = payload as Record<string, unknown>;
    notify(String(toast.message ?? ""), (toast.type as "success" | "warning" | "error" | "info") ?? "info");
  }
}

async function runAction(invocation: RuntimeActionInvocation): Promise<void> {
  const action = findAction(invocation.actionKey);
  if (!action) {
    notify("动作 " + invocation.actionKey + " 未在发布件中定义", "warning");
    return;
  }
  const scope = invocation.scope ?? {};
  const params = invocation.params ?? {};
  if (action.when !== undefined && !truthy(evaluate(action.when, scope, params))) return;

  let confirmed = invocation.confirmed;
  const confirmStep = confirmStepOf(action);
  if (confirmStep) {
    if (confirmed === false) {
      await runSteps(confirmStep.onCancel as RuntimeStep[] | undefined, scope, params);
      return;
    }
    if (confirmed === undefined) {
      const message = String(evaluate(confirmStep.message, scope, params) ?? "确认执行该操作？");
      const title = String(evaluate(confirmStep.title, scope, params) ?? "请确认");
      const accepted = await confirm(message, title, confirmStep.danger === true);
      if (!accepted) {
        await runSteps(confirmStep.onCancel as RuntimeStep[] | undefined, scope, params);
        return;
      }
      confirmed = true;
    }
  }

  const context = {
    user: user.value,
    tenant: { id: user.value.tenantId },
    page: { state, params: routeParams.value, query: routeQuery.value },
    route: {
      path: props.view.path ?? page.value.route?.path ?? "",
      params: routeParams.value,
      query: routeQuery.value
    },
    form: scope.form ?? {},
    row: scope.row ?? null,
    rows: scope.rows ?? null,
    data: dataSourceSnapshot(data),
    env: {
      platform: "miniapp",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      mode: "runtime",
      appVersion: props.view.version_no
    }
  };
  const event: Record<string, unknown> = { ...(scope.event ?? {}) };
  if (confirmed !== undefined) event.__confirmed = confirmed;
  try {
    const result = await runtimeApi.executeAction(props.appId, action.key, {
      params,
      context,
      event
    });
    applyState(result.state);
    for (const item of result.events ?? []) await handleEvent(item);
    if (result.status === "failed" || result.error) {
      notify(result.error?.message || "动作执行失败", "error");
      return;
    }
    if (result.status === "completed") {
      for (const step of action.steps ?? []) {
        if (step.type === "openDialog") openDialog(String(step.dialogKey ?? ""));
        else if (step.type === "closeDialog") closeDialog(String(step.dialogKey ?? ""));
        else if (step.type === "navigate") {
          if (step.back) {
            if (props.goBack) props.goBack();
            continue;
          }
          const navigateParams = (evaluate(step.params, scope, params) ?? {}) as Record<string, unknown>;
          await navigate({
            path: step.path ? String(step.path) : null,
            pageRef: (step.pageRef ?? null) as Record<string, unknown> | null,
            params: navigateParams
          });
        }
      }
    }
  } catch (cause) {
    notify(errorMessage(cause), "error");
  }
}

function openDialog(key: string): void {
  const dialog = dialogOf(key);
  if (!dialog) return;
  setExpressionValue(dialog.props?.model, true);
}

function closeDialog(key: string): void {
  const dialog = dialogOf(key);
  if (!dialog) return;
  setExpressionValue(dialog.props?.model, false);
}

function walkNodes(node: UINode, visit: (node: UINode) => void): void {
  visit(node);
  for (const list of Object.values(node.slots ?? {})) {
    for (const child of list ?? []) walkNodes(child, visit);
  }
  for (const child of node.children ?? []) walkNodes(child, visit);
}

function filtersForDataSource(id: string): ReturnType<typeof buildSearchFilters> {
  const filters: ReturnType<typeof buildSearchFilters> = [];
  walkNodes(props.view.page.layout, (node) => {
    if (node.component !== "x-search-form") return;
    if (String(node.props?.targetDataSourceId ?? "") !== id) return;
    const value = evaluate(node.props?.model);
    const model = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    filters.push(...buildSearchFilters(searchFieldsOf(node.props ?? {}), model));
  });
  return filters;
}

async function refreshComputed(): Promise<void> {
  for (const [id, config] of dataSourceConfigs.value) {
    if (config.type !== "computed") continue;
    const value = evaluate(config.expr);
    const rows = Array.isArray(value)
      ? value.map((item, index) => {
          if (item && typeof item === "object") return item as Record<string, unknown>;
          return { value: item, label: String(item), index };
        })
      : [];
    data[id] = {
      id,
      rows,
      total: rows.length,
      page: 1,
      size: Math.max(1, rows.length),
      item: null,
      loading: false,
      error: null,
      value
    };
  }
}

async function refreshDataSource(id: string, options: { silent?: boolean } = {}): Promise<void> {
  const config = dataSourceConfigs.value.get(id);
  if (!config) return;
  if (config.type === "static") {
    const raw = config.data;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    data[id] = {
      id,
      rows: rows as Record<string, unknown>[],
      total: rows.length,
      page: 1,
      size: Math.max(1, rows.length),
      item: rows.length === 1 ? (rows[0] as Record<string, unknown>) : null,
      loading: false,
      error: null,
      value: raw
    };
    return;
  }
  if (config.type === "computed") {
    await refreshComputed();
    return;
  }
  if (config.type !== "entity") {
    data[id] = {
      id,
      rows: [],
      total: 0,
      page: 1,
      size: 10,
      item: null,
      loading: false,
      error: "暂不支持 " + String(config.type) + " 数据源",
      value: null
    };
    return;
  }
  if (config.mode === "one" && config.pkParam !== undefined) {
    const pk = evaluate(config.pkParam);
    if (pk === null || pk === undefined || pk === "") {
      data[id] = {
        id,
        rows: [],
        total: 0,
        page: 1,
        size: 1,
        item: null,
        loading: false,
        error: null,
        value: null
      };
      return;
    }
  }
  const seq = (requestSeq[id] ?? 0) + 1;
  requestSeq[id] = seq;
  const previous = data[id];
  data[id] = {
    id,
    rows: previous?.rows ?? [],
    total: previous?.total ?? 0,
    page: previous?.page ?? 1,
    size: previous?.size ?? 10,
    item: previous?.item ?? null,
    loading: true,
    error: null,
    value: previous?.value ?? null
  };
  const query = (state.query && typeof state.query === "object" ? state.query : {}) as Record<string, unknown>;
  try {
    const result = await runtimeApi.queryDataSource(props.appId, props.view.key, id, {
      state,
      query: {
        page: Number(query.page ?? 1),
        size: Number(query.size ?? 10)
      },
      filters: filtersForDataSource(id),
      sort: sortState[id] ?? (Array.isArray(config.sort) ? (config.sort as DataSourceSort[]) : undefined),
      params: routeParams.value,
      data: dataSourceSnapshot(data),
      routeQuery: routeQuery.value
    });
    if (seq !== requestSeq[id]) return;
    data[id] = {
      id,
      rows: result.rows ?? [],
      total: result.total ?? 0,
      page: result.page ?? Number(query.page ?? 1),
      size: result.size ?? Number(query.size ?? 10),
      item: result.item ?? null,
      loading: false,
      error: null,
      value: result.item ?? result.rows ?? []
    };
    if (state.query && typeof state.query === "object") {
      const queryState = state.query as Record<string, unknown>;
      if (result.page) queryState.page = result.page;
      if (result.size) queryState.size = result.size;
    }
  } catch (cause) {
    if (seq !== requestSeq[id]) return;
    const message = errorMessage(cause);
    data[id] = {
      ...(data[id] ?? { id, rows: [], total: 0, page: 1, size: 10, item: null }),
      id,
      loading: false,
      error: message
    };
    if (!options.silent) notify(message, "error");
  }
}

async function refreshAll(): Promise<void> {
  const ids = Array.from(dataSourceConfigs.value.keys()).filter(
    (id) => dataSourceConfigs.value.get(id)?.type === "entity"
  );
  await Promise.all(ids.map((id) => refreshDataSource(id, { silent: true })));
}

function setDataSourceSort(id: string, sort: { field: string; direction: "asc" | "desc" } | null): void {
  sortState[id] = sort ? [{ field: sort.field, direction: sort.direction }] : null;
  void refreshDataSource(id, { silent: true });
}

async function navigate(payload: RuntimeNavigatePayload): Promise<void> {
  if (props.navigate) {
    await props.navigate(payload);
    return;
  }
  if (payload.path) {
    notify("未配置导航能力，无法跳转 " + payload.path, "warning");
  }
}

function resetState(): void {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, initialPageState((props.view.page.state ?? {}) as Record<string, unknown>));
}

function initDataSources(): void {
  for (const key of Object.keys(data)) delete data[key];
  for (const [id, config] of dataSourceConfigs.value) {
    if (config.type === "static") {
      const raw = config.data;
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      data[id] = {
        id,
        rows: rows as Record<string, unknown>[],
        total: rows.length,
        page: 1,
        size: Math.max(1, rows.length),
        item: rows.length === 1 ? (rows[0] as Record<string, unknown>) : null,
        loading: false,
        error: null,
        value: raw
      };
    } else {
      data[id] = {
        id,
        rows: [],
        total: 0,
        page: 1,
        size: 10,
        item: null,
        loading: false,
        error: null,
        value: null
      };
    }
  }
}

async function bootstrap(): Promise<void> {
  ready.value = false;
  loadError.value = "";
  resetState();
  initDataSources();
  try {
    const singleImmediate = Array.from(dataSourceConfigs.value.entries())
      .filter(([, config]) => {
        return config.type === "entity" && config.immediate === true
          && (config.mode === "one" || config.mode === "count");
      })
      .map(([id]) => id);
    await Promise.all(singleImmediate.map((id) => refreshDataSource(id, { silent: true })));
    await refreshComputed();

    if (props.view.page.kind === "form" && routeParams.value.id) {
      const editIds = Array.from(dataSourceConfigs.value.entries())
        .filter(([, config]) => config.type === "entity" && config.mode === "one" && config.immediate !== true)
        .map(([id]) => id);
      await Promise.all(editIds.map((id) => refreshDataSource(id, { silent: true })));
      const editSource = editIds.map((id) => data[id]).find((item) => item?.item);
      const form = state.form;
      if (editSource?.item && form && typeof form === "object") {
        Object.assign(form, editSource.item);
        state.editId = routeParams.value.id;
      }
    }

    const handlers = (props.view.page.handlers ?? {}) as Record<string, unknown>;
    const onLoad = handlers.onLoad as { steps?: RuntimeStep[] } | undefined;
    if (onLoad?.steps?.length) await runSteps(onLoad.steps, {});
    await refreshComputed();

    const pageImmediate = Array.from(dataSourceConfigs.value.entries())
      .filter(([, config]) => config.type === "entity" && config.immediate === true && config.mode !== "one" && config.mode !== "count")
      .map(([id]) => id);
    await Promise.all(pageImmediate.map((id) => refreshDataSource(id, { silent: true })));
  } catch (cause) {
    loadError.value = errorMessage(cause);
  } finally {
    ready.value = true;
  }
}

const api: RuntimeContextApi = {
  appId: props.appId,
  view: props.view,
  page: props.view.page,
  components: props.view.components ?? [],
  get state() {
    return state;
  },
  get data() {
    return data;
  },
  get user() {
    return user.value;
  },
  get routeParams() {
    return routeParams.value;
  },
  get routeQuery() {
    return routeQuery.value;
  },
  evaluate,
  visible,
  disabled,
  permitted,
  runHandler,
  runSteps,
  runAction,
  refreshDataSource,
  refreshAll,
  setDataSourceSort,
  openDialog,
  closeDialog,
  navigate,
  setExpressionValue,
  findAction,
  dialogOf,
  confirm,
  notify
};

provide(RUNTIME_CONTEXT, api);

onMounted(() => {
  void bootstrap();
});

watch(
  () => props.view.key + ":" + JSON.stringify(routeParams.value),
  () => {
    void bootstrap();
  }
);
</script>

<template>
  <view class="runtime-page">
    <view v-if="!ready" class="runtime-loading">正在初始化运行时数据…</view>
    <template v-else>
      <view v-if="loadError" class="runtime-alert">{{ loadError }}</view>
      <RuntimeNodeRenderer :node="view.page.layout" />
      <RuntimeNodeRenderer
        v-for="(dialog, key) in dialogs"
        :key="key"
        :node="dialog"
        :dialog-key="String(key)"
      />
    </template>
  </view>
</template>

<style scoped>
.runtime-page {
  min-width: 0;
}
.runtime-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 480rpx;
  color: #94a3b8;
  font-size: 25rpx;
}
.runtime-alert {
  margin-bottom: 20rpx;
  padding: 20rpx 24rpx;
  border: 1rpx solid #fecdd3;
  border-radius: 16rpx;
  background: #fff1f2;
  color: #be123c;
  font-size: 24rpx;
  line-height: 1.5;
}
</style>
