export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function shortChecksum(value?: string | null, length = 10): string {
  if (!value) return "—";
  return value.slice(0, length);
}

export function statusMeta(status: string): { label: string; tone: "draft" | "published" | "archived" } {
  if (status === "published") return { label: "已发布", tone: "published" };
  if (status === "archived") return { label: "已归档", tone: "archived" };
  return { label: "草稿", tone: "draft" };
}

export function appTypeLabel(type?: string | null): string {
  const map: Record<string, string> = {
    education: "教育",
    office: "办公",
    business: "业务",
    template: "模板",
    demo: "示例"
  };
  return (type && map[type]) || type || "业务";
}

export function prettyJson(value: unknown): string {
  if (value === undefined) return "null";
  return JSON.stringify(value, null, 2);
}