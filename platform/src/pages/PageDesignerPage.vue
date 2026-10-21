<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformApi } from "@/api/platform";
import { ApiError, errorMessage } from "@/lib/http";
import { formatDateTime, prettyJson } from "@/lib/format";
import { ulid } from "@/lib/ulid";
import UiNodeRenderer from "@/components/preview/UiNodeRenderer.vue";
import NodeOutline from "@/components/designer/NodeOutline.vue";
import PageHandlersPanel from "@/components/designer/PageHandlersPanel.vue";
import {
  COMPONENTS,
  PAGE_KINDS,
  WIDGET_COMPONENTS,
  allNodes,
  registerCustomComponents,
  appendNode,
  canAccept,
  cloneJson,
  componentGroups,
  componentOf,
  containerTarget,
  createNode,
  createStarterPage,
  entityRefOf,
  findEntity,
  findNode,
  findNodeLocation,
  moveNode,
  pageKindLabel,
  regenerateIds,
  removeNode,
  sanitizeKey,
  textOf,
  titleOfPage,
  uniqueKey,
  validateUiSchemas,
  widgetForField
} from "@/lib/uiModel";
import { componentGroupsOf, normalizeComponent } from "@/lib/componentModel";
import type { DataEntity, DataField, DataSchema } from "@/types/dataModel";
import type {
  ComponentDef,
  ComponentPropDef,
  PageDataSource,
  PageKind,
  UINode,
  UISchema,
  UiIssue
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
const pages = ref<UISchema[]>([]);
const savedSnapshot = ref("[]");
const loading = ref(true);
const saving = ref(false);
const reloading = ref(false);

const activePageId = ref<string | null>(null);
const selectedNodeId = ref<string | null>(null);
const activePanel = ref<"props" | "page" | "data" | "outline">("props");
const device = ref<"desktop" | "tablet" | "mobile">("desktop");
const paletteQuery = ref("");

const issuesOpen = ref(false);
const jsonOpen = ref(false);
const nodeJsonOpen = ref(false);
const nodeJsonText = ref("");
const nodeJsonError = ref("");
const propJsonOpen = ref(false);
const propJsonKey = ref("");
const propJsonText = ref("");
const propJsonError = ref("");

const publishOpen = ref(false);
const publishing = ref(false);
const publishMessage = ref("");
const publishForce = ref(false);

const newPageOpen = ref(false);
const newPageForm = reactive({
  key: "",
  title: "",
  kind: "list" as PageKind,
  entityKey: ""
});
const newPageError = ref("");

const dataSourceOpen = ref(false);
const dataSourceForm = reactive({
  id: "",
  type: "entity" as PageDataSource["type"],
  name: "",
  entityKey: "",
  mode: "page" as NonNullable<PageDataSource["mode"]>
});
const dataSourceError = ref("");

const dataSchemas = computed<DataSchema[]>(() => {
  const raw = bundle.value?.artifacts?.dataSchemas;
  return Array.isArray(raw) ? (raw as DataSchema[]) : [];
});

const customComponents = computed<ComponentDef[]>(() => {
  const raw = bundle.value?.artifacts?.components;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ComponentDef => !!item && typeof item === "object")
    .map(normalizeComponent);
});

const customComponentNames = computed<string[]>(() =>
  customComponents.value.map((item) => item.name).filter(Boolean)
);

const allComponents = computed<ComponentDef[]>(() => {
  const seen = new Set(COMPONENTS.map((item) => item.name));
  return [...COMPONENTS, ...customComponents.value.filter((item) => !seen.has(item.name))];
});

const actionOptions = computed<Array<{ key: string; name?: string }>>(() => {
  const schemas = bundle.value?.artifacts?.logicSchemas;
  if (!Array.isArray(schemas)) return [];
  return schemas.flatMap((schema) => {
    const actions = (schema as Record<string, unknown> | null)?.actions;
    if (!Array.isArray(actions)) return [];
    return actions
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({ key: String(item.key ?? ""), name: item.name ? String(item.name) : undefined }))
      .filter((item) => item.key);
  });
});

const entityOptions = computed(() =>
  dataSchemas.value.flatMap((schema) =>
    schema.entities.map((entity) => ({
      label: `${schema.name} / ${entity.name}`,
      key: entity.key,
      entity
    }))
  )
);

const activePage = computed<UISchema | null>(
  () => pages.value.find((page) => page.id === activePageId.value) ?? null
);

const selectedNode = computed<UINode | null>(() => {
  if (!activePage.value || !selectedNodeId.value) return null;
  return findNode(activePage.value.layout, selectedNodeId.value);
});

const selectedDef = computed<ComponentDef | null>(() =>
  selectedNode.value ? componentOf(selectedNode.value.component) : null
);

const nodeProps = computed<Record<string, unknown>>(() => selectedNode.value?.props ?? {});

const issues = computed<UiIssue[]>(() =>
  validateUiSchemas(pages.value, dataSchemas.value, customComponents.value)
);
const errorCount = computed(() => issues.value.filter((issue) => issue.level === "error").length);
const warningCount = computed(() => issues.value.filter((issue) => issue.level === "warning").length);

const dirty = computed(() => JSON.stringify(pages.value) !== savedSnapshot.value);

const pageNodeCount = computed(() => (activePage.value ? allNodes(activePage.value.layout).length : 0));

const deviceWidth = computed(() => {
  if (device.value === "tablet") return "820px";
  if (device.value === "mobile") return "430px";
  return "100%";
});

const widgetComponents = computed<ComponentDef[]>(() =>
  allComponents.value.filter((component) => component.kind === "field")
);

const paletteGroups = computed(() => {
  const groups = componentGroupsOf(allComponents.value);
  const query = paletteQuery.value.trim().toLowerCase();
  if (!query) return groups;
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (component) =>
          component.name.toLowerCase().includes(query) ||
          textOf(component.title).toLowerCase().includes(query)
      )
    }))
    .filter((group) => group.items.length);
});

const simpleProps = computed<ComponentPropDef[]>(() =>
  (selectedDef.value?.props ?? []).filter(
    (prop) =>
      !prop.advanced &&
      !["fieldList", "columnList", "searchFieldList", "buttonList", "optionList"].includes(prop.type)
  )
);

const advancedProps = computed<ComponentPropDef[]>(() =>
  (selectedDef.value?.props ?? []).filter(
    (prop) =>
      prop.advanced &&
      !["fieldList", "columnList", "searchFieldList", "buttonList", "optionList"].includes(prop.type)
  )
);

const listProps = computed<ComponentPropDef[]>(() =>
  (selectedDef.value?.props ?? []).filter((prop) =>
    ["fieldList", "columnList", "searchFieldList", "buttonList", "optionList"].includes(prop.type)
  )
);

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

function applyDraft(next: DraftView, preserve = true) {
  const previousId = activePageId.value;
  draft.value = next;
  bundle.value = next.bundle ?? bundle.value ?? defaultBundle();
  if (!bundle.value.artifacts) bundle.value.artifacts = {};
  const raw = bundle.value.artifacts.uiSchemas;
  pages.value = Array.isArray(raw) ? cloneJson(raw as UISchema[]) : [];
  savedSnapshot.value = JSON.stringify(pages.value);
  registerCustomComponents(customComponents.value);

  if (preserve && previousId && pages.value.some((page) => page.id === previousId)) {
    activePageId.value = previousId;
    return;
  }
  const routeKey = typeof route.params.pageKey === "string" ? route.params.pageKey : "";
  const byRoute = routeKey ? pages.value.find((page) => page.key === routeKey) : null;
  activePageId.value = byRoute?.id ?? pages.value[0]?.id ?? null;
  selectedNodeId.value = pages.value.find((page) => page.id === activePageId.value)?.layout.id ?? null;
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
      await ElMessageBox.confirm(
        "当前页面有未保存的修改，重新加载会丢弃这些修改。",
        "重新加载草稿",
        { type: "warning", confirmButtonText: "丢弃并加载", cancelButtonText: "取消" }
      );
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
      "草稿已被其他人修改。加载最新草稿会覆盖当前编辑内容，建议先导出 JSON 备份。",
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
    const nextBundle = cloneJson(bundle.value ?? defaultBundle());
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.uiSchemas = cloneJson(pages.value);
    const next = await platformApi.saveDraft(appId.value, nextBundle, draft.value.revision);
    applyDraft(next);
    app.value = await platformApi.getApp(appId.value);
    if (!silent) ElMessage.success(`页面已保存 · r${next.revision}`);
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
  publishMessage.value = publishMessage.value || `更新页面：${activePage.value ? titleOfPage(activePage.value) : ""}`;
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
    nextBundle.artifacts.uiSchemas = cloneJson(pages.value);
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
function goBack() {
  router.push(`/apps/${appId.value}`);
}

function selectPage(page: UISchema) {
  activePageId.value = page.id;
  selectedNodeId.value = page.layout.id;
  activePanel.value = "props";
  router.replace({ name: "app-pages", params: { appId: appId.value, pageKey: page.key } });
}

function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId;
  activePanel.value = "props";
}

function onPageSelectChange(pageId: string) {
  const page = pages.value.find((item) => item.id === pageId);
  if (page) selectPage(page);
}

function openNewPage() {
  const entity = entityOptions.value[0];
  newPageForm.key = uniqueKey(pages.value.map((page) => page.key), "page_new");
  newPageForm.title = "新建页面";
  newPageForm.kind = "list";
  newPageForm.entityKey = entity?.key ?? "";
  newPageError.value = "";
  newPageOpen.value = true;
}

function submitNewPage() {
  const key = sanitizeKey(newPageForm.key);
  const title = newPageForm.title.trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) {
    newPageError.value = "页面 key 必须是小写 snake_case";
    return;
  }
  if (pages.value.some((page) => page.key === key)) {
    newPageError.value = "页面 key 已存在";
    return;
  }
  if (!title) {
    newPageError.value = "页面标题不能为空";
    return;
  }
  const page = createStarterPage(
    newPageForm.kind,
    key,
    title,
    dataSchemas.value,
    newPageForm.entityKey || undefined
  );
  pages.value.push(page);
  newPageOpen.value = false;
  activePageId.value = page.id;
  selectedNodeId.value = page.layout.id;
  router.replace({ name: "app-pages", params: { appId: appId.value, pageKey: page.key } });
  ElMessage.success("页面已创建，记得保存草稿");
}

async function deletePage(page: UISchema) {
  try {
    await ElMessageBox.confirm(
      `确认删除页面「${titleOfPage(page)}」？删除后需要重新搭建。`,
      "删除页面",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  const index = pages.value.findIndex((item) => item.id === page.id);
  pages.value.splice(index, 1);
  const next = pages.value[index] ?? pages.value[index - 1] ?? null;
  activePageId.value = next?.id ?? null;
  selectedNodeId.value = next?.layout.id ?? null;
  if (next) {
    router.replace({ name: "app-pages", params: { appId: appId.value, pageKey: next.key } });
  } else {
    router.replace({ name: "app-pages", params: { appId: appId.value } });
  }
}

function duplicatePage(page: UISchema) {
  const key = uniqueKey(pages.value.map((item) => item.key), `${page.key}_copy`);
  const copy = cloneJson(page);
  copy.id = ulid();
  copy.key = key;
  copy.title = { default: `${titleOfPage(page)} 副本` };
  copy.route = { ...copy.route, path: `/${key.replace(/_/g, "-")}`, name: `${key}_page` };
  copy.layout = regenerateIds(page.layout);
  pages.value.push(copy);
  selectPage(copy);
}

function setPageTitle(value: string) {
  if (!activePage.value) return;
  const current = activePage.value.title;
  activePage.value.title =
    current && typeof current === "object" ? { ...current, default: value } : { default: value };
}

function setPageDescription(value: string) {
  if (!activePage.value) return;
  activePage.value.description = value;
}

function setPageKind(value: PageKind) {
  if (!activePage.value) return;
  activePage.value.kind = value;
}

function setPageKey(value: string) {
  if (!activePage.value) return;
  const key = sanitizeKey(value);
  if (pages.value.some((page) => page !== activePage.value && page.key === key)) {
    ElMessage.warning("页面 key 已存在");
    return;
  }
  activePage.value.key = key;
  if (activePage.value.route.path.startsWith("/")) {
    router.replace({ name: "app-pages", params: { appId: appId.value, pageKey: key } });
  }
}

function setRouteField(field: string, value: unknown) {
  if (!activePage.value) return;
  (activePage.value.route as unknown as Record<string, unknown>)[field] = value;
}

function generateRouteFromKey() {
  if (!activePage.value) return;
  activePage.value.route.path = `/${activePage.value.key.replace(/_/g, "-")}`;
}

function setRouteRoles(value: string) {
  if (!activePage.value) return;
  activePage.value.route.roles = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setPageSemanticIntent(value: string) {
  if (!activePage.value) return;
  activePage.value.semantic = { ...(activePage.value.semantic ?? {}), intent: value };
}

function addComponent(name: string) {
  const page = activePage.value;
  if (!page) {
    ElMessage.warning("请先创建页面");
    return;
  }
  const target = containerTarget(page.layout, selectedNodeId.value);
  if (!canAccept(target, name)) {
    ElMessage.warning(`${target.component} 不能容纳 ${name}`);
    return;
  }
  const node = createNode(name);
  const entity = entityOptions.value[0]?.entity;
  if (entity) applyEntityBinding(node, entity, page);
  appendNode(page.layout, target.id, node);
  selectedNodeId.value = node.id;
  activePanel.value = "props";
}

function applyEntityBinding(node: UINode, entity: DataEntity, page: UISchema) {
  node.props = node.props ?? {};
  const ref = entityRefOf(entity);
  const sourceId = (page.dataSources ?? [])[0]?.id;

  switch (node.component) {
    case "x-table":
      node.props.entityRef = cloneJson(ref);
      node.props.columnList = entity.fields
        .filter((field) => !field.uiHints?.hideInList && field.key !== "id")
        .slice(0, 8)
        .map((field) => ({
          field: field.key,
          label: field.label,
          width: field.type === "datetime" ? "160" : field.type === "text" ? "220" : "120",
          widget: widgetForField(field),
          ...(field.enumRef ? { enumRef: cloneJson(field.enumRef) } : {})
        }));
      if (sourceId && !node.props.dataSourceId) node.props.dataSourceId = sourceId;
      break;
    case "x-form":
      node.props.entityRef = cloneJson(ref);
      node.props.fieldList = entity.fields.map((field) => ({
        field: field.key,
        label: field.label,
        span: field.type === "text" || field.type === "file" ? 24 : 12,
        required: !!field.required,
        widget: widgetForField(field),
        ...(field.enumRef ? { enumRef: cloneJson(field.enumRef) } : {})
      }));
      break;
    case "x-search-form": {
      node.props.entityRef = cloneJson(ref);
      const selected = entity.fields.filter((field) => field.searchable);
      const fallback = entity.fields.filter((field) =>
        ["string", "enum", "date", "datetime"].includes(field.type)
      );
      node.props.searchFieldList = (selected.length ? selected : fallback).slice(0, 5).map((field) => ({
        field: field.key,
        label: field.label,
        op: field.type === "string" ? "like" : field.type === "date" || field.type === "datetime" ? "between" : "in",
        span: 5,
        widget: widgetForField(field)
      }));
      if (sourceId && !node.props.targetDataSourceId) node.props.targetDataSourceId = sourceId;
      break;
    }
    case "x-descriptions":
      node.props.entityRef = cloneJson(ref);
      node.props.fieldList = entity.fields.slice(0, 8).map((field) => ({
        field: field.key,
        label: field.label
      }));
      if (sourceId && !node.props.dataSourceId) node.props.dataSourceId = sourceId;
      break;
    default: {
      const hasEntityProp = (componentOf(node.component)?.props ?? []).some(
        (prop) => prop.key === "entityRef"
      );
      if (hasEntityProp) node.props.entityRef = cloneJson(ref);
      break;
    }
  }
}

function setEntityRefProp(key: string, entityKey: string) {
  if (!selectedNode.value) return;
  if (!entityKey) {
    delete selectedNode.value.props?.[key];
    return;
  }
  const entity = dataSchemas.value
    .flatMap((schema) => schema.entities)
    .find((item) => item.key === entityKey);
  if (!entity) return;

  if (key === "entityRef" && activePage.value) {
    applyEntityBinding(selectedNode.value, entity, activePage.value);
    return;
  }
  selectedNode.value.props = selectedNode.value.props ?? {};
  selectedNode.value.props[key] = entityRefOf(entity);
}

function setProp(key: string, value: unknown) {
  if (!selectedNode.value) return;
  if (!selectedNode.value.props) selectedNode.value.props = {};
  if (value === "" || value === undefined || value === null) {
    delete selectedNode.value.props[key];
  } else {
    selectedNode.value.props[key] = value;
  }
}

function propLabel(prop: ComponentPropDef): string {
  return textOf(prop.label) || prop.key;
}

function propValue(prop: ComponentPropDef): unknown {
  return nodeProps.value[prop.key];
}

function enumOptions(prop: ComponentPropDef): Array<{ value: string; label: string }> {
  return (prop.enum ?? []).map((value) => {
    const key = String(value);
    const label = prop.enumLabels?.[key];
    return { value: key, label: textOf(label) || key };
  });
}

function isJsonProp(prop: ComponentPropDef): boolean {
  return ["json", "expr", "object", "array"].includes(prop.type);
}

function jsonPreview(prop: ComponentPropDef): string {
  const value = propValue(prop);
  if (value === undefined) return "未设置";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function openPropJson(prop: ComponentPropDef) {
  propJsonKey.value = prop.key;
  const value = propValue(prop);
  propJsonText.value = value === undefined ? "" : JSON.stringify(value, null, 2);
  propJsonError.value = "";
  propJsonOpen.value = true;
}

function savePropJson() {
  propJsonError.value = "";
  if (!propJsonText.value.trim()) {
    setProp(propJsonKey.value, undefined);
    propJsonOpen.value = false;
    return;
  }
  try {
    const parsed = JSON.parse(propJsonText.value);
    setProp(propJsonKey.value, parsed);
    propJsonOpen.value = false;
  } catch (error) {
    propJsonError.value = error instanceof Error ? error.message : "JSON 解析失败";
  }
}

function openNodeJson() {
  if (!selectedNode.value) return;
  nodeJsonText.value = prettyJson(selectedNode.value);
  nodeJsonError.value = "";
  nodeJsonOpen.value = true;
}

function saveNodeJson() {
  if (!activePage.value || !selectedNode.value) return;
  nodeJsonError.value = "";
  try {
    const parsed = JSON.parse(nodeJsonText.value) as UINode;
    if (!parsed.id || !parsed.component) throw new Error("节点必须包含 id 与 component");
    if (parsed.id !== selectedNode.value.id && findNode(activePage.value.layout, parsed.id)) {
      throw new Error("节点 id 已存在");
    }
    const location = findNodeLocation(activePage.value.layout, selectedNode.value.id);
    if (!location) throw new Error("节点不存在");
    location.list[location.index] = parsed;
    selectedNodeId.value = parsed.id;
    nodeJsonOpen.value = false;
  } catch (error) {
    nodeJsonError.value = error instanceof Error ? error.message : "节点 JSON 无效";
  }
}

function deleteSelectedNode() {
  const page = activePage.value;
  const node = selectedNode.value;
  if (!page || !node) return;
  if (node.id === page.layout.id) {
    ElMessage.warning("根节点不能删除");
    return;
  }
  const parent = findNodeLocation(page.layout, node.id)?.parent;
  removeNode(page.layout, node.id);
  selectedNodeId.value = parent?.id ?? page.layout.id;
}

function duplicateSelectedNode() {
  const page = activePage.value;
  const node = selectedNode.value;
  if (!page || !node || node.id === page.layout.id) return;
  const location = findNodeLocation(page.layout, node.id);
  if (!location) return;
  const copy = regenerateIds(node);
  location.list.splice(location.index + 1, 0, copy);
  selectedNodeId.value = copy.id;
}

function moveSelectedNode(delta: number) {
  const page = activePage.value;
  const node = selectedNode.value;
  if (!page || !node) return;
  if (!moveNode(page.layout, node.id, delta)) {
    ElMessage.info("已经到达边界");
  }
}

const editorEntity = computed<DataEntity | null>(() => findEntity(dataSchemas.value, nodeProps.value.entityRef));
const editorFields = computed<DataField[]>(() => editorEntity.value?.fields ?? []);

function listOf(prop: ComponentPropDef): Record<string, unknown>[] {
  const value = nodeProps.value[prop.key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function itemValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return value === undefined || value === null ? "" : String(value);
}

function setItemValue(item: Record<string, unknown>, key: string, value: unknown) {
  if (value === "" || value === undefined) delete item[key];
  else item[key] = value;
}

function addListItem(prop: ComponentPropDef) {
  if (!selectedNode.value) return;
  const items = listOf(prop);
  if (!Array.isArray(selectedNode.value.props?.[prop.key])) {
    selectedNode.value.props = selectedNode.value.props ?? {};
    selectedNode.value.props[prop.key] = [];
    items.length = 0;
  }
  const used = new Set(items.map((item) => String(item.field ?? "")));
  const field =
    editorFields.value.find((item) => !used.has(item.key) && item.key !== "id") ??
    editorFields.value[0] ??
    null;
  let next: Record<string, unknown>;
  if (prop.type === "columnList") {
    next = {
      field: field?.key ?? "field",
      label: field?.label ?? "字段",
      width: field?.type === "datetime" ? "160" : "120",
      widget: field ? widgetForField(field) : "x-text"
    };
  } else if (prop.type === "fieldList") {
    next = {
      field: field?.key ?? "field",
      label: field?.label ?? "字段",
      span: 12,
      required: !!field?.required,
      widget: field ? widgetForField(field) : "x-input"
    };
  } else if (prop.type === "searchFieldList") {
    next = {
      field: field?.key ?? "field",
      label: field?.label ?? "字段",
      op: "like",
      span: 5,
      widget: field ? widgetForField(field) : "x-input"
    };
  } else if (prop.type === "buttonList") {
    next = { text: "按钮", type: "default" };
  } else {
    next = { value: "value", label: "选项" };
  }
  items.push(next);
}

function removeListItem(prop: ComponentPropDef, index: number) {
  listOf(prop).splice(index, 1);
}

function moveListItem(prop: ComponentPropDef, index: number, delta: number) {
  const items = listOf(prop);
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(next, 0, item);
}

function pickFieldForItem(item: Record<string, unknown>, fieldKey: string) {
  const field = editorFields.value.find((entry) => entry.key === fieldKey);
  item.field = fieldKey;
  if (field) {
    item.label = field.label;
    if (!item.widget) item.widget = widgetForField(field);
    if (field.enumRef) item.enumRef = cloneJson(field.enumRef);
    else delete item.enumRef;
    if (field.required && item.required === undefined) item.required = true;
  }
}

function openNewDataSource() {
  const page = activePage.value;
  if (!page) return;
  dataSourceForm.id = uniqueKey((page.dataSources ?? []).map((source) => source.id), "ds_main");
  dataSourceForm.type = "entity";
  dataSourceForm.name = "业务数据";
  dataSourceForm.entityKey = entityOptions.value[0]?.key ?? "";
  dataSourceForm.mode = "page";
  dataSourceError.value = "";
  dataSourceOpen.value = true;
}

function submitDataSource() {
  const page = activePage.value;
  if (!page) return;
  dataSourceError.value = "";
  const id = sanitizeKey(dataSourceForm.id);
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(id)) {
    dataSourceError.value = "数据源 id 必须是小写 snake_case";
    return;
  }
  if ((page.dataSources ?? []).some((source) => source.id === id)) {
    dataSourceError.value = "数据源 id 已存在";
    return;
  }
  if (dataSourceForm.type === "entity" && !dataSourceForm.entityKey) {
    dataSourceError.value = "实体数据源必须选择实体";
    return;
  }
  const source: PageDataSource = {
    id,
    type: dataSourceForm.type,
    name: dataSourceForm.name.trim() || id,
    immediate: true
  };
  if (dataSourceForm.type === "entity") {
    const entity = entityOptions.value.find((item) => item.key === dataSourceForm.entityKey)?.entity;
    if (entity) {
      source.entityRef = entityRefOf(entity);
      source.mode = dataSourceForm.mode;
    }
  } else if (dataSourceForm.type === "static") {
    source.data = [];
  } else {
    source.mode = dataSourceForm.mode;
  }
  if (!page.dataSources) page.dataSources = [];
  page.dataSources.push(source);
  dataSourceOpen.value = false;
}

function removeDataSource(source: PageDataSource) {
  const page = activePage.value;
  if (!page) return;
  const used = allNodes(page.layout).some(
    (node) => node.props?.dataSourceId === source.id || node.props?.targetDataSourceId === source.id
  );
  if (used) {
    ElMessage.warning("该数据源仍被组件引用，请先解除绑定");
    return;
  }
  page.dataSources = (page.dataSources ?? []).filter((item) => item.id !== source.id);
}

function setDataSourceEntity(source: PageDataSource, entityKey: string) {
  const entity = entityOptions.value.find((item) => item.key === entityKey)?.entity;
  if (!entity) return;
  source.entityRef = entityRefOf(entity);
}

function dataSourceOptions(): Array<{ id: string; label: string }> {
  return (activePage.value?.dataSources ?? []).map((source) => ({
    id: source.id,
    label: `${source.name ?? source.id} · ${source.type}`
  }));
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(prettyJson(pages.value));
    ElMessage.success("已复制到剪贴板");
  } catch {
    ElMessage.warning("浏览器拒绝了剪贴板访问");
  }
}

function nodeKindLabel(component: ComponentDef | null): string {
  return component?.kind ?? "unknown";
}

watch(
  () => route.params.pageKey,
  (key) => {
    if (typeof key !== "string" || !key) return;
    const page = pages.value.find((item) => item.key === key);
    if (page && page.id !== activePageId.value) {
      activePageId.value = page.id;
      selectedNodeId.value = page.layout.id;
    }
  }
);

watch(activePageId, () => {
  const page = activePage.value;
  if (!page) return;
  if (!selectedNodeId.value || !findNode(page.layout, selectedNodeId.value)) {
    selectedNodeId.value = page.layout.id;
  }
});

onMounted(load);
</script>
<template>
  <div class="mx-auto max-w-[1680px]">
    <button
      class="mb-4 flex items-center gap-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-700"
      @click="goBack"
    >
      <span>←</span> 应用详情
    </button>

    <div v-if="loading" class="rounded-2xl border border-slate-200 bg-white p-10">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else-if="app">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div
            class="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-indigo-200"
          >
            {{ app.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-[21px] font-semibold tracking-tight text-slate-900">{{ app.name }} · 页面设计器</h1>
              <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">可视化搭建</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span class="font-mono">{{ app.key }}</span>
              <span>·</span>
              <span>当前版本 {{ app.current_version ? `v${app.current_version}` : "未发布" }}</span>
              <span>·</span>
              <span>草稿 r{{ draft?.revision ?? app.draft_revision }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
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

      <div class="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3">
        <span class="text-[11.5px] font-medium text-slate-500">页面</span>
        <el-select
          :model-value="activePageId"
          class="!w-[260px]"
          placeholder="选择页面"
          :disabled="!pages.length"
          @update:model-value="onPageSelectChange"
        >
          <el-option
            v-for="page in pages"
            :key="page.id"
            :label="`${titleOfPage(page)} · ${pageKindLabel(page.kind)}`"
            :value="page.id"
          />
        </el-select>
        <el-button text size="small" @click="openNewPage">+ 新建页面</el-button>

        <span v-if="activePage" class="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
          {{ activePage.route.path }}
        </span>

        <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />

        <span
          class="inline-flex items-center gap-1.5 text-[11.5px]"
          :class="dirty ? 'text-amber-600' : 'text-slate-400'"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="dirty ? 'bg-amber-500' : 'bg-emerald-400'" />
          {{ dirty ? "有未保存修改" : "已与服务端同步" }}
        </span>
        <span class="text-[11.5px] text-slate-300">·</span>
        <span class="text-[11.5px] text-slate-400">最近保存 {{ formatDateTime(app.draft_updated_at) }}</span>

        <div class="ml-auto flex items-center gap-2 text-[11.5px] text-slate-400">
          <span class="rounded-md bg-slate-100 px-2 py-1">页面 {{ pages.length }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">节点 {{ pageNodeCount }}</span>
          <span
            class="rounded-md px-2 py-1"
            :class="errorCount ? 'bg-rose-50 text-rose-600' : warningCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'"
          >
            {{ errorCount ? `${errorCount} 错误` : warningCount ? `${warningCount} 提示` : "校验通过" }}
          </span>
        </div>
      </div>

      <div v-if="!pages.length" class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-2xl text-indigo-500">▦</div>
        <h2 class="mt-4 text-[16px] font-semibold text-slate-800">创建第一个页面</h2>
        <p class="mx-auto mt-2 max-w-lg text-[12.5px] leading-relaxed text-slate-500">
          选择列表页、表单页或审批页模板，平台会按数据模型自动生成组件与字段绑定，再在画布上继续调整。
        </p>
        <el-button class="mt-5" type="primary" @click="openNewPage">新建页面</el-button>
      </div>

      <div v-else class="mt-4 grid items-start gap-3 xl:grid-cols-[228px_minmax(0,1fr)_340px]">
        <aside class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div class="border-b border-slate-100 px-3 py-2.5">
            <p class="text-[12.5px] font-medium text-slate-700">组件</p>
            <p class="mt-0.5 text-[10.5px] text-slate-400">点击添加到选中容器</p>
            <el-input v-model="paletteQuery" size="small" placeholder="搜索组件" clearable class="mt-2" />
          </div>
          <div class="scroll-thin max-h-[760px] space-y-2 overflow-auto p-2">
            <div v-for="group in paletteGroups" :key="group.label">
              <p class="px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-slate-300">
                {{ group.label }}
              </p>
              <button
                v-for="component in group.items"
                :key="component.name"
                class="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-indigo-50/70"
                @click="addComponent(component.name)"
              >
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] font-medium text-slate-500 group-hover:bg-white group-hover:text-indigo-600">
                  {{ textOf(component.title).slice(0, 1) }}
                </span>
                <span class="truncate text-[12px] text-slate-600 group-hover:text-indigo-700">{{ textOf(component.title) }}</span>
                <span class="ml-auto shrink-0 font-mono text-[9px] text-slate-300">{{ component.name }}</span>
              </button>
            </div>
          </div>
        </aside>

        <section class="min-w-0">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-slate-200 bg-white px-3 py-2">
            <div class="flex items-center gap-2 text-[11.5px] text-slate-500">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              画布
              <span class="text-slate-300">/</span>
              <span class="font-mono text-[10.5px] text-slate-400">{{ activePage?.route.path }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10.5px] text-slate-400">点击组件选中 · 左侧添加</span>
              <div class="flex rounded-lg bg-slate-100 p-0.5">
                <button
                  v-for="option in [
                    { key: 'desktop', label: '桌面' },
                    { key: 'tablet', label: '平板' },
                    { key: 'mobile', label: '手机' }
                  ]"
                  :key="option.key"
                  class="rounded-md px-2 py-1 text-[10.5px] transition"
                  :class="device === option.key ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'"
                  @click="device = option.key as 'desktop' | 'tablet' | 'mobile'"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
          <div class="rounded-b-2xl border border-slate-200 bg-[#eef2f7] p-4">
            <div
              class="mx-auto overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-200"
              :style="{ width: deviceWidth, maxWidth: '100%' }"
            >
              <UiNodeRenderer
                v-if="activePage"
                :node="activePage.layout"
                :page="activePage"
                :schemas="dataSchemas"
                :selected-id="selectedNodeId"
                @select="selectNode"
              />
            </div>
          </div>
        </section>

        <aside class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div class="flex items-center gap-1 border-b border-slate-100 px-2 py-2">
            <button
              v-for="tab in [
                { key: 'props', label: '属性' },
                { key: 'page', label: '页面' },
                { key: 'data', label: '数据源' },
                { key: 'outline', label: '结构' }
              ]"
              :key="tab.key"
              class="rounded-lg px-2.5 py-1.5 text-[11.5px] transition"
              :class="activePanel === tab.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'"
              :data-panel="tab.key"
              @click="activePanel = tab.key as 'props' | 'page' | 'data' | 'outline'"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="scroll-thin max-h-[760px] overflow-auto p-3">
            <!-- 属性面板 -->
            <div v-if="activePanel === 'props'">
              <div v-if="!selectedNode" class="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-[11.5px] text-slate-400">
                在画布中选择一个组件
              </div>
              <template v-else>
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-[12.5px] font-medium text-slate-800">
                      {{ textOf(selectedDef?.title) || selectedNode.component }}
                    </p>
                    <p class="mt-0.5 font-mono text-[10px] text-slate-400">
                      {{ selectedNode.component }} · {{ nodeKindLabel(selectedDef) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-1">
                    <el-button text size="small" @click="moveSelectedNode(-1)">↑</el-button>
                    <el-button text size="small" @click="moveSelectedNode(1)">↓</el-button>
                    <el-button text size="small" @click="duplicateSelectedNode">复制</el-button>
                    <el-button text size="small" type="danger" @click="deleteSelectedNode">删除</el-button>
                  </div>
                </div>

                <div class="mt-3 space-y-1">
                  <div class="flex items-center justify-between text-[10.5px] text-slate-400">
                    <span>节点 ID</span>
                    <span class="font-mono">{{ selectedNode.id }}</span>
                  </div>
                  <el-input
                    :model-value="selectedNode.key ?? ''"
                    size="small"
                    placeholder="语义 key（可选）"
                    @update:model-value="selectedNode.key = $event || undefined"
                  />
                </div>

                <div class="mt-3 flex items-center justify-between">
                  <p class="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">组件属性</p>
                  <el-button text size="small" @click="openNodeJson">节点 JSON</el-button>
                </div>

                <div class="mt-2 space-y-3">
                  <div v-for="prop in simpleProps" :key="prop.key">
                    <label class="mb-1 flex items-center gap-1 text-[11px] text-slate-500">
                      {{ propLabel(prop) }}
                      <span v-if="prop.required" class="text-rose-500">*</span>
                      <span v-if="prop.bindable" class="rounded bg-slate-100 px-1 text-[9px] text-slate-400">可绑定</span>
                    </label>

                    <el-switch
                      v-if="prop.type === 'boolean'"
                      :model-value="!!propValue(prop)"
                      size="small"
                      @update:model-value="setProp(prop.key, $event)"
                    />
                    <el-input-number
                      v-else-if="prop.type === 'integer' || prop.type === 'number'"
                      :model-value="Number(propValue(prop) ?? prop.defaultValue ?? 0)"
                      size="small"
                      class="!w-full"
                      :min="prop.min"
                      :max="prop.max"
                      @update:model-value="setProp(prop.key, $event)"
                    />
                    <el-select
                      v-else-if="prop.type === 'enum'"
                      :model-value="String(propValue(prop) ?? prop.defaultValue ?? '')"
                      size="small"
                      clearable
                      class="w-full"
                      @update:model-value="setProp(prop.key, $event)"
                    >
                      <el-option v-for="option in enumOptions(prop)" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                    <el-select
                      v-else-if="prop.type === 'entityRef'"
                      :model-value="String((propValue(prop) as Record<string, unknown> | undefined)?.key ?? '')"
                      size="small"
                      clearable
                      filterable
                      placeholder="选择实体"
                      class="w-full"
                      @update:model-value="setEntityRefProp(prop.key, String($event ?? ''))"
                    >
                      <el-option v-for="option in entityOptions" :key="option.key" :label="option.label" :value="option.key" />
                    </el-select>
                    <el-select
                      v-else-if="prop.type === 'dataSourceRef'"
                      :model-value="String(propValue(prop) ?? '')"
                      size="small"
                      clearable
                      placeholder="选择数据源"
                      class="w-full"
                      @update:model-value="setProp(prop.key, $event)"
                    >
                      <el-option v-for="option in dataSourceOptions()" :key="option.id" :label="option.label" :value="option.id" />
                    </el-select>
                    <el-color-picker
                      v-else-if="prop.type === 'color'"
                      :model-value="String(propValue(prop) ?? '')"
                      size="small"
                      @update:model-value="setProp(prop.key, $event)"
                    />
                    <div v-else-if="isJsonProp(prop)" class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                        {{ jsonPreview(prop) }}
                      </span>
                      <el-button text size="small" @click="openPropJson(prop)">编辑</el-button>
                    </div>
                    <el-input
                      v-else
                      :model-value="String(propValue(prop) ?? '')"
                      size="small"
                      :placeholder="prop.description || prop.key"
                      @update:model-value="setProp(prop.key, $event)"
                    />
                    <p v-if="prop.description" class="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {{ prop.description }}
                    </p>
                  </div>
                </div>

                <div class="mt-5 space-y-3 border-t border-slate-100 pt-3">
                  <div v-for="prop in listProps" :key="prop.key">
                    <div class="flex items-center justify-between">
                      <p class="text-[11px] font-medium text-slate-600">{{ propLabel(prop) }}</p>
                      <el-button text size="small" @click="addListItem(prop)">+ 添加</el-button>
                    </div>
                    <div class="mt-1.5 space-y-1.5">
                      <div
                        v-for="(item, index) in listOf(prop)"
                        :key="index"
                        class="rounded-lg border border-slate-200 bg-slate-50/60 p-2"
                      >
                        <div class="flex items-center gap-1">
                          <el-select
                            v-if="prop.type === 'columnList' || prop.type === 'fieldList' || prop.type === 'searchFieldList'"
                            :model-value="String(item.field ?? '')"
                            size="small"
                            filterable
                            class="min-w-0 flex-1"
                            @update:model-value="pickFieldForItem(item, String($event))"
                          >
                            <el-option
                              v-for="field in editorFields"
                              :key="field.key"
                              :label="`${field.label} · ${field.key}`"
                              :value="field.key"
                            />
                          </el-select>
                          <el-input
                            v-if="prop.type === 'buttonList'"
                            :model-value="itemValue(item, 'text')"
                            size="small"
                            placeholder="按钮文字"
                            @update:model-value="setItemValue(item, 'text', $event)"
                          />
                          <el-input
                            v-if="prop.type === 'optionList'"
                            :model-value="itemValue(item, 'value')"
                            size="small"
                            placeholder="值"
                            @update:model-value="setItemValue(item, 'value', $event)"
                          />
                          <el-input
                            v-if="prop.type !== 'buttonList'"
                            :model-value="itemValue(item, 'label')"
                            size="small"
                            placeholder="标签"
                            class="!w-[86px]"
                            @update:model-value="setItemValue(item, 'label', $event)"
                          />
                          <el-input
                            v-if="prop.type === 'columnList'"
                            :model-value="itemValue(item, 'width')"
                            size="small"
                            placeholder="宽"
                            class="!w-[56px]"
                            @update:model-value="setItemValue(item, 'width', $event)"
                          />
                          <el-button text size="small" @click="moveListItem(prop, index, -1)">↑</el-button>
                          <el-button text size="small" @click="moveListItem(prop, index, 1)">↓</el-button>
                          <el-button text size="small" type="danger" @click="removeListItem(prop, index)">×</el-button>
                        </div>
                        <div v-if="prop.type === 'fieldList' || prop.type === 'searchFieldList' || prop.type === 'columnList'" class="mt-1 flex items-center gap-1">
                          <el-select
                            :model-value="String(item.widget ?? '')"
                            size="small"
                            clearable
                            placeholder="控件"
                            class="min-w-0 flex-1"
                            @update:model-value="setItemValue(item, 'widget', $event)"
                          >
                            <el-option
                              v-for="widget in widgetComponents"
                              :key="widget.name"
                              :label="textOf(widget.title)"
                              :value="widget.name"
                            />
                          </el-select>
                          <el-checkbox
                            v-if="prop.type === 'fieldList'"
                            :model-value="!!item.required"
                            size="small"
                            @update:model-value="setItemValue(item, 'required', $event)"
                          >
                            必填
                          </el-checkbox>
                          <el-select
                            v-if="prop.type === 'searchFieldList'"
                            :model-value="String(item.op ?? 'like')"
                            size="small"
                            class="!w-[88px]"
                            @update:model-value="setItemValue(item, 'op', $event)"
                          >
                            <el-option label="模糊" value="like" />
                            <el-option label="等于" value="eq" />
                            <el-option label="包含" value="in" />
                            <el-option label="区间" value="between" />
                          </el-select>
                        </div>
                      </div>
                      <p v-if="!listOf(prop).length" class="rounded-md border border-dashed border-slate-200 px-2 py-2 text-center text-[10.5px] text-slate-400">
                        尚未配置
                      </p>
                    </div>
                  </div>
                </div>

                <details v-if="advancedProps.length" class="mt-4 border-t border-slate-100 pt-3">
                  <summary class="cursor-pointer text-[11px] font-medium text-slate-500">高级属性</summary>
                  <div class="mt-2 space-y-3">
                    <div v-for="prop in advancedProps" :key="prop.key">
                      <label class="mb-1 block text-[11px] text-slate-500">{{ propLabel(prop) }}</label>
                      <el-input
                        :model-value="String(propValue(prop) ?? '')"
                        size="small"
                        :placeholder="prop.description || prop.key"
                        @update:model-value="setProp(prop.key, $event)"
                      />
                    </div>
                  </div>
                </details>
              </template>
            </div>

            <!-- 页面设置 -->
            <div v-else-if="activePanel === 'page' && activePage" class="space-y-3">
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">页面 key</label>
                <el-input :model-value="activePage.key" size="small" @update:model-value="setPageKey" />
              </div>
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">标题</label>
                <el-input :model-value="textOf(activePage.title)" size="small" @update:model-value="setPageTitle" />
              </div>
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">页面类型</label>
                <el-select :model-value="activePage.kind" size="small" class="w-full" @update:model-value="setPageKind($event as PageKind)">
                  <el-option v-for="kind in PAGE_KINDS" :key="kind.value" :label="kind.label" :value="kind.value" />
                </el-select>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-[11px] text-slate-500">路由路径</label>
                  <el-button text size="small" @click="generateRouteFromKey">按 key 生成</el-button>
                </div>
                <el-input
                  :model-value="activePage.route.path"
                  size="small"
                  @update:model-value="setRouteField('path', $event)"
                />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="mb-1 block text-[11px] text-slate-500">布局</label>
                  <el-select
                    :model-value="activePage.route.layout ?? 'side'"
                    size="small"
                    class="w-full"
                    @update:model-value="setRouteField('layout', $event)"
                  >
                    <el-option v-for="layout in ['default', 'blank', 'side', 'top', 'tabs']" :key="layout" :label="layout" :value="layout" />
                  </el-select>
                </div>
                <div>
                  <label class="mb-1 block text-[11px] text-slate-500">缓存</label>
                  <el-select
                    :model-value="activePage.route.cache ?? 'none'"
                    size="small"
                    class="w-full"
                    @update:model-value="setRouteField('cache', $event)"
                  >
                    <el-option label="不缓存" value="none" />
                    <el-option label="页面缓存" value="page" />
                    <el-option label="数据缓存" value="data" />
                  </el-select>
                </div>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                <span class="text-[11px] text-slate-500">需要登录</span>
                <el-switch
                  :model-value="activePage.route.auth !== false"
                  size="small"
                  @update:model-value="setRouteField('auth', $event)"
                />
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                <span class="text-[11px] text-slate-500">keepAlive</span>
                <el-switch
                  :model-value="!!activePage.route.keepAlive"
                  size="small"
                  @update:model-value="setRouteField('keepAlive', $event)"
                />
              </div>
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">可见角色（逗号分隔）</label>
                <el-input
                  :model-value="(activePage.route.roles ?? []).join(', ')"
                  size="small"
                  placeholder="teacher, dept_manager"
                  @update:model-value="setRouteRoles"
                />
              </div>
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">描述</label>
                <el-input
                  :model-value="activePage.description ?? ''"
                  type="textarea"
                  :rows="3"
                  size="small"
                  @update:model-value="setPageDescription"
                />
              </div>
              <PageHandlersPanel :page="activePage" :actions="actionOptions" />
              <div>
                <label class="mb-1 block text-[11px] text-slate-500">语义意图（AI 生成上下文）</label>
                <el-input
                  :model-value="String(activePage.semantic?.intent ?? '')"
                  type="textarea"
                  :rows="2"
                  size="small"
                  @update:model-value="setPageSemanticIntent"
                />
              </div>
              <div class="flex gap-2 pt-1">
                <el-button size="small" @click="duplicatePage(activePage)">复制页面</el-button>
                <el-button size="small" type="danger" plain @click="deletePage(activePage)">删除页面</el-button>
              </div>
            </div>

            <!-- 数据源 -->
            <div v-else-if="activePanel === 'data' && activePage">
              <div class="flex items-center justify-between">
                <p class="text-[12px] font-medium text-slate-700">页面数据源</p>
                <el-button text size="small" @click="openNewDataSource">+ 添加</el-button>
              </div>
              <p class="mt-1 text-[10.5px] leading-relaxed text-slate-400">
                组件只声明消费哪个数据源，运行时统一处理请求、缓存、loading 与错误。
              </p>
              <div class="mt-3 space-y-2">
                <div
                  v-for="source in activePage.dataSources ?? []"
                  :key="source.id"
                  class="rounded-lg border border-slate-200 p-2.5"
                >
                  <div class="flex items-center gap-2">
                    <span class="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-600">{{ source.id }}</span>
                    <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] text-slate-500">{{ source.type }}</span>
                    <el-button text size="small" type="danger" class="ml-auto" @click="removeDataSource(source)">删除</el-button>
                  </div>
                  <el-input
                    :model-value="source.name ?? ''"
                    size="small"
                    class="mt-2"
                    placeholder="数据源名称"
                    @update:model-value="source.name = $event"
                  />
                  <template v-if="source.type === 'entity'">
                    <el-select
                      :model-value="String((source.entityRef as Record<string, unknown> | undefined)?.key ?? '')"
                      size="small"
                      filterable
                      class="mt-1.5 w-full"
                      placeholder="选择实体"
                      @update:model-value="setDataSourceEntity(source, String($event))"
                    >
                      <el-option v-for="option in entityOptions" :key="option.key" :label="option.label" :value="option.key" />
                    </el-select>
                    <el-select
                      :model-value="source.mode ?? 'list'"
                      size="small"
                      class="mt-1.5 w-full"
                      @update:model-value="source.mode = $event as PageDataSource['mode']"
                    >
                      <el-option label="分页查询" value="page" />
                      <el-option label="列表" value="list" />
                      <el-option label="单条" value="one" />
                      <el-option label="计数" value="count" />
                    </el-select>
                  </template>
                </div>
                <p v-if="!(activePage.dataSources ?? []).length" class="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                  还没有数据源
                </p>
              </div>
            </div>

            <!-- 结构树 -->
            <div v-else-if="activePanel === 'outline' && activePage">
              <p class="mb-2 text-[12px] font-medium text-slate-700">组件树</p>
              <NodeOutline :node="activePage.layout" :selected-id="selectedNodeId" @select="selectNode" />
            </div>
          </div>
        </aside>
      </div>
    </template>
    <el-dialog v-model="newPageOpen" title="新建页面" width="520px">
      <div class="mb-4 rounded-lg bg-indigo-50/60 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-indigo-700">
        模板会按所选实体自动生成字段绑定；创建后仍可在画布上自由调整。
      </div>
      <el-form label-position="top">
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="页面 key" required>
            <el-input v-model="newPageForm.key" placeholder="page_leave_list" />
          </el-form-item>
          <el-form-item label="页面标题" required>
            <el-input v-model="newPageForm.title" placeholder="请假申请列表" />
          </el-form-item>
        </div>
        <el-form-item label="页面模板">
          <div class="grid w-full grid-cols-2 gap-2">
            <button
              v-for="kind in PAGE_KINDS"
              :key="kind.value"
              class="rounded-lg border px-3 py-2 text-left transition"
              :class="newPageForm.kind === kind.value ? 'border-indigo-400 bg-indigo-50/70' : 'border-slate-200 hover:border-slate-300'"
              @click="newPageForm.kind = kind.value"
            >
              <span class="block text-[12px] font-medium text-slate-700">{{ kind.label }}</span>
              <span class="mt-0.5 block text-[10.5px] text-slate-400">{{ kind.hint }}</span>
            </button>
          </div>
        </el-form-item>
        <el-form-item label="绑定实体（可选）">
          <el-select v-model="newPageForm.entityKey" clearable filterable class="w-full" placeholder="选择数据实体">
            <el-option v-for="option in entityOptions" :key="option.key" :label="option.label" :value="option.key" />
          </el-select>
        </el-form-item>
        <p v-if="!entityOptions.length" class="text-[11px] text-amber-600">
          当前应用还没有数据实体，创建空页面后建议先到「数据模型」定义实体。
        </p>
      </el-form>
      <p v-if="newPageError" class="mt-2 text-[11.5px] text-rose-500">{{ newPageError }}</p>
      <template #footer>
        <el-button @click="newPageOpen = false">取消</el-button>
        <el-button type="primary" @click="submitNewPage">创建页面</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dataSourceOpen" title="添加数据源" width="480px">
      <el-form label-position="top">
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="数据源 ID" required>
            <el-input v-model="dataSourceForm.id" placeholder="ds_main" />
          </el-form-item>
          <el-form-item label="类型">
            <el-select v-model="dataSourceForm.type" class="w-full">
              <el-option label="实体查询" value="entity" />
              <el-option label="静态数据" value="static" />
              <el-option label="API 调用" value="api" />
              <el-option label="流程数据" value="flow" />
              <el-option label="计算数据" value="computed" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="名称">
          <el-input v-model="dataSourceForm.name" placeholder="业务数据" />
        </el-form-item>
        <template v-if="dataSourceForm.type === 'entity'">
          <el-form-item label="实体" required>
            <el-select v-model="dataSourceForm.entityKey" filterable class="w-full">
              <el-option v-for="option in entityOptions" :key="option.key" :label="option.label" :value="option.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="查询模式">
            <el-select v-model="dataSourceForm.mode" class="w-full">
              <el-option label="分页查询" value="page" />
              <el-option label="列表" value="list" />
              <el-option label="单条" value="one" />
              <el-option label="计数" value="count" />
            </el-select>
          </el-form-item>
        </template>
        <p class="text-[11px] leading-relaxed text-slate-400">
          API / 流程 / 计算数据源的详细编排将在后续版本接入逻辑编排引擎，当前先保留声明位。
        </p>
      </el-form>
      <p v-if="dataSourceError" class="mt-2 text-[11.5px] text-rose-500">{{ dataSourceError }}</p>
      <template #footer>
        <el-button @click="dataSourceOpen = false">取消</el-button>
        <el-button type="primary" @click="submitDataSource">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="publishOpen" title="发布当前草稿" width="480px">
      <div class="mb-4 rounded-lg bg-slate-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
        发布会校验页面结构并生成新版本；已发布版本可随时回滚。
      </div>
      <el-form label-position="top">
        <el-form-item label="发布说明" required>
          <el-input
            v-model="publishMessage"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="例如：上线请假申请列表与审批页"
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

    <el-dialog v-model="issuesOpen" title="页面校验" width="620px">
      <div class="mb-3 flex items-center gap-3 text-[12px]">
        <span class="rounded-md bg-rose-50 px-2 py-1 text-rose-600">错误 {{ errorCount }}</span>
        <span class="rounded-md bg-amber-50 px-2 py-1 text-amber-700">提示 {{ warningCount }}</span>
        <span class="text-slate-400">错误会阻止发布；草稿仍可保存</span>
      </div>
      <div v-if="!issues.length" class="rounded-xl bg-emerald-50 px-4 py-8 text-center text-[12.5px] text-emerald-700">
        没有发现结构问题，可以发布。
      </div>
      <div v-else class="scroll-thin max-h-[420px] space-y-2 overflow-auto">
        <div
          v-for="(issue, index) in issues"
          :key="index"
          class="rounded-lg border px-3 py-2"
          :class="issue.level === 'error' ? 'border-rose-100 bg-rose-50/50' : 'border-amber-100 bg-amber-50/50'"
        >
          <p class="text-[11.5px] font-medium" :class="issue.level === 'error' ? 'text-rose-600' : 'text-amber-700'">
            {{ issue.message }}
          </p>
          <p class="mt-0.5 font-mono text-[10px] text-slate-400">{{ issue.where }}</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="issuesOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="jsonOpen" title="页面模型 JSON" width="800px">
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-[#0f172a]">
        <div class="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
          <span class="font-mono text-[11px] text-slate-400">artifacts.uiSchemas</span>
          <el-button text size="small" class="!text-slate-300" @click="copyJson">复制</el-button>
        </div>
        <pre class="scroll-thin max-h-[520px] overflow-auto p-4 text-[11px] leading-relaxed text-slate-200">{{ prettyJson(pages) }}</pre>
      </div>
      <template #footer>
        <el-button @click="jsonOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="nodeJsonOpen" title="节点 JSON" width="680px">
      <p class="mb-2 text-[11.5px] text-slate-500">
        直接编辑当前节点；保存后会替换画布中的节点，节点 id 必须唯一。
      </p>
      <textarea
        v-model="nodeJsonText"
        spellcheck="false"
        class="scroll-thin h-[400px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11.5px] text-slate-700 outline-none focus:border-indigo-300"
      />
      <p v-if="nodeJsonError" class="mt-2 text-[11.5px] text-rose-500">{{ nodeJsonError }}</p>
      <template #footer>
        <el-button @click="nodeJsonOpen = false">取消</el-button>
        <el-button type="primary" @click="saveNodeJson">应用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="propJsonOpen" :title="`编辑属性 · ${propJsonKey}`" width="620px">
      <p class="mb-2 text-[11.5px] text-slate-500">属性值以 JSON 保存，支持表达式对象与复合结构。</p>
      <textarea
        v-model="propJsonText"
        spellcheck="false"
        class="scroll-thin h-[320px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11.5px] text-slate-700 outline-none focus:border-indigo-300"
      />
      <p v-if="propJsonError" class="mt-2 text-[11.5px] text-rose-500">{{ propJsonError }}</p>
      <template #footer>
        <el-button @click="propJsonOpen = false">取消</el-button>
        <el-button type="primary" @click="savePropJson">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>