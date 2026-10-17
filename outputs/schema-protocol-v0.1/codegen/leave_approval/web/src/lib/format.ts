import type { ColumnSpec, OptionItem } from "@/generated/schema";

const pad = (value: number): string => (value < 10 ? "0" + value : String(value));

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function formatDate(value: unknown, withTime = false): string {
  if (isEmpty(value)) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  if (!withTime) return day;
  return day + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

export function formatNumber(value: unknown, digits = 0): string {
  if (isEmpty(value)) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function optionItem(options: OptionItem[] | undefined, value: unknown): OptionItem | undefined {
  if (!options) return undefined;
  return options.find((item) => String(item.value) === String(value));
}

export function optionLabel(options: OptionItem[] | undefined, value: unknown): string {
  if (isEmpty(value)) return "—";
  return optionItem(options, value)?.label ?? String(value);
}

export function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isEmpty(value)) return [];
  return [value];
}

export function fileCount(value: unknown): number {
  return toList(value).length;
}

export function fileUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { url?: unknown; objectKey?: unknown };
    return String(item.url ?? item.objectKey ?? "");
  }
  return "";
}

export function fileName(value: unknown): string {
  const url = fileUrl(value);
  if (!url) return "";
  const clean = url.split("?")[0];
  const name = clean.substring(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name) || "附件";
  } catch {
    return name || "附件";
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value = value / 1024;
    index += 1;
  }
  return (index === 0 ? value : value.toFixed(1)) + " " + units[index];
}

export function cellText(column: ColumnSpec, value: unknown): string {
  switch (column.format) {
    case "enum":
      return optionLabel(column.options, value);
    case "boolean":
      return value === true ? "是" : value === false ? "否" : "—";
    case "date":
      return formatDate(value, false);
    case "datetime":
      return formatDate(value, true);
    case "number":
      return formatNumber(value, column.digits ?? 0);
    case "files":
      return fileCount(value) + " 个附件";
    default:
      return isEmpty(value) ? "—" : String(value);
  }
}

export function tagTypeOf(column: ColumnSpec, value: unknown): "primary" | "success" | "warning" | "danger" | "info" {
  const color = optionItem(column.options, value)?.color;
  if (color === "primary" || color === "success" || color === "warning" || color === "danger" || color === "info") {
    return color;
  }
  return "info";
}

export function tagStyleOf(column: ColumnSpec, value: unknown): Record<string, string> {
  const color = optionItem(column.options, value)?.color;
  if (color && color.startsWith("#")) {
    return { color, borderColor: color, backgroundColor: color + "1a" };
  }
  return {};
}
