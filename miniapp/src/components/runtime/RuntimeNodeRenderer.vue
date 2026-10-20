<script setup lang="ts">
import { computed, inject, ref } from "vue";
import {
  RUNTIME_CONTEXT,
  type RuntimeContextApi,
  type RuntimeScope
} from "@/lib/runtimeContext";
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
  () => actionAllowed.value && api.permitted(parseJsonProp(nodeProps.value.permission), scope.value)
);
const schemas = computed(() => api.view.data_schemas ?? []);
const entity = computed(() => entityOf(schemas.value, parseJsonProp(nodeProps.value.entityRef)));

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

function chipClass(color: unknown): string {
  const value = String(color ?? "info");
  if (value === "primary" || value === "success" || value === "warning" || value === "danger") {
    return "mf-chip mf-chip--" + value;
  }
  return "mf-chip mf-chip--info";
}

function buttonClass(type: unknown, plain = false, small = false): string {
  const value = String(type ?? "default");
  const parts = ["mf-btn"];
  if (small) parts.push("mf-btn--sm");
  if (value === "primary" || value === "success" || value === "warning" || value === "danger") {
    parts.push("mf-btn--" + value);
  }
  if (plain) parts.push("mf-btn--plain");
  return parts.join(" ");
}

/* ------------------------------------------------------------------ button */

const buttonLoading = ref(false);

async function runButton(): Promise<void> {
  if (isDisabled.value || !isPermitted.value || buttonLoading.value) return;
  const confirmText = textProp("confirm");
  if (confirmText) {
    const accepted = await api.confirm(confirmText, "操作确认", String(nodeProps.value.type) === "danger");
    if (!accepted) return;
  }
  buttonLoading.value = true;
  try {
    await api.runHandler(
      props.node,
      "click",
      { nodeId: props.node.id, __confirmed: confirmText ? true : undefined },
      scope.value
    );
  } finally {
    buttonLoading.value = false;
  }
}

/* ------------------------------------------------------------- search form */

const searchFields = computed(() => listProp("searchFieldList"));
const searchTarget = computed(() => String(nodeProps.value.targetDataSourceId ?? ""));
const searchModel = computed<Record<string, unknown>>(() => {
  const value = api.evaluate(parseJsonProp(nodeProps.value.model), scope.value);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
});

function searchFieldKey(item: Record<string, unknown>): string {
  return String(item.field ?? "");
}

function searchLabel(item: Record<string, unknown>): string {
  return propText(item.label) || fieldOfKey(item.field)?.label || searchFieldKey(item);
}

function searchOptions(item: Record<string, unknown>): EnumValueDef[] {
  return optionsOf(item.enumRef, fieldOfKey(item.field));
}

function searchValue(item: Record<string, unknown>): unknown {
  return searchModel.value[searchFieldKey(item)];
}

function searchInputValue(item: Record<string, unknown>): string {
  const value = searchValue(item);
  return value === undefined || value === null ? "" : String(value);
}

function setSearchValue(item: Record<string, unknown>, value: unknown): void {
  const key = searchFieldKey(item);
  if (!key) return;
  searchModel.value[key] = value;
  const query = api.state.query;
  if (query && typeof query === "object") (query as Record<string, unknown>).page = 1;
}

function searchPickerLabels(item: Record<string, unknown>): string[] {
  return searchOptions(item).map((option) => option.label);
}

function searchPickerIndex(item: Record<string, unknown>): number {
  const value = searchValue(item);
  const index = searchOptions(item).findIndex((option) => String(option.value) === String(value));
  return index < 0 ? 0 : index;
}

function searchSelectText(item: Record<string, unknown>): string {
  const value = searchValue(item);
  if (value === undefined || value === null || value === "") return "全部";
  const found = searchOptions(item).find((option) => String(option.value) === String(value));
  return found?.label ?? String(value);
}

function onSearchPick(item: Record<string, unknown>, event: { detail: { value: number | string } }): void {
  const options = searchOptions(item);
  const index = Number(event.detail.value);
  if (options[index]) setSearchValue(item, options[index].value);
}

function searchBetween(item: Record<string, unknown>): { start: string; end: string } {
  const value = searchValue(item);
  if (Array.isArray(value)) {
    return { start: String(value[0] ?? ""), end: String(value[1] ?? "") };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return { start: String(record.start ?? ""), end: String(record.end ?? "") };
  }
  return { start: "", end: "" };
}

function setSearchBetween(item: Record<string, unknown>, key: "start" | "end", value: string): void {
  const current = searchBetween(item);
  setSearchValue(item, key === "start"
    ? { start: value, end: current.end }
    : { start: current.start, end: value });
}

function resetPage(): void {
  const query = api.state.query;
  if (query && typeof query === "object") (query as Record<string, unknown>).page = 1;
}

function submitSearch(): void {
  resetPage();
  if (searchTarget.value) void api.refreshDataSource(searchTarget.value);
}

function clearSearch(): void {
  for (const item of searchFields.value) {
    const key = searchFieldKey(item);
    if (key) delete searchModel.value[key];
  }
  resetPage();
  if (searchTarget.value) void api.refreshDataSource(searchTarget.value);
}

/* ------------------------------------------------------------------- table */

const tableSourceId = computed(() => String(nodeProps.value.dataSourceId ?? ""));
const tableSource = computed(() => api.data[tableSourceId.value]);
const tableRows = computed<Record<string, unknown>[]>(() => tableSource.value?.rows ?? []);
const tableLoading = computed(() => tableSource.value?.loading === true);
const tableError = computed(() => tableSource.value?.error ?? "");
const tableColumns = computed(() => listProp("columnList"));
const dataColumns = computed(() => tableColumns.value.filter((column) => !isActionColumn(column)));
const actionColumn = computed(() => tableColumns.value.find((column) => isActionColumn(column)) ?? null);

function isActionColumn(column: Record<string, unknown>): boolean {
  return column.widget === "x-row-actions" || column.field === "actions";
}

function columnField(column: Record<string, unknown>): DataField | null {
  return fieldOfKey(column.field);
}

function columnLabel(column: Record<string, unknown>): string {
  return propText(column.label) || columnField(column)?.label || String(column.field ?? "");
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
  return displayValue(schemas.value, columnField(column), column, cellValue(column, row));
}

function cellVisible(column: Record<string, unknown>, row: Record<string, unknown>): boolean {
  if (column.hidden === undefined || column.hidden === null) return true;
  return truthy(api.evaluate(parseJsonProp(column.hidden), { row }));
}

function rowTitle(row: Record<string, unknown>): string {
  if (row.applicant_name) return String(row.applicant_name);
  if (row.name) return String(row.name);
  if (row.title) return String(row.title);
  if (row.applicant_id) return String(row.applicant_id);
  return String(row.id ?? "记录");
}

function statusColumn(): Record<string, unknown> | null {
  return tableColumns.value.find((column) => column.widget === "x-status-tag" || column.field === "status") ?? null;
}

function statusLabel(row: Record<string, unknown>): string {
  const column = statusColumn();
  if (!column) return "";
  return cellText(column, row);
}

function statusClass(row: Record<string, unknown>): string {
  const column = statusColumn();
  if (!column) return "mf-chip mf-chip--info";
  const value = cellValue(column, row);
  const options = optionsOf(column.enumRef, columnField(column));
  const color = options.find((item) => String(item.value) === String(value))?.color ?? "info";
  return chipClass(color);
}

function rowActionButtons(column: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = parseJsonProp(column.buttons ?? column.actions);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .slice()
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
}

function actionVisible(action: Record<string, unknown>, row: Record<string, unknown>): boolean {
  const visibleValue = action.visible === undefined
    ? true
    : truthy(api.evaluate(parseJsonProp(action.visible), { row }));
  const permitted = action.permission === undefined
    ? true
    : truthy(api.evaluate(parseJsonProp(action.permission), { row }));
  const disabledValue = action.disabled === undefined
    ? false
    : truthy(api.evaluate(parseJsonProp(action.disabled), { row }));
  return visibleValue && permitted && !disabledValue;
}

function actionParams(action: Record<string, unknown>, row: Record<string, unknown>): Record<string, unknown> {
  const raw = parseJsonProp(action.params);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return (api.evaluate(raw, { row }) ?? {}) as Record<string, unknown>;
}

function resolveActionKey(action: Record<string, unknown>): string {
  const ref = propObject(action.actionRef);
  if (ref.key) return String(ref.key);
  const command = String(action.key ?? "");
  if (!command) return "";
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
  row: Record<string, unknown>
): Promise<void> {
  if (!actionVisible(action, row)) return;
  const actionKey = resolveActionKey(action);
  const label = propText(action.label) || String(action.key ?? "操作");
  if (!actionKey) {
    api.notify("按钮「" + label + "」未配置动作", "warning");
    return;
  }
  let confirmed: boolean | undefined;
  const confirmText = propText(action.confirm);
  if (confirmText) {
    const accepted = await api.confirm(confirmText, "操作确认", action.danger === true);
    if (!accepted) return;
    confirmed = true;
  }
  await api.runAction({
    actionKey,
    params: actionParams(action, row),
    scope: { row },
    confirmed
  });
}

function onRowClick(row: Record<string, unknown>): void {
  const handler = props.node.handlers?.rowClick;
  if (!handler) return;
  void api.runHandler(props.node, "rowClick", { row }, { row });
}

/* -------------------------------------------------------------- pagination */

const pageSourceId = computed(() => String(nodeProps.value.dataSourceId ?? ""));
const pageSource = computed(() => api.data[pageSourceId.value]);
const pageNumber = computed(() => Number(pageSource.value?.page ?? 1));
const pageTotal = computed(() => Number(pageSource.value?.total ?? 0));
const pageSize = computed(() => Math.max(1, Number(pageSource.value?.size ?? 10)));
const totalPages = computed(() => Math.max(1, Math.ceil(pageTotal.value / pageSize.value)));

function goPage(delta: number): void {
  const next = Math.min(totalPages.value, Math.max(1, pageNumber.value + delta));
  if (next === pageNumber.value) return;
  const query = api.state.query;
  if (query && typeof query === "object") (query as Record<string, unknown>).page = next;
  if (pageSourceId.value) void api.refreshDataSource(pageSourceId.value);
}

/* -------------------------------------------------------------------- form */

const formModel = computed<Record<string, unknown>>(() => {
  const value = api.evaluate(parseJsonProp(nodeProps.value.model), scope.value);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
});
const formFields = computed(() => listProp("fieldList"));

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

function formValue(item: Record<string, unknown>): unknown {
  return formModel.value[formFieldKey(item)];
}

function formInputValue(item: Record<string, unknown>): string {
  const value = formValue(item);
  return value === undefined || value === null ? "" : String(value);
}

function setFormValue(item: Record<string, unknown>, value: unknown): void {
  const key = formFieldKey(item);
  if (key) formModel.value[key] = value;
}

function formOptions(item: Record<string, unknown>): EnumValueDef[] {
  return optionsOf(item.enumRef, formFieldOf(item));
}

function formPickerLabels(item: Record<string, unknown>): string[] {
  return formOptions(item).map((option) => option.label);
}

function formPickerIndex(item: Record<string, unknown>): number {
  const value = formValue(item);
  const index = formOptions(item).findIndex((option) => String(option.value) === String(value));
  return index < 0 ? 0 : index;
}

function formSelectText(item: Record<string, unknown>): string {
  const value = formValue(item);
  const found = formOptions(item).find((option) => String(option.value) === String(value));
  return found?.label ?? (value === undefined || value === null || value === "" ? "请选择" : String(value));
}

function onFormPick(item: Record<string, unknown>, event: { detail: { value: number | string } }): void {
  const options = formOptions(item);
  const index = Number(event.detail.value);
  if (options[index]) setFormValue(item, options[index].value);
}

function formReadonly(item: Record<string, unknown>): boolean {
  return item.readonly === true || boolProp("readonly") || formFieldOf(item)?.immutable === true;
}

function pad(value: number): string {
  return value < 10 ? "0" + value : String(value);
}

function datePart(value: unknown): string {
  if (!value) {
    const now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function timePart(value: unknown): string {
  if (!value) return "09:00";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "09:00";
  return pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function setFormDate(item: Record<string, unknown>, value: string): void {
  setFormValue(item, value + "T" + timePart(formValue(item)) + ":00");
}

function setFormTime(item: Record<string, unknown>, value: string): void {
  setFormValue(item, datePart(formValue(item)) + "T" + value + ":00");
}

function inputEventValue(event: unknown): string {
  const detail = (event as { detail?: { value?: unknown } } | null)?.detail;
  return detail?.value === undefined || detail.value === null ? "" : String(detail.value);
}

function setFormInput(item: Record<string, unknown>, event: unknown): void {
  setFormValue(item, inputEventValue(event));
}

function setFormNumber(item: Record<string, unknown>, event: unknown): void {
  const value = inputEventValue(event);
  setFormValue(item, value === "" ? null : Number(value));
}

function setFormSwitch(item: Record<string, unknown>, event: unknown): void {
  const detail = (event as { detail?: { value?: unknown } } | null)?.detail;
  setFormValue(item, Boolean(detail?.value));
}

function chooseFormOption(item: Record<string, unknown>, option: EnumValueDef): void {
  setFormValue(item, option.value);
}

async function submitForm(): Promise<void> {
  await api.runHandler(props.node, "submit", {}, { ...scope.value, form: formModel.value });
}

function resetForm(): void {
  for (const key of Object.keys(formModel.value)) delete formModel.value[key];
}

/* ------------------------------------------------------------ descriptions */

const descriptionItems = computed(() => listProp("fieldList"));
const descriptionSourceId = computed(() => String(nodeProps.value.dataSourceId ?? ""));
const descriptionRow = computed<Record<string, unknown>>(() => {
  const source = api.data[descriptionSourceId.value];
  if (!source) return {};
  return source.item ?? source.rows?.[0] ?? {};
});

function descriptionKey(item: Record<string, unknown>): string {
  return String(item.field ?? "");
}

function descriptionLabel(item: Record<string, unknown>): string {
  return propText(item.label) || fieldOfKey(item.field)?.label || descriptionKey(item);
}

function descriptionText(item: Record<string, unknown>): string {
  const key = descriptionKey(item);
  if (!key) return "";
  const field = fieldOfKey(key);
  const value = descriptionRow.value[key];
  if (!field) return value === undefined || value === null ? "-" : String(value);
  return displayValue(schemas.value, field, item, value);
}

/* ------------------------------------------------------------------ dialog */

const dialogOpen = computed(() => truthy(api.evaluate(nodeProps.value.model, scope.value)));
const dialogTitle = computed(() => textProp("title") || "编辑");
const dialogMode = computed(() => String(nodeProps.value.mode ?? "dialog"));
const showDialogFooter = computed(() => nodeProps.value.showFooter !== false);

function closeSelf(): void {
  if (props.dialogKey) api.closeDialog(props.dialogKey);
}

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

/* ------------------------------------------------------------------- misc */

const textContent = computed(() => {
  const value = api.evaluate(nodeProps.value.content, scope.value);
  return value === undefined || value === null ? "" : String(value);
});

const statusText = computed(() => {
  const value = api.evaluate(
    nodeProps.value.text ?? nodeProps.value.label ?? nodeProps.value.value,
    scope.value
  );
  return value === undefined || value === null ? "" : String(value);
});

const statusColor = computed(() => String(nodeProps.value.color ?? "info"));
const customTitle = computed(() => String(nodeProps.value.title ?? props.node.component));
</script>

<template>
  <view v-if="isVisible" class="runtime-node">
    <view v-if="node.component === 'x-page'" class="x-page">
      <view v-if="textProp('title') || textProp('subtitle')" class="x-page__head">
        <text v-if="textProp('title')" class="x-page__title">{{ textProp("title") }}</text>
        <text v-if="textProp('subtitle')" class="x-page__subtitle">{{ textProp("subtitle") }}</text>
      </view>
      <view class="x-page__body">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </view>
    </view>

    <view v-else-if="node.component === 'x-card'" class="x-card mf-card">
      <view v-if="textProp('title')" class="x-card__head">
        <text class="x-card__title">{{ textProp("title") }}</text>
        <view v-if="slotNodes('extra').length" class="x-card__extra">
          <RuntimeNodeRenderer
            v-for="child in slotNodes('extra')"
            :key="child.id"
            :node="child"
            :scope="scope"
          />
        </view>
      </view>
      <view class="x-card__body">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </view>
    </view>

    <view v-else-if="node.component === 'x-toolbar'" class="x-toolbar">
      <RuntimeNodeRenderer
        v-for="child in [...slotNodes('left'), ...childNodes(node), ...slotNodes('right')]"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </view>

    <button
      v-else-if="node.component === 'x-btn'"
      :class="buttonClass(nodeProps.type, nodeProps.plain === true, nodeProps.size === 'small')"
      :disabled="isDisabled || !isPermitted || buttonLoading"
      @click.stop="runButton"
    >
      <text>{{ textProp("text") || textProp("label") || "按钮" }}</text>
    </button>

    <text v-else-if="node.component === 'x-text'" class="x-text">{{ textContent }}</text>

    <view v-else-if="node.component === 'x-search-form'" class="x-search">
      <view class="x-search__head">
        <text class="x-search__title">{{ textProp("title") || "筛选条件" }}</text>
        <view class="x-search__actions">
          <RuntimeNodeRenderer
            v-for="child in slotNodes('right')"
            :key="child.id"
            :node="child"
            :scope="scope"
          />
        </view>
      </view>
      <view class="x-search__grid">
        <view v-for="item in searchFields" :key="searchFieldKey(item)" class="x-search__field">
          <text class="x-search__label">{{ searchLabel(item) }}</text>
          <input
            v-if="item.op === 'like' || item.op === 'eq' || (item.op === 'in' && !searchOptions(item).length)"
            class="mf-input"
            :value="searchInputValue(item)"
            :placeholder="propText(item.placeholder) || ('请输入' + searchLabel(item))"
            @input="setSearchValue(item, inputEventValue($event))"
          />
          <picker
            v-else-if="item.op === 'in'"
            :range="searchPickerLabels(item)"
            :value="searchPickerIndex(item)"
            @change="onSearchPick(item, $event)"
          >
            <view class="mf-input x-search__picker">{{ searchSelectText(item) }}</view>
          </picker>
          <view v-else-if="item.op === 'between'" class="x-search__range">
            <picker
              mode="date"
              :value="searchBetween(item).start.slice(0, 10)"
              @change="setSearchBetween(item, 'start', $event.detail.value)"
            >
              <view class="mf-input x-search__date">{{ searchBetween(item).start ? searchBetween(item).start.slice(0, 10) : "开始日期" }}</view>
            </picker>
            <text class="x-search__tilde">至</text>
            <picker
              mode="date"
              :value="searchBetween(item).end.slice(0, 10)"
              @change="setSearchBetween(item, 'end', $event.detail.value)"
            >
              <view class="mf-input x-search__date">{{ searchBetween(item).end ? searchBetween(item).end.slice(0, 10) : "结束日期" }}</view>
            </picker>
          </view>
        </view>
      </view>
      <view v-if="childNodes(node).length" class="x-search__extra">
        <RuntimeNodeRenderer
          v-for="child in childNodes(node)"
          :key="child.id"
          :node="child"
          :scope="scope"
        />
      </view>
      <view class="x-search__footer">
        <view class="x-search__slot">
          <RuntimeNodeRenderer
            v-for="child in slotNodes('left')"
            :key="child.id"
            :node="child"
            :scope="scope"
          />
        </view>
        <view class="x-search__slot">
          <button class="mf-btn mf-btn--sm" @click="clearSearch">重置</button>
          <button class="mf-btn mf-btn--sm mf-btn--primary" @click="submitSearch">查询</button>
        </view>
      </view>
    </view>

    <view v-else-if="node.component === 'x-table'" class="x-table">
      <view v-if="tableLoading" class="x-table__loading">正在加载…</view>
      <view v-else-if="tableError" class="x-table__error">{{ tableError }}</view>
      <view v-else-if="tableRows.length === 0" class="x-table__empty">
        {{ textProp("emptyText") || "暂无数据" }}
      </view>
      <view v-else class="x-table__rows">
        <view
          v-for="row in tableRows"
          :key="String(row.id || row.applicant_id || row.created_at)"
          class="x-row-card"
          @click="onRowClick(row)"
        >
        <view class="x-row-card__head">
          <view class="x-row-card__identity">
            <text class="x-row-card__title">{{ rowTitle(row) }}</text>
            <text class="x-row-card__sub">{{ cellText({ field: 'created_at', label: '申请时间', format: 'YYYY-MM-DD HH:mm' }, row) }}</text>
          </view>
          <text v-if="statusLabel(row)" :class="statusClass(row)">{{ statusLabel(row) }}</text>
        </view>
        <view class="x-row-card__body">
          <view
            v-for="column in dataColumns"
            :key="String(column.field)"
            v-show="cellVisible(column, row)"
            class="x-row-field"
          >
            <text class="x-row-field__label">{{ columnLabel(column) }}</text>
            <text class="x-row-field__value">{{ cellText(column, row) }}</text>
          </view>
        </view>
          <view v-if="actionColumn" class="x-row-card__actions">
            <button
              v-for="action in rowActionButtons(actionColumn)"
              v-show="actionVisible(action, row)"
              :key="String(action.key)"
              :class="buttonClass(action.danger ? 'danger' : 'primary', true, true)"
              @click.stop="runRowAction(action, row)"
            >
              <text>{{ propText(action.label) || String(action.key) }}</text>
            </button>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="node.component === 'x-pagination'" class="x-pagination">
      <text class="x-pagination__info">共 {{ pageTotal }} 条 · 第 {{ pageNumber }} / {{ totalPages }} 页</text>
      <view class="x-pagination__actions">
        <button class="mf-btn mf-btn--sm" :disabled="pageNumber <= 1" @click="goPage(-1)">上一页</button>
        <button class="mf-btn mf-btn--sm" :disabled="pageNumber >= totalPages" @click="goPage(1)">下一页</button>
      </view>
    </view>

    <view v-else-if="node.component === 'x-form'" class="x-form">
      <view v-for="item in formFields" :key="formFieldKey(item)" class="x-form__item">
        <view class="x-form__label-row">
          <text class="x-form__label">{{ formLabel(item) }}</text>
          <text v-if="item.required === true" class="x-form__required">*</text>
        </view>

        <picker
          v-if="formWidget(item) === 'x-select'"
          :range="formPickerLabels(item)"
          :value="formPickerIndex(item)"
          :disabled="formReadonly(item)"
          @change="onFormPick(item, $event)"
        >
          <view class="mf-input x-form__picker">{{ formSelectText(item) }}</view>
        </picker>

        <view v-else-if="formWidget(item) === 'x-radio-group'" class="x-form__radios">
          <view
            v-for="option in formOptions(item)"
            :key="String(option.value)"
            :class="['x-form__radio', String(formValue(item)) === String(option.value) ? 'x-form__radio--active' : '']"
            @click="chooseFormOption(item, option)"
          >
            <text>{{ option.label }}</text>
          </view>
        </view>

        <view v-else-if="formWidget(item) === 'x-datetime-picker'" class="x-form__datetime">
          <picker mode="date" :value="datePart(formValue(item))" :disabled="formReadonly(item)" @change="setFormDate(item, $event.detail.value)">
            <view class="mf-input x-form__date">{{ datePart(formValue(item)) }}</view>
          </picker>
          <picker mode="time" :value="timePart(formValue(item))" :disabled="formReadonly(item)" @change="setFormTime(item, $event.detail.value)">
            <view class="mf-input x-form__time">{{ timePart(formValue(item)) }}</view>
          </picker>
        </view>

        <picker
          v-else-if="formWidget(item) === 'x-date-picker'"
          mode="date"
          :value="datePart(formValue(item))"
          :disabled="formReadonly(item)"
          @change="setFormValue(item, $event.detail.value)"
        >
          <view class="mf-input x-form__picker">{{ datePart(formValue(item)) }}</view>
        </picker>

        <switch
          v-else-if="formWidget(item) === 'x-switch'"
          :checked="Boolean(formValue(item))"
          :disabled="formReadonly(item)"
          color="#4f46e5"
          @change="setFormSwitch(item, $event)"
        />

        <textarea
          v-else-if="formWidget(item) === 'x-textarea'"
          class="mf-textarea"
          :value="formInputValue(item)"
          :placeholder="'请输入' + formLabel(item)"
          :disabled="formReadonly(item)"
          :maxlength="-1"
          @input="setFormInput(item, $event)"
        />

        <input
          v-else-if="formWidget(item) === 'x-number'"
          class="mf-input"
          type="digit"
          :value="formInputValue(item)"
          :placeholder="'请输入' + formLabel(item)"
          :disabled="formReadonly(item)"
          @input="setFormNumber(item, $event)"
        />

        <view v-else-if="formWidget(item) === 'x-upload'" class="x-form__upload">
          <text>附件上传暂未接入小程序，请在 H5 / 桌面端补充</text>
        </view>

        <input
          v-else
          class="mf-input"
          :value="formInputValue(item)"
          :placeholder="'请输入' + formLabel(item)"
          :disabled="formReadonly(item) || formWidget(item) === 'x-employee-picker'"
          @input="setFormInput(item, $event)"
        />

        <text v-if="textProp('help')" class="x-form__help">{{ textProp("help") }}</text>
        <text v-else-if="item.help" class="x-form__help">{{ propText(item.help) }}</text>
      </view>
      <view v-if="nodeProps.showActions === true" class="x-form__actions">
        <button class="mf-btn" @click="resetForm">{{ textProp("resetText") || "重置" }}</button>
        <button class="mf-btn mf-btn--primary" @click="submitForm">{{ textProp("submitText") || "提交" }}</button>
      </view>
    </view>

    <view v-else-if="node.component === 'x-form-item'" class="x-form-item">
      <text class="x-form__label">{{ textProp("label") }}</text>
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </view>

    <view v-else-if="node.component === 'x-descriptions'" class="x-descriptions">
      <view v-for="item in descriptionItems" :key="descriptionKey(item)" class="x-description">
        <text class="x-description__label">{{ descriptionLabel(item) }}</text>
        <text class="x-description__value">{{ descriptionText(item) }}</text>
      </view>
      <view v-if="descriptionItems.length === 0" class="x-table__empty">暂无详情字段</view>
    </view>

    <view v-else-if="node.component === 'x-approval-timeline'" class="x-placeholder">
      <text class="x-placeholder__title">审批时间线</text>
      <text class="x-placeholder__body">小程序暂未接入流程时间线，请到 H5 或桌面端查看。</text>
    </view>

    <view v-else-if="node.component === 'x-attachment-list'" class="x-placeholder">
      <text class="x-placeholder__title">附件列表</text>
      <text class="x-placeholder__body">运行时的附件上传与下载将在后续版本接入。</text>
    </view>

    <text v-else-if="node.component === 'x-status-tag'" :class="chipClass(statusColor)">
      {{ statusText }}
    </text>

    <view v-else-if="node.component === 'x-row-actions'" class="x-row-actions">
      <button
        v-for="action in listProp('buttons')"
        v-show="actionVisible(action, scope.row || {})"
        :key="String(action.key)"
        :class="buttonClass(action.danger ? 'danger' : 'primary', true, true)"
        @click.stop="runRowAction(action, scope.row || {})"
      >
        <text>{{ propText(action.label) || String(action.key) }}</text>
      </button>
    </view>

    <view v-else-if="node.component === 'x-dialog'" class="x-dialog-host">
      <view v-if="dialogOpen" class="mf-overlay">
        <view :class="['mf-sheet', dialogMode === 'dialog' ? 'mf-sheet--dialog' : '']">
          <view class="mf-sheet__head">
            <text class="mf-sheet__title">{{ dialogTitle }}</text>
            <text class="mf-sheet__close" @click="closeSelf">×</text>
          </view>
          <scroll-view scroll-y class="mf-sheet__body">
            <RuntimeNodeRenderer
              v-for="child in childNodes(node)"
              :key="child.id"
              :node="child"
              :scope="scope"
            />
          </scroll-view>
          <view v-if="showDialogFooter" class="mf-sheet__footer">
            <button class="mf-btn" @click="closeSelf">取消</button>
            <button class="mf-btn mf-btn--primary" @click="confirmDialog">确定</button>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="x-custom">
      <text class="x-custom__title">{{ customTitle }}</text>
      <text class="x-custom__body">{{ node.component }} · 小程序暂未实现该组件</text>
      <RuntimeNodeRenderer
        v-for="child in childNodes(node)"
        :key="child.id"
        :node="child"
        :scope="scope"
      />
    </view>
  </view>
</template>

<style scoped>
.runtime-node {
  min-width: 0;
}
.x-page__head {
  padding: 4rpx 4rpx 18rpx;
}
.x-page__title {
  display: block;
  color: #0f172a;
  font-size: 38rpx;
  font-weight: 700;
  letter-spacing: -0.5rpx;
}
.x-page__subtitle {
  display: block;
  margin-top: 6rpx;
  color: #64748b;
  font-size: 24rpx;
}
.x-page__body {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.x-card {
  padding: 24rpx;
}
.x-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}
.x-card__title {
  color: #0f172a;
  font-size: 29rpx;
  font-weight: 600;
}
.x-card__extra,
.x-search__actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.x-card__body {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.x-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14rpx;
}
.x-text {
  color: #475569;
  font-size: 25rpx;
  line-height: 1.6;
}
.x-search {
  padding: 22rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 22rpx;
  background: #f8fafc;
}
.x-search__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 18rpx;
}
.x-search__title {
  color: #334155;
  font-size: 27rpx;
  font-weight: 600;
}
.x-search__grid {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.x-search__field {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.x-search__label {
  color: #64748b;
  font-size: 23rpx;
}
.x-search__picker,
.mf-input.x-search__picker {
  display: flex;
  align-items: center;
  height: 72rpx;
  color: #334155;
}
.x-search__range,
.x-form__datetime {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.x-search__range > picker,
.x-form__datetime > picker {
  flex: 1;
  min-width: 0;
}
.x-search__date,
.x-form__date,
.x-form__time {
  display: flex;
  align-items: center;
  min-height: 72rpx;
}
.x-search__tilde {
  color: #94a3b8;
  font-size: 22rpx;
}
.x-search__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 20rpx;
}
.x-search__slot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
}
.x-search__extra {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 18rpx;
}
.x-table {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.x-table__rows {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.x-table__loading,
.x-table__empty,
.x-table__error {
  padding: 60rpx 20rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 24rpx;
}
.x-table__error {
  color: #be123c;
}
.x-row-card {
  padding: 22rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 20rpx;
  background: #ffffff;
}
.x-row-card:active {
  background: #f8fafc;
}
.x-row-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f1f5f9;
}
.x-row-card__identity {
  min-width: 0;
}
.x-row-card__title {
  display: block;
  color: #0f172a;
  font-size: 29rpx;
  font-weight: 600;
}
.x-row-card__sub {
  display: block;
  margin-top: 4rpx;
  color: #94a3b8;
  font-size: 21rpx;
}
.x-row-card__body {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 20rpx;
  padding: 16rpx 0 4rpx;
}
.x-row-field {
  display: flex;
  flex-direction: column;
  gap: 3rpx;
  width: 46%;
  min-width: 0;
}
.x-row-field__label {
  color: #94a3b8;
  font-size: 21rpx;
}
.x-row-field__value {
  color: #334155;
  font-size: 24rpx;
  word-break: break-all;
}
.x-row-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10rpx;
  margin-top: 12rpx;
}
.x-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 10rpx 2rpx;
}
.x-pagination__info {
  color: #64748b;
  font-size: 22rpx;
}
.x-pagination__actions {
  display: flex;
  gap: 10rpx;
}
.x-form {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}
.x-form__item {
  display: flex;
  flex-direction: column;
  gap: 9rpx;
}
.x-form__label-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.x-form__label {
  color: #334155;
  font-size: 24rpx;
  font-weight: 500;
}
.x-form__required {
  color: #e11d48;
  font-size: 24rpx;
}
.x-form__picker {
  display: flex;
  align-items: center;
  min-height: 72rpx;
  color: #334155;
}
.x-form__radios {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.x-form__radio {
  padding: 12rpx 20rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 12rpx;
  background: #f8fafc;
  color: #64748b;
  font-size: 23rpx;
}
.x-form__radio--active {
  border-color: #a5b4fc;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
}
.x-form__help {
  color: #94a3b8;
  font-size: 21rpx;
  line-height: 1.45;
}
.x-form__upload {
  padding: 22rpx;
  border: 1rpx dashed #cbd5e1;
  border-radius: 14rpx;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 22rpx;
  text-align: center;
}
.x-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}
.x-descriptions {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.x-description {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f1f5f9;
}
.x-description__label {
  width: 180rpx;
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 23rpx;
}
.x-description__value {
  flex: 1;
  min-width: 0;
  color: #334155;
  font-size: 24rpx;
  word-break: break-all;
}
.x-placeholder {
  padding: 24rpx;
  border: 1rpx dashed #cbd5e1;
  border-radius: 16rpx;
  background: #f8fafc;
}
.x-placeholder__title {
  display: block;
  color: #475569;
  font-size: 25rpx;
  font-weight: 600;
}
.x-placeholder__body {
  display: block;
  margin-top: 6rpx;
  color: #94a3b8;
  font-size: 22rpx;
  line-height: 1.5;
}
.x-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.mf-sheet--dialog {
  border-radius: 24rpx 24rpx 0 0;
}
.mf-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx 18rpx;
  border-bottom: 1rpx solid #f1f5f9;
}
.mf-sheet__title {
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 600;
}
.mf-sheet__close {
  padding: 4rpx 10rpx;
  color: #94a3b8;
  font-size: 38rpx;
  line-height: 1;
}
.mf-sheet__body {
  max-height: 68vh;
  padding: 22rpx 28rpx;
}
.mf-sheet__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
  padding: 18rpx 28rpx calc(22rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f1f5f9;
}
.x-custom {
  padding: 24rpx;
  border: 1rpx dashed #cbd5e1;
  border-radius: 18rpx;
  background: #f8fafc;
}
.x-custom__title {
  display: block;
  color: #475569;
  font-size: 25rpx;
  font-weight: 600;
}
.x-custom__body {
  display: block;
  margin-top: 5rpx;
  color: #94a3b8;
  font-size: 22rpx;
}
</style>
