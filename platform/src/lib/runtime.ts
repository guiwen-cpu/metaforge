import { formatDateTime } from "@/lib/format";
import type { RuntimeField, TaskDetail, TimelineItem } from "@/types/runtime";

export type WorkflowTone = "draft" | "pending" | "approved" | "rejected" | "returned" | "neutral";

export function workflowStatusMeta(status?: string | null): { label: string; tone: WorkflowTone } {
  switch (status) {
    case "draft":
      return { label: "草稿", tone: "draft" };
    case "pending":
      return { label: "审批中", tone: "pending" };
    case "approved":
      return { label: "已通过", tone: "approved" };
    case "rejected":
      return { label: "已驳回", tone: "rejected" };
    case "returned":
      return { label: "已退回", tone: "returned" };
    case "cancelled":
      return { label: "已取消", tone: "neutral" };
    default:
      return { label: status || "未知", tone: "neutral" };
  }
}

export function workflowStatusClass(status?: string | null): string {
  const tone = workflowStatusMeta(status).tone;
  const map: Record<WorkflowTone, string> = {
    draft: "bg-slate-100 text-slate-600 ring-slate-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rejected: "bg-rose-50 text-rose-600 ring-rose-200",
    returned: "bg-orange-50 text-orange-700 ring-orange-200",
    neutral: "bg-slate-100 text-slate-500 ring-slate-200"
  };
  return `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${map[tone]}`;
}

export function actionButtonType(style?: string | null): "primary" | "danger" | "warning" | "default" {
  if (style === "primary" || style === "danger" || style === "warning") return style;
  return "default";
}

export function isFieldEditable(detail: TaskDetail, key: string): boolean {
  if (!detail.can_act) return false;
  if (detail.readonly_fields.includes(key)) return false;
  if (detail.editable_fields.includes(key)) return true;
  return detail.task_key === "applySubmit" && detail.editable_fields.length === 0;
}

export function fieldDisplay(field: RuntimeField, value: unknown = field.value): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join("、") : "—";
  }
  const option = field.options?.find((item) => item.value === String(value));
  if (option) return option.label;
  if (field.type === "datetime" || field.type === "date") return formatDateTime(String(value));
  return String(value);
}

export function arrayText(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

export function splitList(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function durationText(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) return "";
  if (durationMs < 1000) return "<1 秒";
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

export function activityTitle(item: TimelineItem): string {
  if (item.name) return item.name;
  if (item.type === "startEvent") return "开始";
  if (item.type === "endEvent") return "结束";
  return item.activity_id;
}
