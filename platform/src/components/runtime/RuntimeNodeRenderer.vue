<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { RUNTIME_CONTEXT, type RuntimeContextApi, type RuntimeScope } from "@/lib/runtimeContext";
import { truthy } from "@/lib/runtimeExpression";
import {
  displayValue,
  entityOf,
  enumOf,
  fieldOf as findField,
  fieldOptions,
  parseJsonProp,
  propList,
  propObject,
  propText
} from "@/lib/runtimeModel";
import type { DataField, EnumValueDef } from "@/types/dataModel";
import type { UINode } from "@/types/uiModel";
import { componentOf, isBuiltinComponent } from "@/lib/uiModel";
import SandboxFrame from "@/components/component/SandboxFrame.vue";
import RuntimeApprovalTimeline from "./RuntimeApprovalTimeline.vue";
import RemoteComponentHost from "./RemoteComponentHost.vue";

defineOptions({ name: "RuntimeNodeRenderer" });

const props = withDefaults(
  defineProps<{
    node: UINode;
    scope?: RuntimeScope;
    dialogKey?: string | null;
  }>(),
  { scope: () => ({}), dialogKey: null }
);

const injectedApi = inject(RUNTIME_CONTEXT);
if (!injectedApi) throw new Error("RuntimeNodeRenderer 必须在 RuntimePageRenderer 内使用");
const api: RuntimeContextApi = injectedApi;

const nodeProps = computed<Record<string, unknown>>(() => props.node.props ?? {});
const scope = computed<RuntimeScope>(() => props.scope ?? {});
const isVisible = computed(() => api.visible(props.node, scope.value));
const isDisabled = computed(() => api.disabled(props.node, scope.value));
const handlerActionKeys = computed<string[]>(() => {
  const keys: string[] = [];
  for (const handler of Object.values(props.node.handlers ?? {})) {
    if (!handler || typeof handler !== "object") continue;
    const actionRef = (handler as Record<string, unknown>).actionRef;
    if (actionRef && typeof actionRef === "object") {
      const key = (actionRef as Record<string, unknown>).key;
      if (key) keys.push(String(key));
    }
  }
  return keys;
});
const actionAllowed = computed(() => {
  const allowed = api.view.allowed_actions;
  if (!allowed) return true;
  return handlerActionKeys.value.every((key) => allowed.includes(key));
});
const isPermitted = computed(
  () =>
    actionAllowed.value &&
    api.permitted(parseJsonProp(nodeProps.value.permission), scope.value)
);
const schemas = computed(() => api.view.data_schemas ?? []);
const entity = computed(() => entityOf(schemas.value, parseJsonProp(nodeProps.value.entityRef)));

const buttonLoading = ref(false);
const customDef = computed(() => {
  if (isBuiltinComponent(props.node.component)) return null;
  return api.components.find((item) => item.name === props.node.component)
    ?? componentOf(props.node.component);
});
const customTitle = computed(() => propText(customDef.value?.title) || customDef.value?.name || props.node.component);
const customRuntime = computed(() => customDef.value?.runtime ?? "sandbox");

function customEvent(name: string, payload: unknown): void {
  void api.runHandler(props.node, name, { name, payload }, scope.value);
}

function fieldOfKey(key: unknown): DataField | null {
  return findField(entity.value, key);
}

function textProp(key: string): string {
  return propText(nodeProps.value[key]);
}

function boolProp(key: string, fallback = false): boolean {
  const value = parseJsonProp(nodeProps.value[key]);
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "boolean" ? value : Boolean(value);
}

function numberProp(key: string, fallback: number): number {
  const parsed = Number(parseJsonProp(nodeProps.value[key]));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function childNodes(node: UINode): UINode[] {
  return [...(node.children ?? []), ...(node.slots?.default ?? [])];
}

function slotNodes(name: string): UINode[] {
  return props.node.slots?.[name] ?? [];
}

function listProp(key: string): Array<Record<string, unknown>> {
  return propList(nodeProps.value[key]);
}

function optionsOf(ref: unknown, field: DataField | null): EnumValueDef[] {
  const parsed = parseJsonProp(ref);
  if (parsed && typeof parsed === "object") return enumOf(schemas.value, parsed);
  return fieldOptions(schemas.value, field);
}

async function runButton(): Promise<void> {
  if (isDisabled.value || !isPermitted.value) return;
  const confirmText = textProp("confirm");
  if (confirmText) {
    try {
      await ElMessageBox.confirm(confirmText, "操作确认", {
        type: "warning",
        confirmButtonText: "确定",
        cancelButtonText: "取消"
      });
    } catch {
      return;
    }
  }
  buttonLoading.value = true;
  try {
    await api.runHandler(props.node, "click", {
      nodeId: props.node.id,
      __confirmed: confirmText ? true : undefined
    }, scope.value);
  } finally {
    buttonLoading.value = false;
  }
}
/* ------------------------------------------------------------- search form */

const searchFields = computed(() => listProp("searchFieldList"));
const searchModel = computed<Record<string, unknown>>(() => {
  const value = api.evaluate(parseJsonProp(nodeProps.value.model), scope.value);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
});
const searchTarget = computed(() => String(nodeProps.value.targetDataSourceId ?? ""));
const searchColumns = computed(() => Math.max(1, numberProp("fieldsPerRow", 3)));

function searchFieldOf(item: Record<string, unknown>): DataField | null {
  return fieldOfKey(item.field);
}

function searchWidget(item: Record<string, unknown>): string {
  const configured = String(item.widget ?? "");
  if (configured) return configured;
  const field = searchFieldOf(item);
  switch (field?.type) {
    case "enum":
      return "x-select";
    case "date":
    case "datetime":
      return "x-date-picker";
    default:
      return "x-input";
  }
}

function searchOptions(item: Record<string, unknown>): EnumValueDef[] {
  return optionsOf(item.enumRef, searchFieldOf(item));
}

function columnSpan(item: Record<string, unknown>): number {
  const span = Number(item.span ?? 0);
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.min(searchColumns.value, Math.max(1, Math.round((span * searchColumns.value) / 24)));
}

function searchLabel(item: Record<string, unknown>): string {
  return propText(item.label) || searchFieldOf(item)?.label || String(item.field ?? "");
}

function searchMultiple(item: Record<string, unknown>): boolean {
  return item.op === "in" || item.op === "notIn" || item.multiple === true;
}

function clearSearch(): void {
  const model = searchModel.value;
  for (const item of searchFields.value) {
    const key = String(item.field ?? "");
    if (key) delete model[key];
  }
  resetPage();
  if (searchTarget.value) void api.refreshDataSource(searchTarget.value);
}

function submitSearch(): void {
  resetPage();
  if (searchTarget.value) void api.refreshDataSource(searchTarget.value);
}

function resetPage(): void {
  const query = api.state.query;
  if (query && typeof query === "object") {
    (query as Record<string, unknown>).page = 1;
  }
}
/* ------------------------------------------------------------------ table */

const tableSourceId = computed(() => String(nodeProps.value.dataSourceId ?? ""));
const tableSource = computed(() => api.data[tableSourceId.value]);
const tableRows = computed<Record<string, unknown>[]>(() => tableSource.value?.rows ?? []);
const tableTotal = computed(() => tableSource.value?.total ?? 0);
const tableLoading = computed(() => tableSource.value?.loading === true);
const tableColumns = computed(() => listProp("columnList"));
const selectionMode = computed(() => nodeProps.value.selection === "multiple");
const rowKey = computed(() => String(nodeProps.value.rowKey ?? "id"));
const showIndex = computed(() => boolProp("showIndex"));

function isActionColumn(column: Record<string, unknown>): boolean {
  return column.widget === "x-row-actions" || column.field === "actions";
}

function tableColumnField(column: Record<string, unknown>): DataField | null {
  return fieldOfKey(column.field);
}

function tableColumnLabel(column: Record<string, unknown>): string {
  return propText(column.label) || tableColumnField(column)?.label || String(column.field ?? "");
}

function tableColumnWidth(column: Record<string, unknown>): string | number | undefined {
  const width = column.width;
  if (typeof width === "number") return width;
  if (typeof width === "string" && /^\d+$/.test(width)) return Number(width);
  return undefined;
}

function cellValue(column: Record<string, unknown>, row: Record<string, unknown>): unknown {
  const key = String(column.field ?? "");
  if (!key) return undefined;
  const displayField = String(column.displayField ?? "");
  if (displayField && row[displayField] !== undefined && row[displayField] !== null) {
    return row[displayField];
  }
  if (key.endsWith("_id")) {
    const nameKey = key.slice(0, -3) + "_name";
    const name = row[nameKey];
    if (name !== undefined && name !== null && name !== "") return name;
  }
  return row[key];
}

function cellText(column: Record<string, unknown>, row: Record<string, unknown>): string {
  return displayValue(schemas.value, tableColumnField(column), column, cellValue(column, row));
}

function cellVisible(column: Record<string, unknown>, row: Record<string, unknown>): boolean {
  if (column.hidden === undefined || column.hidden === null) return true;
  return truthy(api.evaluate(parseJsonProp(column.hidden), { row }));
}

function tagType(color: unknown): "primary" | "success" | "info" | "warning" | "danger" {
  const value = String(color ?? "info");
  if (value === "primary" || value === "success" || value === "warning" || value === "danger") {
    return value;
  }
  return "info";
}

function cellTagType(
  column: Record<string, unknown>,
  row: Record<string, unknown>
): "primary" | "success" | "info" | "warning" | "danger" {
  const value = cellValue(column, row);
  const options = optionsOf(column.enumRef, tableColumnField(column));
  const color = options.find((item) => String(item.value) === String(value))?.color ?? "info";
  return tagType(color);
}

function onRowClick(row: Record<string, unknown>, _column: unknown, event: MouseEvent): void {
  event.stopPropagation();
  const index = tableRows.value.indexOf(row);
  void api.runHandler(props.node, "rowClick", { row, index }, { row, index });
}

function onSelectionChange(rows: Record<string, unknown>[]): void {
  void api.runHandler(props.node, "selectionChange", { rows }, { rows });
}

function onSortChange(payload: { prop?: string | null; order?: string | null }): void {
  if (!tableSourceId.value) return;
  const field = String(payload.prop ?? "");
  if (!field || !payload.order) {
    api.setDataSourceSort(tableSourceId.value, null);
    return;
  }
  api.setDataSourceSort(tableSourceId.value, {
    field,
    direction: payload.order === "ascending" ? "asc" : "desc"
  });
}

function rowActionsOf(column: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = parseJsonProp(column.actions ?? column.buttons);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .slice()
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
}

function actionVisible(action: Record<string, unknown>, row: Record<string, unknown>): boolean {
  const visible = action.visible === undefined
    ? true
    : truthy(api.evaluate(parseJsonProp(action.visible), { row }));
  const allowed = action.permission === undefined
    ? true
    : truthy(api.evaluate(parseJsonProp(action.permission), { row }));
  const disabled = action.disabled === undefined
    ? false
    : truthy(api.evaluate(parseJsonProp(action.disabled), { row }));
  return visible && allowed && !disabled;
}

function actionParams(action: Record<string, unknown>, row: Record<string, unknown>): Record<string, unknown> {
  const raw = parseJsonProp(action.params);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return (api.evaluate(raw, { row }) ?? {}) as Record<string, unknown>;
}

function resolveActionKey(action: Record<string, unknown>, tableNode: UINode): string {
  const ref = propObject(action.actionRef);
  if (ref.key) return String(ref.key);
  const command = String(action.key ?? "");
  if (!command) return "";
  if (command === "detail") {
    const handler = tableNode.handlers?.rowClick as Record<string, unknown> | undefined;
    const rowRef = propObject(handler?.actionRef);
    if (rowRef.key) return String(rowRef.key);
  }
  const actions = api.view.actions ?? [];
  const exact = actions.find((item) => item.key === command);
  if (exact) return exact.key;
  const suffixed = actions
    .filter((item) => item.key.endsWith("_" + command))
    .sort((left, right) => left.key.length - right.key.length);
  return suffixed[0]?.key ?? "";
}

async function runRowAction(
  action: Record<string, unknown>,
  row: Record<string, unknown>,
  event: MouseEvent
): Promise<void> {
  event.stopPropagation();
  if (!actionVisible(action, row)) return;
  const actionKey = resolveActionKey(action, props.node);
  const label = propText(action.label) || String(action.key ?? "操作");
  if (!actionKey) {
    api.notify(`按钮「${label}」未配置动作`, "warning");
    return;
  }
  const confirmText = propText(action.confirm);
  let confirmed: boolean | undefined;
  if (confirmText) {
    try {
      await ElMessageBox.confirm(confirmText, "操作确认", {
        type: action.danger ? "warning" : "info",
        confirmButtonText: "确定",
        cancelButtonText: "取消"
      });
      confirmed = true;
    } catch {
      return;
    }
  }
  await api.runAction({
    actionKey,
    params: actionParams(action, row),
    scope: { row },
    confirmed
  });
}
/* -------------------------------------------------------------- pagination */

const pageQuery = computed<Record<string, unknown>>(() =>
  api.state.query && typeof api.state.query === "object"
    ? (api.state.query as Record<string, unknown>)
    : {}
);
const currentPage = computed(() => Number(pageQuery.value.page ?? 1) || 1);
const currentSize = computed(() => Number(pageQuery.value.size ?? 10) || 10);
const pageSizes = computed(() => {
  const value = parseJsonProp(nodeProps.value.pageSizes);
  if (!Array.isArray(value) || value.length === 0) return [10, 20, 50, 100];
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
});

function setQuery(key: string, value: unknown): void {
  if (!api.state.query || typeof api.state.query !== "object") {
    api.state.query = { page: 1, size: 10 };
  }
  (api.state.query as Record<string, unknown>)[key] = value;
}

function refreshPagination(): void {
  const id = String(nodeProps.value.dataSourceId ?? "");
  if (id) void api.refreshDataSource(id);
}

function onPageChange(page: number): void {
  setQuery("page", page);
  refreshPagination();
}

function onSizeChange(size: number): void {
  setQuery("size", size);
  setQuery("page", 1);
  refreshPagination();
}

/* ----------------------------------------------------------------- dialog */

const dialogExpression = computed(() => parseJsonProp(nodeProps.value.model));
const dialogVisible = computed<boolean>({
  get: () => truthy(api.evaluate(dialogExpression.value, scope.value)),
  set: (value: boolean) => api.setExpressionValue(dialogExpression.value, value)
});
const dialogMode = computed(() => String(nodeProps.value.mode ?? "dialog"));
const dialogWidth = computed(() =>
  String(nodeProps.value.width ?? (dialogMode.value === "drawer" ? "720px" : "560px"))
);
const showDialogFooter = computed(() => nodeProps.value.showFooter !== false);

function findFirstForm(node: UINode): UINode | null {
  for (const child of childNodes(node)) {
    if (child.component === "x-form") return child;
    const nested = findFirstForm(child);
    if (nested) return nested;
  }
  return null;
}

function dialogForm(): Record<string, unknown> {
  const formNode = findFirstForm(props.node);
  if (!formNode) return {};
  const value = api.evaluate(parseJsonProp(formNode.props?.model), scope.value);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function confirmDialog(): Promise<void> {
  await api.runHandler(props.node, "confirm", {}, { ...scope.value, form: dialogForm() });
}

/* ------------------------------------------------------------------- form */

const formExpression = computed(() => parseJsonProp(nodeProps.value.model));
const formModel = computed<Record<string, unknown>>(() => {
  const value = api.evaluate(formExpression.value, scope.value);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
});
const formFields = computed(() => listProp("fieldList"));
const formColumns = computed(() => Math.max(1, numberProp("columnsPerRow", 2)));

function formFieldOf(item: Record<string, unknown>): DataField | null {
  return fieldOfKey(item.field);
}

function formFieldKey(item: Record<string, unknown>): string {
  return String(item.field ?? "");
}

function formLabel(item: Record<string, unknown>): string {
  return propText(item.label) || formFieldOf(item)?.label || formFieldKey(item);
}

function formWidget(item: Record<string, unknown>): string {
  const configured = String(item.widget ?? "");
  if (configured) return configured;
  const field = formFieldOf(item);
  switch (field?.type) {
    case "text":
    case "richText":
      return "x-textarea";
    case "integer":
    case "decimal":
      return "x-number";
    case "boolean":
      return "x-switch";
    case "enum":
      return "x-select";
    case "date":
      return "x-date-picker";
    case "datetime":
      return "x-datetime-picker";
    default:
      return "x-input";
  }
}

function formOptions(item: Record<string, unknown>): EnumValueDef[] {
  return optionsOf(item.enumRef, formFieldOf(item));
}

function formSpan(item: Record<string, unknown>): number {
  const span = Number(item.span ?? 0);
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.min(formColumns.value, Math.max(1, Math.round((span * formColumns.value) / 24)));
}

function formReadonly(item: Record<string, unknown>): boolean {
  return item.readonly === true || boolProp("readonly") || formFieldOf(item)?.immutable === true;
}

async function submitForm(): Promise<void> {
  await api.runHandler(props.node, "submit", {}, { ...scope.value, form: formModel.value });
}

function resetForm(): void {
  const model = formModel.value;
  for (const key of Object.keys(model)) delete model[key];
}

function buttonType(): "primary" | "success" | "warning" | "danger" | "info" | "default" {
  const value = String(nodeProps.value.type ?? "default");
  return value === "primary" || value === "success" || value === "warning"
    || value === "danger" || value === "info" ? value : "default";
}

function buttonSize(): "large" | "default" | "small" {
  const value = String(nodeProps.value.size ?? "default");
  return value === "large" || value === "small" ? value : "default";
}

/* ----------------------------------------------------------- descriptions */

const descriptionItems = computed(() => listProp("fieldList"));
const descriptionSourceId = computed(() => String(nodeProps.value.dataSourceId ?? ""));
const descriptionRow = computed<Record<string, unknown>>(() => {
  const source = api.data[descriptionSourceId.value];
  if (!source) return {};
  return source.item ?? source.rows?.[0] ?? {};
});
const descriptionColumns = computed(() => Math.max(1, numberProp("column", 2)));

function descriptionLabel(item: Record<string, unknown>): string {
  return propText(item.label) || fieldOfKey(item.field)?.label || String(item.field ?? "");
}

function descriptionValue(item: Record<string, unknown>): string {
  const field = fieldOfKey(item.field);
  if (!field) return "—";
  return displayValue(schemas.value, field, item, descriptionRow.value[field.key]);
}

/* ------------------------------------------------------ status / timeline */

const statusValue = computed(() => api.evaluate(parseJsonProp(nodeProps.value.value), scope.value));
const statusOptions = computed(() => enumOf(schemas.value, parseJsonProp(nodeProps.value.enumRef)));
const statusLabel = computed(() => {
  const matched = statusOptions.value.find((item) => String(item.value) === String(statusValue.value));
  if (matched) return matched.label;
  return statusValue.value === null || statusValue.value === undefined ? "—" : String(statusValue.value);
});
const statusType = computed(() => {
  const matched = statusOptions.value.find((item) => String(item.value) === String(statusValue.value));
  return tagType(matched?.color);
});

const timelineInstanceId = computed(() => {
  const raw = parseJsonProp(nodeProps.value.processInstanceId);
  const value = raw === undefined ? "" : api.evaluate(raw, scope.value);
  return value === null || value === undefined ? "" : String(value);
});

const attachmentBizId = computed(() => {
  const raw = parseJsonProp(nodeProps.value.bizId);
  const value = raw === undefined ? "" : api.evaluate(raw, scope.value);
  return value === null || value === undefined ? "" : String(value);
});
</script>
<template>
  <template v-if="isVisible">
    <div v-if="node.component === 'x-page'" class="min-w-0 space-y-3">
      <p v-if="textProp('subtitle')" class="text-[12px] text-slate-400">{{ textProp("subtitle") }}</p>
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div v-else-if="node.component === 'x-card'" class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        v-if="textProp('title') || textProp('extra')"
        class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5"
      >
        <span class="text-[13px] font-medium text-slate-800">{{ textProp("title") }}</span>
        <span class="text-[11px] text-slate-400">{{ textProp("extra") }}</span>
      </div>
      <div class="space-y-3 p-4">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </div>
    </div>

    <div
      v-else-if="node.component === 'x-toolbar'"
      class="flex flex-wrap items-center gap-2"
      :class="textProp('align') === 'right' ? 'justify-end' : 'justify-start'"
    >
      <RuntimeNodeRenderer
        v-for="child in [...slotNodes('left'), ...childNodes(node), ...slotNodes('right')]"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div v-else-if="node.component === 'x-row'" class="flex flex-wrap items-stretch gap-4">
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div v-else-if="node.component === 'x-col'" class="min-w-0 space-y-3">
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div
      v-else-if="node.component === 'x-search-form'"
      class="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
    >
      <div
        class="runtime-search-grid grid gap-3"
        :style="{ '--runtime-search-columns': String(searchColumns) }"
      >
        <div
          v-for="(item, index) in searchFields"
          :key="`${String(item.field ?? index)}`"
          class="runtime-search-field"
          :style="{ gridColumn: `span ${columnSpan(item)}` }"
        >
          <label class="mb-1 block text-[11.5px] text-slate-600">{{ searchLabel(item) }}</label>
          <el-select
            v-if="searchWidget(item) === 'x-select'"
            v-model="searchModel[String(item.field ?? '')]"
            :multiple="searchMultiple(item)"
            :collapse-tags="searchMultiple(item)"
            :placeholder="`请选择${searchLabel(item)}`"
            clearable
            filterable
            size="small"
            class="w-full"
          >
            <el-option
              v-for="option in searchOptions(item)"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="searchWidget(item) === 'x-date-picker' && (item.op === 'between' || item.op === 'range')"
            v-model="searchModel[String(item.field ?? '')]"
            :type="searchFieldOf(item)?.type === 'date' ? 'daterange' : 'datetimerange'"
            :value-format="searchFieldOf(item)?.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss'"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            size="small"
            class="!w-full"
          />
          <el-date-picker
            v-else-if="searchWidget(item) === 'x-date-picker'"
            v-model="searchModel[String(item.field ?? '')]"
            :type="searchFieldOf(item)?.type === 'datetime' ? 'datetime' : 'date'"
            :value-format="searchFieldOf(item)?.type === 'datetime' ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD'"
            size="small"
            class="!w-full"
          />
          <el-input
            v-else
            v-model="searchModel[String(item.field ?? '')]"
            :placeholder="
              item.widget === 'x-dept-picker'
                ? '输入部门 ID'
                : propText(item.placeholder) || `请输入${searchLabel(item)}`
            "
            clearable
            size="small"
          />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <RuntimeNodeRenderer
            v-for="child in slotNodes('left')"
            :key="child.id"
            :node="child"
            :scope="scope"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <el-button type="primary" size="small" @click="submitSearch">查询</el-button>
          <el-button v-if="nodeProps.showReset !== false" size="small" plain @click="clearSearch">
            重置
          </el-button>
          <RuntimeNodeRenderer
            v-for="child in slotNodes('right')"
            :key="child.id"
            :node="child"
            :scope="scope"
          />
        </div>
      </div>
    </div>
    <div v-else-if="node.component === 'x-table'" class="runtime-table-wrap min-w-0">
      <el-table
        v-loading="tableLoading"
        :data="tableRows"
        :row-key="rowKey"
        :stripe="nodeProps.stripe !== false"
        :border="nodeProps.border === true"
        :size="nodeProps.size === 'large' || nodeProps.size === 'small' ? nodeProps.size : 'default'"
        style="width: 100%"
        @row-click="onRowClick"
        @selection-change="onSelectionChange"
        @sort-change="onSortChange"
      >
        <el-table-column v-if="selectionMode" type="selection" width="42" />
        <el-table-column v-if="showIndex" type="index" width="52" label="#" />
        <el-table-column
          v-for="(column, columnIndex) in tableColumns"
          :key="`${String(column.field ?? columnIndex)}`"
          :prop="typeof column.field === 'string' ? column.field : undefined"
          :label="tableColumnLabel(column)"
          :width="tableColumnWidth(column)"
          :align="column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left'"
          :sortable="column.sortable === true ? 'custom' : false"
        >
          <template #default="{ row }">
            <div v-if="isActionColumn(column)" class="flex flex-wrap items-center gap-1">
              <el-button
                v-for="(action, actionIndex) in rowActionsOf(column).filter((item) => actionVisible(item, row))"
                :key="`${String(action.key ?? actionIndex)}`"
                link
                size="small"
                :type="action.danger ? 'danger' : 'primary'"
                @click="runRowAction(action, row, $event)"
              >
                {{ propText(action.label) || String(action.key ?? "操作") }}
              </el-button>
            </div>
            <template v-else-if="cellVisible(column, row)">
              <el-tag
                v-if="column.widget === 'x-status-tag'"
                size="small"
                :type="cellTagType(column, row)"
                effect="light"
              >
                {{ cellText(column, row) }}
              </el-tag>
              <el-tag
                v-else-if="column.widget === 'x-enum-text'"
                size="small"
                :type="cellTagType(column, row)"
                effect="plain"
              >
                {{ cellText(column, row) }}
              </el-tag>
              <span v-else class="text-[12.5px] text-slate-700">{{ cellText(column, row) }}</span>
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <span class="text-[12px] text-slate-400">{{ textProp("emptyText") || "暂无数据" }}</span>
        </template>
      </el-table>
      <p v-if="tableSource?.error" class="mt-2 text-[11.5px] text-rose-500">{{ tableSource.error }}</p>
    </div>

    <div v-else-if="node.component === 'x-pagination'" class="flex justify-end py-1">
      <el-pagination
        background
        :total="tableTotal"
        :current-page="currentPage"
        :page-size="currentSize"
        :page-sizes="pageSizes"
        :layout="String(nodeProps.layout ?? 'total, sizes, prev, pager, next')"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-button
      v-else-if="node.component === 'x-btn'"
      :type="buttonType()"
      :plain="nodeProps.plain === true"
      :round="nodeProps.round === true"
      :size="buttonSize()"
      :disabled="isDisabled || !isPermitted"
      :loading="buttonLoading || nodeProps.loading === true"
      @click="runButton"
    >
      {{ textProp("text") || textProp("label") || node.key || "按钮" }}
    </el-button>

    <el-dialog
      v-else-if="node.component === 'x-dialog' && dialogMode !== 'drawer'"
      v-model="dialogVisible"
      :title="textProp('title')"
      :width="dialogWidth"
      :close-on-click-modal="nodeProps.closeOnClickModal !== false"
      :destroy-on-close="nodeProps.destroyOnClose !== false"
      append-to-body
    >
      <div class="space-y-3">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </div>
      <template v-if="showDialogFooter" #footer>
        <el-button size="small" @click="dialogVisible = false">
          {{ textProp("cancelText") || "取消" }}
        </el-button>
        <el-button type="primary" size="small" @click="confirmDialog">
          {{ textProp("confirmText") || "确定" }}
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-else-if="node.component === 'x-dialog'"
      v-model="dialogVisible"
      :title="textProp('title')"
      :size="dialogWidth"
      :destroy-on-close="nodeProps.destroyOnClose !== false"
      append-to-body
    >
      <div class="space-y-4">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </div>
      <template v-if="showDialogFooter" #footer>
        <el-button size="small" @click="dialogVisible = false">
          {{ textProp("cancelText") || "取消" }}
        </el-button>
        <el-button type="primary" size="small" @click="confirmDialog">
          {{ textProp("confirmText") || "确定" }}
        </el-button>
      </template>
    </el-drawer>
    <div v-else-if="node.component === 'x-form'" class="min-w-0">
      <div
        class="grid gap-x-4 gap-y-4"
        :style="{ gridTemplateColumns: `repeat(${formColumns}, minmax(0, 1fr))` }"
      >
        <div
          v-for="(item, index) in formFields"
          :key="`${formFieldKey(item)}-${index}`"
          :style="{ gridColumn: `span ${formSpan(item)}` }"
        >
          <label class="mb-1 block text-[11.5px] text-slate-600">
            {{ formLabel(item) }}
            <span v-if="item.required === true || formFieldOf(item)?.required" class="ml-0.5 text-rose-500">*</span>
          </label>
          <el-select
            v-if="formWidget(item) === 'x-select'"
            v-model="formModel[formFieldKey(item)]"
            :placeholder="`请选择${formLabel(item)}`"
            clearable
            filterable
            :disabled="formReadonly(item)"
            class="w-full"
          >
            <el-option
              v-for="option in formOptions(item)"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="formWidget(item) === 'x-date-picker' || formWidget(item) === 'x-datetime-picker'"
            v-model="formModel[formFieldKey(item)]"
            :type="formWidget(item) === 'x-datetime-picker' ? 'datetime' : 'date'"
            :value-format="formWidget(item) === 'x-datetime-picker' ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD'"
            :placeholder="`请选择${formLabel(item)}`"
            :disabled="formReadonly(item)"
            class="!w-full"
          />
          <el-input-number
            v-else-if="formWidget(item) === 'x-number'"
            v-model="formModel[formFieldKey(item)]"
            :disabled="formReadonly(item)"
            :controls="false"
            class="!w-full"
          />
          <el-switch
            v-else-if="formWidget(item) === 'x-switch'"
            v-model="formModel[formFieldKey(item)]"
            :disabled="formReadonly(item)"
          />
          <el-input
            v-else-if="formWidget(item) === 'x-textarea'"
            v-model="formModel[formFieldKey(item)]"
            type="textarea"
            :rows="3"
            :placeholder="`请输入${formLabel(item)}`"
            :disabled="formReadonly(item)"
          />
          <el-input
            v-else
            v-model="formModel[formFieldKey(item)] as string"
            :placeholder="`请输入${formLabel(item)}`"
            :disabled="formReadonly(item)"
            clearable
          />
          <p v-if="propText(item.help)" class="mt-1 text-[10.5px] text-slate-400">{{ propText(item.help) }}</p>
        </div>
      </div>
      <div v-if="nodeProps.showActions === true" class="mt-4 flex justify-end gap-2">
        <el-button size="small" @click="resetForm">{{ textProp("resetText") || "重置" }}</el-button>
        <el-button type="primary" size="small" @click="submitForm">
          {{ textProp("submitText") || "提交" }}
        </el-button>
      </div>
    </div>

    <div v-else-if="node.component === 'x-form-item'" class="min-w-0">
      <label class="mb-1 block text-[11.5px] text-slate-600">
        {{ textProp("label") }}
        <span v-if="nodeProps.required === true" class="ml-0.5 text-rose-500">*</span>
      </label>
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div v-else-if="node.component === 'x-descriptions'" class="min-w-0">
      <div
        class="grid gap-x-6 gap-y-3"
        :style="{ gridTemplateColumns: `repeat(${descriptionColumns}, minmax(0, 1fr))` }"
      >
        <div
          v-for="(item, index) in descriptionItems"
          :key="`${String(item.field ?? index)}`"
          class="flex min-w-0 gap-2 border-b border-slate-50 pb-2"
        >
          <span class="w-24 shrink-0 text-[11.5px] text-slate-400">{{ descriptionLabel(item) }}</span>
          <span class="min-w-0 break-words text-[12.5px] text-slate-700">{{ descriptionValue(item) }}</span>
        </div>
      </div>
      <p v-if="descriptionItems.length === 0" class="text-[12px] text-slate-400">暂无详情字段</p>
    </div>

    <div v-else-if="node.component === 'x-approval-timeline'" class="min-w-0 py-1">
      <RuntimeApprovalTimeline :process-instance-id="timelineInstanceId" />
    </div>

    <div
      v-else-if="node.component === 'x-attachment-list'"
      class="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-[12px] text-slate-400"
    >
      附件列表 · {{ attachmentBizId || "未绑定业务单据" }}
      <span class="ml-1 text-[11px] text-slate-300">（运行时上传/下载待接入）</span>
    </div>

    <el-tag
      v-else-if="node.component === 'x-status-tag'"
      :type="statusType"
      size="small"
      effect="light"
    >
      {{ statusLabel }}
    </el-tag>

    <div
      v-else-if="node.component === 'x-row-actions'"
      class="flex flex-wrap items-center gap-1"
    >
      <el-button
        v-for="(action, index) in rowActionsOf(nodeProps)"
        :key="`${String(action.key ?? index)}`"
        link
        size="small"
        :type="action.danger ? 'danger' : 'primary'"
        @click="runRowAction(action, scope.row ?? {}, $event)"
      >
        {{ propText(action.label) || String(action.key ?? "操作") }}
      </el-button>
    </div>

    <div v-else-if="customDef" class="min-w-0 rounded-xl border border-indigo-100 bg-white p-2">
      <div class="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span class="truncate text-[10.5px] font-medium text-indigo-600">{{ customTitle }}</span>
        <span class="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-500">自定义组件</span>
      </div>
      <RemoteComponentHost
        v-if="customRuntime === 'remote'"
        :component="customDef"
        :override-props="nodeProps"
        :api="api"
        :height="96"
        @event="customEvent"
        @error="(message) => api.notify(message, 'error')"
      />
      <SandboxFrame
        v-else
        :component="customDef"
        :override-props="nodeProps"
        :interactive="true"
        :min-height="80"
        :max-height="520"
        :title="customTitle"
        @event="customEvent"
      />
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>

    <div v-else class="min-w-0 space-y-2 rounded-lg border border-dashed border-slate-200 p-3">
      <p class="text-[11px] text-slate-400">{{ node.component }} · 运行时暂未实现该组件</p>
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </div>
  </template>
</template>

<style scoped>
.runtime-search-grid {
  grid-template-columns: repeat(var(--runtime-search-columns, 4), minmax(0, 1fr));
}

@media (max-width: 640px) {
  .runtime-search-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .runtime-search-field {
    grid-column: span 1 !important;
  }

  .runtime-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .runtime-table-wrap :deep(.el-table) {
    min-width: 680px;
  }
}
</style>
