import type { DataEntity, DataField, DataSchema, EnumValueDef } from "@/types/dataModel";
import type { UISchema } from "@/types/uiModel";
import { findEntity, textOf } from "@/lib/uiModel";
import type { DataSourceQueryFilter } from "@/types/runtime";

export function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 设计器持久化的结构化 props 可能是 JSON 字符串（历史数据），运行时统一在这里解开。
 * 只尝试对象/数组，避免把普通文本 "123" 误转成数字。
 */
export function parseJsonProp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === "{" && last === "}") || (first === "[" && last === "]")) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
}

export function propObject(value: unknown): Record<string, unknown> {
  const parsed = parseJsonProp(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function propList(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseJsonProp(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) =>
    typeof item === "string"
      ? { field: item }
      : item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {}
  );
}

export function propText(value: unknown): string {
  return textOf(parseJsonProp(value));
}
export function initialPageState(defs: Record<string, unknown> | undefined): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (!defs || typeof defs !== "object") return state;
  for (const [key, value] of Object.entries(defs)) {
    if (value && typeof value === "object" && "initial" in (value as Record<string, unknown>)) {
      state[key] = cloneJson((value as Record<string, unknown>).initial);
    }
  }
  return state;
}

export function entityOf(schemas: DataSchema[], ref: unknown): DataEntity | null {
  return findEntity(schemas, ref);
}

export function fieldOf(entity: DataEntity | null, key: unknown): DataField | null {
  if (!entity || typeof key !== "string") return null;
  return entity.fields.find((field) => field.key === key) ?? null;
}

export function enumOf(schemas: DataSchema[], ref: unknown): EnumValueDef[] {
  const record = ref && typeof ref === "object" ? (ref as Record<string, unknown>) : null;
  const key = record ? String(record.key ?? "") : "";
  if (!key) return [];
  for (const schema of schemas) {
    const found = (schema.enums ?? []).find((item) => item.key === key);
    if (found) return [...found.values].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }
  return [];
}

export function fieldOptions(schemas: DataSchema[], field: DataField | null): EnumValueDef[] {
  if (!field) return [];
  if (field.enumValues?.length) return field.enumValues;
  return enumOf(schemas, field.enumRef);
}

export function enumLabel(schemas: DataSchema[], field: DataField | null, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const options = fieldOptions(schemas, field);
  const matched = options.find((item) => String(item.value) === String(value));
  return matched?.label ?? String(value);
}

export function enumColor(schemas: DataSchema[], field: DataField | null, value: unknown): string {
  const options = fieldOptions(schemas, field);
  return options.find((item) => String(item.value) === String(value))?.color ?? "info";
}

export function formatDateTime(value: unknown, pattern = "YYYY-MM-DD HH:mm"): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const map: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    HH: String(date.getHours()).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ss: String(date.getSeconds()).padStart(2, "0")
  };
  const converted = pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token] ?? token);
  return pattern === "YYYY-MM-DD" ? converted : converted;
}

export function displayValue(
  schemas: DataSchema[],
  field: DataField | null,
  column: Record<string, unknown>,
  value: unknown
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join("、") : "—";
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (field?.type === "enum" || column.widget === "x-enum-text" || column.widget === "x-status-tag") {
    const options = column.enumRef ? enumOf(schemas, column.enumRef) : fieldOptions(schemas, field);
    const matched = options.find((item) => String(item.value) === String(value));
    if (matched) return matched.label;
  }
  if (field?.type === "datetime" || field?.type === "date") {
    return formatDateTime(value, String(column.format ?? (field.type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm")));
  }
  return String(value);
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function buildSearchFilters(
  searchFields: Array<Record<string, unknown>>,
  query: Record<string, unknown>
): DataSourceQueryFilter[] {
  const filters: DataSourceQueryFilter[] = [];
  for (const item of searchFields) {
    const field = typeof item.field === "string" ? item.field : "";
    if (!field) continue;
    const op = String(item.op ?? "eq");
    const value = query[field];
    if (op === "in" || op === "notIn") {
      const list = Array.isArray(value) ? value : isEmpty(value) ? [] : [value];
      const normalized = list.filter((entry) => !isEmpty(entry)).map((entry) => String(entry));
      if (normalized.length) filters.push({ field, op, value: normalized });
      continue;
    }
    if (op === "between") {
      const pair = Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? [(value as Record<string, unknown>).start, (value as Record<string, unknown>).end]
          : [];
      const [start, end] = pair;
      const from = isoDate(start);
      const to = isoDate(end);
      if (from && to) filters.push({ field, op, value: [from, to] });
      continue;
    }
    if (op === "isNull" || op === "notNull") {
      if (value === true) filters.push({ field, op, value: true });
      continue;
    }
    if (isEmpty(value)) continue;
    filters.push({ field, op, value: typeof value === "string" ? value.trim() : value });
  }
  return filters;
}

export function dataSourceSnapshot(
  data: Record<string, { rows?: unknown[]; total?: number; page?: number; size?: number; item?: unknown }>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = {
      rows: value.rows ?? [],
      total: value.total ?? 0,
      page: value.page ?? 1,
      size: value.size ?? 10,
      item: value.item ?? null
    };
  }
  return out;
}

export function pageStateDefinition(page: UISchema): Record<string, unknown> {
  return (page.state ?? {}) as Record<string, unknown>;
}

export function searchFieldsOf(props: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(props.searchFieldList)
    ? (props.searchFieldList as Array<Record<string, unknown>>)
    : [];
}

export function columnsOf(props: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(props.columnList)
    ? (props.columnList as Array<Record<string, unknown>>)
    : [];
}

export function fieldListOf(props: Record<string, unknown>): Array<string | Record<string, unknown>> {
  return Array.isArray(props.fieldList)
    ? (props.fieldList as Array<string | Record<string, unknown>>)
    : [];
}