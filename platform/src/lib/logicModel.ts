import { ulid } from "./ulid";
import type {
  LogicAction,
  LogicApi,
  LogicFlow,
  LogicIssue,
  LogicRule,
  LogicSchema,
  LogicStep,
  LogicStepType,
  StepTypeDef
} from "@/types/logicModel";

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function exprText(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("$lit" in record) {
      const literal = record.$lit;
      return typeof literal === "string" ? literal : JSON.stringify(literal);
    }
    if (typeof record.$ref === "string") return record.$ref;
    if (typeof record.$fn === "string") {
      const args = Array.isArray(record.$args) ? record.$args.map(exprText).join(", ") : "";
      return `${record.$fn}(${args})`;
    }
    if (typeof record.$template === "string") return record.$template;
    return JSON.stringify(value);
  }
  return String(value);
}

function step(type: LogicStepType, patch: Record<string, unknown> = {}): LogicStep {
  return { id: "", type, ...patch };
}

const BRANCH_GROUP = "流程控制";
const DATA_GROUP = "数据与接口";
const UX_GROUP = "交互反馈";
const FLOW_GROUP = "流程与事件";
const ERROR_GROUP = "异常处理";

export const STEP_TYPES: StepTypeDef[] = [
  {
    type: "branch",
    label: "条件分支",
    group: BRANCH_GROUP,
    icon: "⑂",
    color: "bg-violet-50 text-violet-600",
    description: "按条件走不同步骤，支持多个 case 与 else",
    fields: [],
    create: () =>
      step("branch", {
        cases: [{ name: "case1", when: { $lit: true }, then: [] }],
        else: []
      })
  },
  {
    type: "loop",
    label: "循环",
    group: BRANCH_GROUP,
    icon: "↻",
    color: "bg-violet-50 text-violet-600",
    description: "遍历集合，对每一项执行子步骤",
    fields: [
      { key: "over", label: "遍历集合", kind: "json", placeholder: '{ "$ref": "$ctx.rows" }' },
      { key: "itemName", label: "元素变量名", kind: "text", placeholder: "item" },
      { key: "indexName", label: "索引变量名", kind: "text", placeholder: "index" },
      { key: "concurrency", label: "并发数", kind: "number" },
      { key: "maxIterations", label: "最大迭代", kind: "number" },
      { key: "breakWhen", label: "中断条件", kind: "json" },
      { key: "collect", label: "结果收集到", kind: "text", placeholder: "vars.items" }
    ],
    create: () => step("loop", { over: { $ref: "$ctx.rows" }, itemName: "item", steps: [] })
  },
  {
    type: "parallel",
    label: "并行",
    group: BRANCH_GROUP,
    icon: "⇉",
    color: "bg-violet-50 text-violet-600",
    description: "多个分支并发执行，可设置失败策略",
    fields: [
      { key: "failFast", label: "快速失败", kind: "bool" },
      { key: "timeoutMs", label: "超时毫秒", kind: "number" }
    ],
    create: () =>
      step("parallel", {
        branches: [
          { name: "A", steps: [] },
          { name: "B", steps: [] }
        ],
        failFast: true
      })
  },
  {
    type: "delay",
    label: "延迟",
    group: BRANCH_GROUP,
    icon: "⏱",
    color: "bg-violet-50 text-violet-600",
    description: "等待固定毫秒或到指定时间",
    fields: [
      { key: "ms", label: "等待毫秒", kind: "number" },
      { key: "until", label: "等待至", kind: "json" }
    ],
    create: () => step("delay", { ms: 1000 })
  },
  {
    type: "transaction",
    label: "事务",
    group: BRANCH_GROUP,
    icon: "▣",
    color: "bg-violet-50 text-violet-600",
    description: "把子步骤包裹在同一数据库事务中",
    fields: [
      { key: "isolation", label: "隔离级别", kind: "select", options: ["readCommitted", "repeatableRead", "serializable"] },
      { key: "readOnly", label: "只读事务", kind: "bool" }
    ],
    create: () => step("transaction", { isolation: "readCommitted", readOnly: false, steps: [] })
  },
  {
    type: "apiCall",
    label: "调用 API",
    group: DATA_GROUP,
    icon: "⇄",
    color: "bg-indigo-50 text-indigo-600",
    description: "调用逻辑 Schema 中声明的 API，可重试并写入变量",
    fields: [
      { key: "apiRef", label: "目标 API", kind: "ref", refKind: "api" },
      { key: "params", label: "请求参数", kind: "json" },
      { key: "assignTo", label: "结果写入", kind: "text", placeholder: "vars.result" },
      { key: "resultPath", label: "结果取值路径", kind: "text", placeholder: "data.items" },
      { key: "retry", label: "重试策略", kind: "json" },
      { key: "confirmToast", label: "成功提示", kind: "text" }
    ],
    create: () => step("apiCall", { apiRef: { kind: "api", key: "", version: 1 }, params: {} })
  },  {
    type: "callAction",
    label: "调用动作",
    group: DATA_GROUP,
    icon: "↗",
    color: "bg-indigo-50 text-indigo-600",
    description: "复用同一逻辑 Schema 中的另一个动作",
    fields: [
      { key: "actionRef", label: "目标动作", kind: "ref", refKind: "action" },
      { key: "params", label: "入参", kind: "json" },
      { key: "assignTo", label: "结果写入", kind: "text" }
    ],
    create: () => step("callAction", { actionRef: { kind: "action", key: "", version: 1 }, params: {} })
  },
  {
    type: "assign",
    label: "赋值",
    group: DATA_GROUP,
    icon: "=",
    color: "bg-indigo-50 text-indigo-600",
    description: "把表达式结果写入 state / form / vars",
    fields: [
      { key: "target", label: "赋值目标", kind: "text", placeholder: "state.loading" },
      { key: "value", label: "值 / 表达式", kind: "json" },
      { key: "merge", label: "合并对象", kind: "bool" }
    ],
    create: () => step("assign", { target: "", value: { $lit: "" } })
  },
  {
    type: "validate",
    label: "校验",
    group: DATA_GROUP,
    icon: "✓",
    color: "bg-teal-50 text-teal-600",
    description: "表单 / 实体字段必填与服务端二次校验",
    fields: [
      { key: "scope", label: "校验范围", kind: "select", options: ["form", "entity", "allForms"] },
      { key: "fields", label: "字段列表", kind: "json" },
      { key: "server", label: "服务端校验", kind: "bool" },
      { key: "message", label: "校验失败文案", kind: "json" }
    ],
    create: () => step("validate", { scope: "form", fields: [], server: true })
  },
  {
    type: "code",
    label: "自定义代码",
    group: DATA_GROUP,
    icon: "⌘",
    color: "bg-sky-50 text-sky-600",
    description: "在沙箱内执行 TS / Java 代码扩展逻辑",
    fields: [
      { key: "lang", label: "语言", kind: "select", options: ["ts", "java"] },
      { key: "runtime", label: "运行端", kind: "select", options: ["browser", "server"] },
      { key: "entry", label: "入口函数", kind: "text", placeholder: "main" },
      { key: "source", label: "代码", kind: "code", rows: 14 },
      { key: "inputs", label: "输入参数", kind: "json" },
      { key: "outputs", label: "输出声明", kind: "json" },
      { key: "assignTo", label: "结果写入", kind: "text" },
      { key: "timeoutMs", label: "超时毫秒", kind: "number" },
      { key: "sandbox", label: "沙箱策略", kind: "json" }
    ],
    create: () =>
      step("code", {
        lang: "ts",
        runtime: "server",
        entry: "main",
        source: "export default function main(input) {\n  return input;\n}",
        inputs: [],
        outputs: [],
        timeoutMs: 2000,
        sandbox: { network: false, storage: false, dom: false, allowEval: false, memoryLimitMb: 32 }
      })
  },
  {
    type: "openDialog",
    label: "打开弹窗",
    group: UX_GROUP,
    icon: "▢",
    color: "bg-amber-50 text-amber-600",
    description: "打开页面上声明的对话框 / 抽屉",
    fields: [
      { key: "dialogKey", label: "弹窗 key", kind: "text" },
      { key: "title", label: "标题", kind: "text" },
      { key: "mode", label: "形态", kind: "select", options: ["dialog", "drawer", "modal"] },
      { key: "width", label: "宽度", kind: "text", placeholder: "640px" },
      { key: "data", label: "传入数据", kind: "json" },
      { key: "await", label: "等待关闭", kind: "bool" }
    ],
    create: () => step("openDialog", { dialogKey: "", mode: "dialog", await: true })
  },
  {
    type: "closeDialog",
    label: "关闭弹窗",
    group: UX_GROUP,
    icon: "▣",
    color: "bg-amber-50 text-amber-600",
    description: "关闭指定弹窗并回传结果",
    fields: [
      { key: "dialogKey", label: "弹窗 key", kind: "text" },
      { key: "result", label: "返回结果", kind: "json" }
    ],
    create: () => step("closeDialog", { dialogKey: "" })
  },
  {
    type: "confirm",
    label: "确认框",
    group: UX_GROUP,
    icon: "?",
    color: "bg-amber-50 text-amber-600",
    description: "二次确认，可要求填写原因并分支处理",
    fields: [
      { key: "title", label: "标题", kind: "text" },
      { key: "message", label: "提示文案", kind: "json" },
      { key: "danger", label: "危险操作", kind: "bool" },
      { key: "confirmText", label: "确认按钮", kind: "text" },
      { key: "cancelText", label: "取消按钮", kind: "text" },
      { key: "reasonRequired", label: "必填原因", kind: "bool" }
    ],
    create: () => step("confirm", { message: { $lit: "确认执行该操作？" }, danger: false })
  },  {
    type: "navigate",
    label: "页面跳转",
    group: UX_GROUP,
    icon: "→",
    color: "bg-amber-50 text-amber-600",
    description: "按 pageRef 跳转，或前进 / 后退",
    fields: [
      { key: "pageRef", label: "目标页面", kind: "ref", refKind: "page" },
      { key: "params", label: "路由参数", kind: "json" },
      { key: "query", label: "查询参数", kind: "json" },
      { key: "replace", label: "替换历史", kind: "bool" },
      { key: "target", label: "打开方式", kind: "select", options: ["self", "blank"] },
      { key: "back", label: "后退步数", kind: "number" },
      { key: "closeCurrent", label: "关闭当前页", kind: "bool" },
      { key: "confirmLeave", label: "离开确认条件", kind: "json" }
    ],
    create: () => step("navigate", { pageRef: { kind: "page", key: "", version: 1 }, params: {} })
  },
  {
    type: "upload",
    label: "文件上传",
    group: UX_GROUP,
    icon: "⇧",
    color: "bg-amber-50 text-amber-600",
    description: "OSS 直传后的登记步骤",
    fields: [
      { key: "provider", label: "存储", kind: "select", options: ["oss", "local"] },
      { key: "accept", label: "允许类型", kind: "json" },
      { key: "maxSize", label: "单文件上限", kind: "number" },
      { key: "maxCount", label: "数量上限", kind: "number" },
      { key: "multiple", label: "允许多选", kind: "bool" },
      { key: "pathTemplate", label: "对象路径模板", kind: "text" },
      { key: "assignTo", label: "结果写入", kind: "text" },
      { key: "autoUpload", label: "自动上传", kind: "bool" },
      { key: "registerEntity", label: "附件实体", kind: "ref", refKind: "entity" }
    ],
    create: () =>
      step("upload", {
        provider: "oss",
        accept: ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "xls", "xlsx"],
        maxSize: 52428800,
        maxCount: 9,
        multiple: true,
        autoUpload: false,
        assignTo: "vars.attachments"
      })
  },
  {
    type: "download",
    label: "文件下载",
    group: UX_GROUP,
    icon: "⇩",
    color: "bg-amber-50 text-amber-600",
    description: "按 URL 或资产引用触发下载",
    fields: [
      { key: "url", label: "下载地址", kind: "json" },
      { key: "fileName", label: "文件名", kind: "json" },
      { key: "assetRef", label: "资产", kind: "ref", refKind: "asset" }
    ],
    create: () => step("download", { url: { $ref: "$ctx.url" }, fileName: { $ref: "$ctx.fileName" } })
  },
  {
    type: "print",
    label: "打印 / 导出",
    group: UX_GROUP,
    icon: "⎙",
    color: "bg-amber-50 text-amber-600",
    description: "使用模板预览、打印或导出 PDF",
    fields: [
      { key: "templateRef", label: "模板资产", kind: "ref", refKind: "asset" },
      { key: "data", label: "模板数据", kind: "json" },
      { key: "mode", label: "模式", kind: "select", options: ["preview", "print", "exportPdf"] },
      { key: "assignTo", label: "结果写入", kind: "text" }
    ],
    create: () => step("print", { mode: "preview", data: { $ref: "$ctx.row" } })
  },
  {
    type: "startFlow",
    label: "发起流程",
    group: FLOW_GROUP,
    icon: "▷",
    color: "bg-rose-50 text-rose-600",
    description: "发起 Flowable 流程并绑定业务主键",
    fields: [
      { key: "flowRef", label: "流程定义", kind: "ref", refKind: "flow" },
      { key: "businessKey", label: "业务主键", kind: "json" },
      { key: "variables", label: "流程变量", kind: "json" },
      { key: "assignTo", label: "实例 ID 写入", kind: "text" },
      { key: "notify", label: "发起提示", kind: "text" },
      { key: "checkDuplicate", label: "防止重复发起", kind: "bool" }
    ],
    create: () =>
      step("startFlow", {
        flowRef: { kind: "flow", key: "", version: 1 },
        businessKey: { $ref: "$ctx.row.id" },
        variables: {},
        checkDuplicate: true
      })
  },  {
    type: "completeTask",
    label: "完成审批任务",
    group: FLOW_GROUP,
    icon: "✓",
    color: "bg-rose-50 text-rose-600",
    description: "提交审批结果：同意 / 驳回 / 退回 / 转办",
    fields: [
      { key: "taskId", label: "任务 ID", kind: "json" },
      { key: "outcome", label: "审批结果", kind: "select", options: ["approve", "reject", "return", "transfer", "addSign", "custom"] },
      { key: "outcomeKey", label: "自定义结果 key", kind: "text" },
      { key: "comment", label: "审批意见", kind: "json" },
      { key: "commentRequired", label: "意见必填", kind: "bool" },
      { key: "variables", label: "流程变量", kind: "json" },
      { key: "nextAssignee", label: "下一处理人", kind: "json" }
    ],
    create: () => step("completeTask", { outcome: "approve", commentRequired: false, variables: {} })
  },
  {
    type: "emit",
    label: "发送事件",
    group: FLOW_GROUP,
    icon: "↯",
    color: "bg-rose-50 text-rose-600",
    description: "发送 UI / 数据源事件，触发刷新或提示",
    fields: [
      { key: "event", label: "事件名", kind: "text", placeholder: "ui.toast" },
      { key: "payload", label: "事件载荷", kind: "json" },
      { key: "sync", label: "同步派发", kind: "bool" }
    ],
    create: () => step("emit", { event: "ui.toast", payload: {} })
  },
  {
    type: "log",
    label: "记录日志",
    group: FLOW_GROUP,
    icon: "▤",
    color: "bg-slate-100 text-slate-600",
    description: "写入运行日志，便于排查",
    fields: [
      { key: "level", label: "级别", kind: "select", options: ["debug", "info", "warn", "error"] },
      { key: "message", label: "日志内容", kind: "json" },
      { key: "data", label: "附加数据", kind: "json" }
    ],
    create: () => step("log", { level: "info", message: { $lit: "" } })
  },
  {
    type: "fail",
    label: "中断失败",
    group: ERROR_GROUP,
    icon: "!",
    color: "bg-rose-50 text-rose-600",
    description: "抛出业务错误并终止当前动作",
    fields: [
      { key: "message", label: "错误文案", kind: "json" },
      { key: "level", label: "级别", kind: "select", options: ["info", "warning", "error", "fatal"] },
      { key: "code", label: "错误码", kind: "text" },
      { key: "fields", label: "关联字段", kind: "json" },
      { key: "rollback", label: "回滚事务", kind: "bool" }
    ],
    create: () => step("fail", { message: { $lit: "操作失败" }, level: "error", rollback: true })
  },
  {
    type: "custom",
    label: "自定义 Handler",
    group: ERROR_GROUP,
    icon: "⚙",
    color: "bg-slate-100 text-slate-600",
    description: "调用注册的自定义处理器",
    fields: [
      { key: "handler", label: "Handler 标识", kind: "text" },
      { key: "params", label: "参数", kind: "json" },
      { key: "assignTo", label: "结果写入", kind: "text" }
    ],
    create: () => step("custom", { handler: "", params: {} })
  }
];

export const STEP_TYPE_MAP = new Map(STEP_TYPES.map((item) => [item.type, item]));

export const STEP_GROUPS = (() => {
  const order = [BRANCH_GROUP, DATA_GROUP, UX_GROUP, FLOW_GROUP, ERROR_GROUP];
  return order
    .map((label) => ({ label, items: STEP_TYPES.filter((item) => item.group === label) }))
    .filter((group) => group.items.length);
})();

export function stepDef(type: string): StepTypeDef | null {
  return STEP_TYPE_MAP.get(type as LogicStepType) ?? null;
}

export function newStep(type: LogicStepType): LogicStep {
  const def = STEP_TYPE_MAP.get(type);
  const base = def ? def.create() : step(type);
  return { ...base, id: ulid() };
}

export const TRIGGERS = [
  { value: "manual", label: "手动触发" },
  { value: "onLoad", label: "页面加载" },
  { value: "onSubmit", label: "表单提交" },
  { value: "onApprove", label: "审批同意" },
  { value: "onReject", label: "审批驳回" },
  { value: "onSchedule", label: "定时任务" },
  { value: "onWebhook", label: "Webhook" },
  { value: "onEntityChange", label: "实体变更" }
];

export function triggerLabel(value: string | undefined): string {
  return TRIGGERS.find((item) => item.value === value)?.label ?? value ?? "手动触发";
}

export const RULE_KINDS = [
  { value: "validation", label: "校验规则" },
  { value: "derivation", label: "派生规则" },
  { value: "guard", label: "守卫规则" },
  { value: "permission", label: "权限规则" },
  { value: "notification", label: "通知规则" }
];

export function ruleKindLabel(value: string | undefined): string {
  return RULE_KINDS.find((item) => item.value === value)?.label ?? value ?? "校验规则";
}
export function stepLabel(value: LogicStep): string {
  const def = stepDef(value.type);
  const label = typeof value.label === "string" ? value.label.trim() : "";
  return label || def?.label || value.type;
}

export function stepSummary(value: LogicStep): string {
  switch (value.type) {
    case "assign":
      return String(value.target ?? "未设置目标");
    case "validate":
      return `${value.scope ?? "form"} · ${Array.isArray(value.fields) ? value.fields.length : 0} 个字段`;
    case "apiCall":
      return String((value.apiRef as { key?: string } | undefined)?.key ?? "未选择 API");
    case "callAction":
      return String((value.actionRef as { key?: string } | undefined)?.key ?? "未选择动作");
    case "code":
      return `${value.lang ?? "ts"} · ${value.entry ?? "main"}`;
    case "branch":
      return `${Array.isArray(value.cases) ? value.cases.length : 0} 个分支`;
    case "loop":
      return `遍历 ${exprText(value.over)}`;
    case "parallel":
      return `${Array.isArray(value.branches) ? value.branches.length : 0} 个并行分支`;
    case "transaction":
      return `${Array.isArray(value.steps) ? value.steps.length : 0} 个子步骤`;
    case "confirm":
      return exprText(value.message);
    case "navigate": {
      const key = (value.pageRef as { key?: string } | undefined)?.key;
      return key ? `→ ${key}` : value.back ? `后退 ${value.back} 步` : "未设置目标";
    }
    case "openDialog":
      return String(value.dialogKey ?? "未设置弹窗");
    case "closeDialog":
      return String(value.dialogKey ?? "关闭当前弹窗");
    case "upload":
      return `${value.provider ?? "oss"} · 最多 ${value.maxCount ?? "—"} 个`;
    case "download":
      return exprText(value.fileName ?? value.url);
    case "startFlow":
      return String((value.flowRef as { key?: string } | undefined)?.key ?? "未选择流程");
    case "completeTask":
      return String(value.outcome ?? "approve");
    case "emit":
      return String(value.event ?? "未设置事件");
    case "log":
      return `${value.level ?? "info"} · ${exprText(value.message)}`;
    case "fail":
      return exprText(value.message);
    case "print":
      return String(value.mode ?? "preview");
    case "delay":
      return value.ms ? `${value.ms} ms` : exprText(value.until);
    case "custom":
      return String(value.handler ?? "未设置 Handler");
    default:
      return value.type;
  }
}

export interface NestedStepList {
  key: string;
  label: string;
  steps: LogicStep[];
}

export function nestedStepLists(value: LogicStep): NestedStepList[] {
  const lists: NestedStepList[] = [];
  if (Array.isArray(value.onError) && value.onError.length) {
    lists.push({ key: "onError", label: "异常处理", steps: value.onError });
  }
  if (value.type === "branch" && Array.isArray(value.cases)) {
    value.cases.forEach((item, index) => {
      const record = item as Record<string, unknown>;
      lists.push({
        key: `case-${index}`,
        label: String(record.name ?? `分支 ${index + 1}`),
        steps: Array.isArray(record.then) ? (record.then as LogicStep[]) : []
      });
    });
    if (Array.isArray(value.else)) lists.push({ key: "else", label: "否则", steps: value.else as LogicStep[] });
  }
  if ((value.type === "loop" || value.type === "transaction") && Array.isArray(value.steps)) {
    lists.push({ key: "steps", label: value.type === "loop" ? "循环体" : "事务步骤", steps: value.steps as LogicStep[] });
  }
  if (value.type === "parallel" && Array.isArray(value.branches)) {
    (value.branches as Array<Record<string, unknown>>).forEach((item, index) => {
      lists.push({
        key: `branch-${index}`,
        label: String(item.name ?? `分支 ${index + 1}`),
        steps: Array.isArray(item.steps) ? (item.steps as LogicStep[]) : []
      });
    });
  }
  if (value.type === "confirm") {
    if (Array.isArray(value.onConfirm)) lists.push({ key: "onConfirm", label: "确认后", steps: value.onConfirm as LogicStep[] });
    if (Array.isArray(value.onCancel)) lists.push({ key: "onCancel", label: "取消后", steps: value.onCancel as LogicStep[] });
  }
  return lists;
}

export function forEachStep(
  steps: LogicStep[] | undefined,
  base: string,
  visit: (value: LogicStep, path: string) => void
): void {
  if (!Array.isArray(steps)) return;
  steps.forEach((value, index) => {
    const path = `${base}[${index}]`;
    visit(value, path);
    forEachStep(value.onError, `${path}.onError`, visit);
    if (value.type === "branch" && Array.isArray(value.cases)) {
      value.cases.forEach((item, caseIndex) => {
        const record = item as Record<string, unknown>;
        forEachStep(record.then as LogicStep[] | undefined, `${path}.cases[${caseIndex}].then`, visit);
      });
      forEachStep(value.else as LogicStep[] | undefined, `${path}.else`, visit);
    }
    if (value.type === "loop" || value.type === "transaction") {
      forEachStep(value.steps as LogicStep[] | undefined, `${path}.steps`, visit);
    }
    if (value.type === "parallel" && Array.isArray(value.branches)) {
      (value.branches as Array<Record<string, unknown>>).forEach((item, branchIndex) => {
        forEachStep(item.steps as LogicStep[] | undefined, `${path}.branches[${branchIndex}].steps`, visit);
      });
    }
    if (value.type === "confirm") {
      forEachStep(value.onConfirm as LogicStep[] | undefined, `${path}.onConfirm`, visit);
      forEachStep(value.onCancel as LogicStep[] | undefined, `${path}.onCancel`, visit);
    }
  });
}

export function allStepsOfAction(action: LogicAction): LogicStep[] {
  const result: LogicStep[] = [];
  forEachStep(action.steps, "steps", (value) => result.push(value));
  return result;
}

export function allStepsOfLogic(logic: LogicSchema): LogicStep[] {
  const result: LogicStep[] = [];
  logic.actions.forEach((action) => forEachStep(action.steps, `action:${action.key}.steps`, (value) => result.push(value)));
  logic.apis.forEach((api) => {
    forEachStep(api.before, `api:${api.key}.before`, (value) => result.push(value));
    forEachStep(api.after, `api:${api.key}.after`, (value) => result.push(value));
  });
  logic.rules.forEach((rule) => forEachStep(rule.then, `rule:${rule.key}.then`, (value) => result.push(value)));
  return result;
}

export function findStepById(steps: LogicStep[], id: string | null): LogicStep | null {
  if (!id) return null;
  let found: LogicStep | null = null;
  forEachStep(steps, "steps", (value) => {
    if (!found && value.id === id) found = value;
  });
  return found;
}

export function regenerateStepIds(steps: LogicStep[]): void {
  steps.forEach((value) => {
    value.id = ulid();
    if (Array.isArray(value.onError)) regenerateStepIds(value.onError);
    if (value.type === "branch" && Array.isArray(value.cases)) {
      value.cases.forEach((item) => {
        const record = item as Record<string, unknown>;
        if (Array.isArray(record.then)) regenerateStepIds(record.then as LogicStep[]);
      });
      if (Array.isArray(value.else)) regenerateStepIds(value.else as LogicStep[]);
    }
    if ((value.type === "loop" || value.type === "transaction") && Array.isArray(value.steps)) {
      regenerateStepIds(value.steps as LogicStep[]);
    }
    if (value.type === "parallel" && Array.isArray(value.branches)) {
      (value.branches as Array<Record<string, unknown>>).forEach((item) => {
        if (Array.isArray(item.steps)) regenerateStepIds(item.steps as LogicStep[]);
      });
    }
    if (value.type === "confirm") {
      if (Array.isArray(value.onConfirm)) regenerateStepIds(value.onConfirm as LogicStep[]);
      if (Array.isArray(value.onCancel)) regenerateStepIds(value.onCancel as LogicStep[]);
    }
  });
}

export function createDefaultLogic(appKey: string): LogicSchema {
  return {
    id: ulid(),
    key: `${appKey || "app"}_logic`,
    name: "业务逻辑",
    scope: "app",
    version: 1,
    description: "",
    actions: [],
    apis: [],
    flows: [],
    rules: []
  };
}
export function normalizeLogicSchema(logic: LogicSchema): LogicSchema {
  if (!Array.isArray(logic.actions)) logic.actions = [];
  if (!Array.isArray(logic.apis)) logic.apis = [];
  if (!Array.isArray(logic.flows)) logic.flows = [];
  if (!Array.isArray(logic.rules)) logic.rules = [];
  for (const flow of logic.flows) {
    const record = flow as Record<string, unknown>;
    if (!Array.isArray(flow.variables) && Array.isArray(record.variableMappings)) {
      flow.variables = record.variableMappings as LogicFlow["variables"];
    }
    delete record.variableMappings;
  }
  return logic;
}
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{1,63}$/;

function refKey(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" ? record.key : typeof record.assetId === "string" ? record.assetId : "";
}

function checkRef(
  issues: LogicIssue[],
  value: unknown,
  keys: Set<string>,
  where: string,
  label: string
): void {
  if (!value) return;
  const key = refKey(value);
  if (!key) {
    issues.push({ level: "error", where, message: `${label}未选择` });
    return;
  }
  if (keys.size && !keys.has(key)) {
    issues.push({ level: "error", where, message: `${label} ${key} 不存在` });
  }
}

export function validateLogic(
  logic: LogicSchema,
  pageKeys: string[],
  assetKeys: string[],
  entityKeys: string[]
): LogicIssue[] {
  const issues: LogicIssue[] = [];
  if (!logic.id) issues.push({ level: "error", where: "logic.id", message: "逻辑 Schema 缺少 id" });
  if (!logic.key.trim()) issues.push({ level: "error", where: "logic.key", message: "逻辑 Schema 缺少 key" });
  if (!logic.name.trim()) issues.push({ level: "error", where: "logic.name", message: "逻辑 Schema 缺少名称" });

  const actionKeys = new Set(logic.actions.map((item) => item.key));
  const apiKeys = new Set(logic.apis.map((item) => item.key));
  const flowKeys = new Set(logic.flows.map((item) => item.key));
  const pageSet = new Set(pageKeys);
  const assetSet = new Set(assetKeys);
  const entitySet = new Set(entityKeys);

  const collections: Array<{ label: string; items: Array<{ key: string; id: string }> }> = [
    { label: "动作", items: logic.actions },
    { label: "API", items: logic.apis },
    { label: "流程", items: logic.flows },
    { label: "规则", items: logic.rules }
  ];
  for (const collection of collections) {
    const seen = new Map<string, string>();
    for (const item of collection.items) {
      if (!item.id) issues.push({ level: "error", where: `${collection.label} ${item.key || "(未命名)"}`, message: "缺少 id" });
      if (!item.key.trim()) {
        issues.push({ level: "error", where: `${collection.label} (${item.id})`, message: "key 不能为空" });
      } else if (!KEY_PATTERN.test(item.key)) {
        issues.push({ level: "warning", where: `${collection.label} ${item.key}`, message: "key 建议使用 2-64 位字母开头的 snake_case" });
      }
      if (item.key && seen.has(item.key)) {
        issues.push({ level: "error", where: `${collection.label} ${item.key}`, message: `key 重复：${seen.get(item.key)}` });
      }
      if (item.key) seen.set(item.key, collection.label);
    }
  }

  const stepIds = new Map<string, string>();
  const inspectStep = (value: LogicStep, path: string) => {
    const def = stepDef(value.type);
    if (!def) {
      issues.push({ level: "error", where: path, message: `未知步骤类型 ${value.type}` });
      return;
    }
    if (!value.id) issues.push({ level: "error", where: path, message: `${def.label} 缺少 id` });
    else if (stepIds.has(value.id)) issues.push({ level: "error", where: path, message: `步骤 id 重复（另见 ${stepIds.get(value.id)}）` });
    else stepIds.set(value.id, path);

    const need = (condition: boolean, message: string, level: "error" | "warning" = "error") => {
      if (!condition) issues.push({ level, where: path, message });
    };
    switch (value.type) {
      case "assign":
        need(hasValue(value.target), "赋值目标为空");
        need(value.value !== undefined, "缺少赋值表达式");
        break;
      case "validate":
        need(Array.isArray(value.fields) && value.fields.length > 0, "未选择校验字段", "warning");
        break;
      case "apiCall":
        checkRef(issues, value.apiRef, apiKeys, path, "API");
        break;
      case "callAction":
        checkRef(issues, value.actionRef, actionKeys, path, "动作");
        break;
      case "code":
        need(hasValue(value.source), "代码内容为空");
        need(hasValue(value.entry), "缺少入口函数");
        break;
      case "branch":
        need(Array.isArray(value.cases) && value.cases.length > 0, "至少需要一个分支");
        if (Array.isArray(value.cases)) {
          value.cases.forEach((item, index) => {
            const record = item as Record<string, unknown>;
            need(record.when !== undefined, `分支 ${index + 1} 缺少条件`);
            need(Array.isArray(record.then) && (record.then as unknown[]).length > 0, `分支 ${index + 1} 没有步骤`);
          });
        }
        break;
      case "loop":
        need(value.over !== undefined, "缺少遍历集合");
        need(Array.isArray(value.steps) && value.steps.length > 0, "循环体为空", "warning");
        break;
      case "parallel":
        need(Array.isArray(value.branches) && value.branches.length >= 2, "并行至少需要两个分支");
        break;
      case "transaction":
        need(Array.isArray(value.steps) && value.steps.length > 0, "事务步骤为空");
        break;
      case "confirm":
        need(value.message !== undefined, "缺少确认文案");
        break;
      case "openDialog":
        need(hasValue(value.dialogKey), "缺少弹窗 key");
        break;
      case "closeDialog":
        need(hasValue(value.dialogKey), "缺少弹窗 key", "warning");
        break;
      case "navigate":
        need(!!value.pageRef || hasValue(value.back) || hasValue(value.to), "未设置跳转目标");
        checkRef(issues, value.pageRef, pageSet, path, "页面");
        break;
      case "upload":
        checkRef(issues, value.registerEntity, entitySet, path, "附件实体");
        break;
      case "download":
        need(value.url !== undefined || value.assetRef !== undefined, "缺少下载地址或资产");
        checkRef(issues, value.assetRef, assetSet, path, "资产");
        break;
      case "startFlow":
        checkRef(issues, value.flowRef, flowKeys, path, "流程");
        need(value.businessKey !== undefined, "缺少业务主键");
        break;
      case "completeTask":
        need(hasValue(value.outcome) || hasValue(value.outcomeKey), "缺少审批结果");
        break;
      case "emit":
        need(hasValue(value.event), "缺少事件名");
        break;
      case "fail":
        need(value.message !== undefined, "缺少错误文案");
        break;
      case "print":
        checkRef(issues, value.templateRef, assetSet, path, "模板资产");
        break;
      case "custom":
        need(hasValue(value.handler), "缺少 Handler 标识");
        break;
      default:
        break;
    }
  };

  for (const action of logic.actions) {
    if (!Array.isArray(action.steps) || action.steps.length === 0) {
      issues.push({ level: "warning", where: `动作 ${action.key}`, message: "动作没有步骤" });
    }
    forEachStep(action.steps, `动作 ${action.key}`, inspectStep);
    const paramKeys = new Set<string>();
    for (const param of action.params ?? []) {
      if (!param.key) issues.push({ level: "error", where: `动作 ${action.key}`, message: "参数 key 不能为空" });
      else if (paramKeys.has(param.key)) issues.push({ level: "error", where: `动作 ${action.key}`, message: `参数 key 重复：${param.key}` });
      else paramKeys.add(param.key);
    }
  }
  for (const api of logic.apis) {
    if (!hasValue(api.path)) issues.push({ level: "error", where: `API ${api.key}`, message: "path 不能为空" });
    forEachStep(api.before, `API ${api.key} 请求前`, inspectStep);
    forEachStep(api.after, `API ${api.key} 响应后`, inspectStep);
  }
  for (const flow of logic.flows) {
    if (!KEY_PATTERN.test(flow.processKey)) {
      issues.push({ level: "warning", where: `流程 ${flow.key}`, message: "processKey 建议使用字母开头的标识" });
    }
    const assetKey = refKey(flow.bpmnRef);
    if (!assetKey) issues.push({ level: "error", where: `流程 ${flow.key}`, message: "缺少 BPMN 资产引用" });
    else if (assetSet.size && !assetSet.has(assetKey)) {
      issues.push({ level: "error", where: `流程 ${flow.key}`, message: `BPMN 资产 ${assetKey} 不存在` });
    }
    for (const listener of flow.listeners ?? []) {
      const record = listener as Record<string, unknown>;
      checkRef(issues, record.actionRef, actionKeys, `流程 ${flow.key} 监听器`, "监听动作");
    }
  }
  for (const rule of logic.rules) {
    if (!Array.isArray(rule.then) || rule.then.length === 0) {
      issues.push({ level: "warning", where: `规则 ${rule.key}`, message: "规则没有执行步骤" });
    }
    checkRef(issues, rule.entityRef, entitySet, `规则 ${rule.key}`, "实体");
    forEachStep(rule.then, `规则 ${rule.key}`, inspectStep);
  }

  return issues;
}

export function logicStats(logic: LogicSchema): {
  actions: number;
  steps: number;
  apis: number;
  flows: number;
  rules: number;
} {
  return {
    actions: logic.actions.length,
    steps: allStepsOfLogic(logic).length,
    apis: logic.apis.length,
    flows: logic.flows.length,
    rules: logic.rules.length
  };
}
export function uniqueKey(existing: string[], base: string): string {
  const normalized = base
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const seed = normalized || "item";
  if (!existing.includes(seed)) return seed;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${seed}_${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${seed}_${Date.now()}`;
}

export function createAction(keys: string[]): LogicAction {
  return {
    id: ulid(),
    key: uniqueKey(keys, "new_action"),
    name: "新动作",
    trigger: "manual",
    description: "",
    params: [],
    steps: []
  };
}

export function createApi(keys: string[]): LogicApi {
  return {
    id: ulid(),
    key: uniqueKey(keys, "new_api"),
    name: "新接口",
    kind: "rest",
    method: "GET",
    path: "/",
    timeoutMs: 10000,
    description: ""
  };
}

export function createFlow(keys: string[]): LogicFlow {
  const key = uniqueKey(keys, "new_flow");
  return {
    id: ulid(),
    key,
    name: "新流程",
    engine: "flowable",
    processKey: key,
    description: "",
    bpmnRef: { kind: "bpmn", key: "", version: 1 },
    variables: [],
    taskForms: [],
    listeners: [],
    allowRecall: true,
    allowReturn: true,
    allowTransfer: true,
    allowAddSign: false
  };
}

export function createRule(keys: string[]): LogicRule {
  return {
    id: ulid(),
    key: uniqueKey(keys, "new_rule"),
    name: "新规则",
    kind: "validation",
    on: "any",
    description: "",
    then: [],
    priority: 100,
    enabled: true,
    stopOnFail: true
  };
}
