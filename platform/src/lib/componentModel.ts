import type {
  ComponentCapabilities,
  ComponentDef,
  ComponentIssue,
  ComponentPropDef,
  SandboxPolicy
} from "@/types/uiModel";
import { textOf } from "./uiModel";
import { ulid } from "./ulid";

export const COMPONENT_KINDS: Array<{ value: ComponentDef["kind"]; label: string; hint: string }> = [
  { value: "layout", label: "布局", hint: "页面骨架与栅格" },
  { value: "container", label: "容器", hint: "承载子节点" },
  { value: "field", label: "表单字段", hint: "参与表单模型与校验" },
  { value: "display", label: "展示", hint: "只读信息呈现" },
  { value: "action", label: "操作", hint: "按钮与交互入口" },
  { value: "data", label: "数据", hint: "消费数据源" },
  { value: "chart", label: "图表", hint: "指标与可视化" },
  { value: "advanced", label: "高级", hint: "业务组件与特殊能力" }
];

export const COMPONENT_RUNTIMES: Array<{ value: NonNullable<ComponentDef["runtime"]>; label: string; hint: string }> = [
  { value: "sandbox", label: "iframe 沙箱", hint: "默认全拒，隔离执行" },
  { value: "remote", label: "远程模块", hint: "动态加载，必须校验 integrity" },
  { value: "builtin", label: "平台内建", hint: "仅供平台组件使用" }
];

export const PROP_TYPES = [
  "text",
  "string",
  "boolean",
  "integer",
  "number",
  "enum",
  "color",
  "icon",
  "cssLength",
  "expr",
  "json",
  "entityRef",
  "dataSourceRef",
  "fieldList",
  "columnList",
  "searchFieldList",
  "buttonList",
  "optionList"
];

export const DEFAULT_PROP_TYPES = ["text", "string", "boolean", "integer", "number", "enum", "json"];

export function defaultCapabilities(patch: ComponentCapabilities = {}): ComponentCapabilities {
  return {
    formField: false,
    listColumn: false,
    supportsBinding: true,
    supportsDataSource: false,
    supportsLoop: false,
    supportsVisibility: true,
    supportsResponsive: true,
    supportsStyle: true,
    movable: true,
    resizable: true,
    copyable: true,
    deletable: true,
    virtualScroll: false,
    ...patch
  };
}

export function defaultSandbox(patch: SandboxPolicy = {}): SandboxPolicy {
  return {
    network: false,
    allowedHosts: [],
    storage: false,
    dom: false,
    cookies: false,
    clipboard: false,
    navigation: false,
    allowedModules: [],
    allowEval: false,
    memoryLimitMb: 64,
    ...patch
  };
}

export function normalizeComponent(component: ComponentDef): ComponentDef {
  return {
    ...component,
    runtime: component.runtime ?? "sandbox",
    container:
      component.container ??
      (component.kind === "container" || component.kind === "layout"),
    acceptChildren: component.acceptChildren ?? [],
    canBeChildOf: component.canBeChildOf ?? [],
    props: component.props ?? [],
    slots: component.slots ?? [],
    events: component.events ?? [],
    actions: component.actions ?? [],
    capabilities: defaultCapabilities(component.capabilities),
    defaultProps: component.defaultProps ?? {},
    defaultStyle: component.defaultStyle ?? {},
    sandbox: defaultSandbox(component.sandbox),
    semantic: component.semantic ?? { intent: "" }
  };
}

export function componentKindLabel(kind: string): string {
  return COMPONENT_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export function componentRuntimeLabel(runtime?: string): string {
  return COMPONENT_RUNTIMES.find((item) => item.value === runtime)?.label ?? runtime ?? "内建";
}

export function sanitizeComponentName(value: string): string {
  let slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!/^[a-z]/.test(slug)) slug = `x-${slug}`;
  if (slug.length < 2) slug = "x-component";
  return slug;
}

export function uniqueComponentName(existing: string[], base: string): string {
  const seed = sanitizeComponentName(base);
  if (!existing.includes(seed)) return seed;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${seed}-${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${seed}-${Date.now()}`;
}

export function createComponent(name: string, patch: Partial<ComponentDef> = {}): ComponentDef {
  const normalized = sanitizeComponentName(name);
  return {
    id: ulid(),
    name: normalized,
    version: 1,
    title: normalized,
    description: "",
    group: "业务组件",
    kind: "advanced",
    runtime: "sandbox",
    container: false,
    acceptChildren: [],
    canBeChildOf: [],
    props: [],
    slots: [],
    events: [],
    actions: [],
    capabilities: defaultCapabilities(),
    defaultProps: {},
    responsive: true,
    source: `inline://${normalized}`,
    integrity: "",
    sandbox: defaultSandbox(),
    semantic: { intent: "" },
    ...patch
  };
}

export type ComponentPresetKey = "biz-card" | "metric-stat" | "field-upload" | "data-table";

export const COMPONENT_PRESETS: Array<{ key: ComponentPresetKey; label: string; hint: string; icon: string }> = [
  { key: "biz-card", label: "业务卡片", hint: "容器 + 标题 + 状态徽标，适合业务概览", icon: "▤" },
  { key: "metric-stat", label: "指标卡", hint: "数值 + 趋势 + 点击事件，适合看板", icon: "↗" },
  { key: "field-upload", label: "上传字段", hint: "参与表单模型的字段组件", icon: "⇧" },
  { key: "data-table", label: "数据列表", hint: "消费实体数据源的自定义列表", icon: "▦" }
];

function prop(
  key: string,
  label: string,
  type: string,
  patch: Partial<ComponentPropDef> = {}
): ComponentPropDef {
  return { key, label, type, bindable: true, ...patch };
}

export function createPresetComponent(key: ComponentPresetKey, existing: string[]): ComponentDef {
  if (key === "biz-card") {
    const name = uniqueComponentName(existing, "biz-card");
    return createComponent(name, {
      title: "业务卡片",
      group: "业务组件",
      kind: "container",
      description: "带标题、状态徽标与操作区的业务卡片，可在沙箱内组合子组件。",
      container: true,
      acceptChildren: ["field", "display", "action", "chart", "advanced"],
      props: [
        prop("title", "标题", "text", { required: true }),
        prop("subtitle", "副标题", "text"),
        prop("badge", "状态徽标", "text"),
        prop("tone", "色调", "enum", { enum: ["indigo", "emerald", "amber", "rose", "slate"] }),
        prop("clickable", "可点击", "boolean")
      ],
      defaultProps: { title: "业务卡片", subtitle: "在组件库中继续配置", badge: "草稿", tone: "indigo", clickable: true },
      events: [
        { name: "cardClick", label: "卡片点击", params: [{ key: "title", type: "string" }] },
        { name: "actionClick", label: "操作点击" }
      ],
      actions: [{ name: "refresh", label: "刷新卡片", kind: "ui" }],
      slots: [
        { name: "header", label: "自定义页头", multiple: false },
        { name: "default", label: "卡片内容" },
        { name: "footer", label: "卡片底部", multiple: false }
      ],
      capabilities: defaultCapabilities({ supportsDataSource: true }),
      "x-previewHtml": `<div class="card tone-indigo">
  <div class="head">
    <div>
      <span class="badge" id="badge">草稿</span>
      <h3 id="title">业务卡片</h3>
      <p id="subtitle">在组件库中继续配置</p>
    </div>
    <button class="action" data-mf-event="actionClick">操作</button>
  </div>
  <div class="body"><slot>子组件会渲染在这里</slot></div>
</div>`,
      "x-previewScript": `document.getElementById('title').textContent = props.title || '业务卡片';
document.getElementById('subtitle').textContent = props.subtitle || '在组件库中继续配置';
document.getElementById('badge').textContent = props.badge || '草稿';
root.className = 'tone-' + (props.tone || 'indigo');
root.addEventListener('click', () => emit('cardClick', { title: props.title || '' }));`
    });
  }

  if (key === "metric-stat") {
    const name = uniqueComponentName(existing, "metric-stat");
    return createComponent(name, {
      title: "指标卡",
      group: "图表",
      kind: "display",
      description: "展示单个指标的数值、变化趋势与口径说明。",
      props: [
        prop("label", "指标名称", "text", { required: true }),
        prop("value", "指标值", "text", { required: true }),
        prop("unit", "单位", "text"),
        prop("trend", "趋势", "enum", { enum: ["up", "down", "flat"] }),
        prop("trendText", "趋势说明", "text"),
        prop("tone", "色调", "enum", { enum: ["indigo", "emerald", "amber", "rose"] })
      ],
      defaultProps: { label: "本月请假人数", value: "42", unit: "人", trend: "up", trendText: "较上月 +8%", tone: "indigo" },
      events: [{ name: "metricClick", label: "点击指标", params: [{ key: "label", type: "string" }] }],
      capabilities: defaultCapabilities({ supportsDataSource: true, supportsLoop: true }),
      "x-previewHtml": `<div class="stat tone-indigo">
  <p class="eyebrow" id="label">本月请假人数</p>
  <div class="value"><span id="value">42</span><small id="unit">人</small></div>
  <p class="trend" id="trend">较上月 +8%</p>
</div>`,
      "x-previewScript": `document.getElementById('label').textContent = props.label || '指标名称';
document.getElementById('value').textContent = props.value ?? '0';
document.getElementById('unit').textContent = props.unit || '';
document.getElementById('trend').textContent = props.trendText || '';
root.className = 'stat tone-' + (props.tone || 'indigo') + ' trend-' + (props.trend || 'flat');
root.addEventListener('click', () => emit('metricClick', { label: props.label || '' }));`
    });
  }

  if (key === "field-upload") {
    const name = uniqueComponentName(existing, "field-upload");
    return createComponent(name, {
      title: "上传字段",
      group: "表单",
      kind: "field",
      description: "参与表单模型与必填校验的自定义上传字段，运行时由 OSS STS 直传接管。",
      props: [
        prop("label", "字段标签", "text", { required: true }),
        prop("required", "必填", "boolean"),
        prop("accept", "接受类型", "text"),
        prop("maxCount", "最大数量", "integer", { min: 1, max: 20 }),
        prop("hint", "提示文案", "text")
      ],
      defaultProps: { label: "佐证材料", required: true, accept: "image/*,.pdf", maxCount: 5, hint: "支持图片与 PDF" },
      events: [
        { name: "change", label: "文件变化", params: [{ key: "files", type: "array" }] },
        { name: "remove", label: "移除文件", params: [{ key: "name", type: "string" }] }
      ],
      actions: [{ name: "openPicker", label: "打开选择器", kind: "upload" }],
      capabilities: defaultCapabilities({ formField: true, listColumn: false }),
      fieldBindings: { forFieldTypes: ["file", "image"], forPageKinds: ["form", "approval"], priority: 40 },
      "x-previewHtml": `<div class="field">
  <label><span id="label">佐证材料</span><b id="required">*</b></label>
  <div class="drop">
    <strong>点击上传</strong>
    <span id="hint">支持图片与 PDF</span>
  </div>
</div>`,
      "x-previewScript": `document.getElementById('label').textContent = props.label || '上传字段';
document.getElementById('required').style.display = props.required ? 'inline' : 'none';
document.getElementById('hint').textContent = props.hint || '';
root.addEventListener('click', () => emit('change', { files: [] }));`
    });
  }

  const name = uniqueComponentName(existing, "data-table");
  return createComponent(name, {
    title: "数据列表",
    group: "数据",
    kind: "data",
    description: "消费实体数据源的自定义列表，支持分页、空态与行操作。",
    props: [
      prop("dataSourceId", "数据源", "dataSourceRef", { required: true }),
      prop("pageSize", "每页条数", "integer", { min: 5, max: 100 }),
      prop("emptyText", "空态文案", "text"),
      prop("showPagination", "显示分页", "boolean")
    ],
    defaultProps: { dataSourceId: "", pageSize: 20, emptyText: "暂无数据", showPagination: true },
    events: [{ name: "rowClick", label: "行点击", params: [{ key: "row", type: "object" }] }],
    actions: [{ name: "refresh", label: "刷新", kind: "data" }],
    slots: [{ name: "empty", label: "空态插槽", multiple: false }],
    capabilities: defaultCapabilities({ supportsDataSource: true, supportsLoop: false }),
    data: { role: "table", modelShape: "array", accepts: ["entity", "api"], refreshable: true, pagination: true },
    "x-previewHtml": `<div class="table">
  <div class="table-head"><span>数据列表</span><b id="size">20 条/页</b></div>
  <div class="row"><span>张老师</span><span>教务处</span><i>待审批</i></div>
  <div class="row"><span>李同学</span><span>计算机学院</span><i>已通过</i></div>
  <div class="row"><span>王主任</span><span>人事处</span><i>已驳回</i></div>
</div>`,
    "x-previewScript": `document.getElementById('size').textContent = (props.pageSize || 20) + ' 条/页';
root.addEventListener('click', () => emit('rowClick', { row: { name: '张老师' } }));`
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

export function componentPreviewHtml(component: ComponentDef, overrideProps: Record<string, unknown> = {}): string {
  const policy = defaultSandbox(component.sandbox);
  const props = { ...(component.defaultProps ?? {}), ...overrideProps };
  const network = Boolean(policy.network);
  const hosts = (policy.allowedHosts ?? []).filter(Boolean).join(" ");
  const connectSrc = network ? (hosts || "https:") : "'none'";
  const imgSrc = network ? "data: blob: https:" : "data: blob:";
  const title = textOf(component.title) || component.name;
  const preview = component["x-previewHtml"] || `
    <div class="generic">
      <div class="generic-top"><span>${escapeHtml(component.kind)}</span><b>${escapeHtml(component.name)}</b></div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(component.description || "该组件尚未提供内联预览，运行时按契约加载。")}</p>
      <pre>${escapeHtml(safeJson(props))}</pre>
    </div>`;
  const customScript = component["x-previewScript"] || "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${connectSrc}; font-src data:; form-action 'none'; base-uri 'none'">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 10px; background: #f8fafc; color: #334155; font: 13px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  #root { min-height: 32px; }
  .card, .stat, .field, .table, .generic { border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; padding: 14px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .badge { display: inline-block; border-radius: 999px; background: #eef2ff; color: #4f46e5; padding: 2px 8px; font-size: 10px; font-weight: 600; }
  h3 { margin: 6px 0 2px; font-size: 16px; color: #0f172a; }
  p { margin: 0; color: #64748b; font-size: 12px; }
  .action { border: 0; border-radius: 8px; background: #4f46e5; color: #fff; padding: 6px 10px; font-size: 11px; cursor: pointer; }
  .body { margin-top: 12px; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 16px; color: #94a3b8; text-align: center; font-size: 11px; }
  .eyebrow { font-size: 11px; color: #64748b; }
  .value { margin-top: 4px; font-size: 30px; font-weight: 700; color: #0f172a; letter-spacing: -.02em; }
  .value small { margin-left: 4px; font-size: 12px; font-weight: 500; color: #64748b; }
  .trend { margin-top: 4px; font-size: 11px; color: #059669; }
  .trend-down .trend { color: #e11d48; }
  .tone-emerald .badge { background: #ecfdf5; color: #047857; }
  .tone-amber .badge { background: #fffbeb; color: #b45309; }
  .tone-rose .badge { background: #fff1f2; color: #be123c; }
  .tone-slate .badge { background: #f1f5f9; color: #475569; }
  .field label { display: flex; align-items: center; gap: 3px; margin-bottom: 6px; font-size: 12px; color: #334155; font-weight: 500; }
  .field b { color: #e11d48; }
  .drop { border: 1px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 18px; text-align: center; cursor: pointer; }
  .drop strong { display: block; font-size: 12px; color: #4f46e5; }
  .drop span { display: block; margin-top: 3px; font-size: 10.5px; color: #94a3b8; }
  .table { padding: 0; overflow: hidden; }
  .table-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-size: 12px; font-weight: 600; color: #334155; }
  .table-head b { font-size: 10px; font-weight: 500; color: #94a3b8; }
  .row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; border-bottom: 1px solid #f1f5f9; padding: 9px 12px; font-size: 11.5px; cursor: pointer; }
  .row:last-child { border-bottom: 0; }
  .row i { font-style: normal; color: #4f46e5; }
  .generic-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .generic-top span { border-radius: 999px; background: #f1f5f9; padding: 2px 7px; font-size: 9.5px; color: #64748b; }
  .generic-top b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; color: #94a3b8; }
  pre { max-height: 180px; overflow: auto; border-radius: 8px; background: #0f172a; padding: 10px; color: #e2e8f0; font-size: 10px; line-height: 1.5; }
</style>
</head>
<body>
<div id="root">${preview}</div>
<script>
(() => {
  const root = document.getElementById('root');
  const props = ${safeJson(props)};
  const emit = (name, payload) => parent.postMessage({ source: 'metaforge-sandbox', type: 'event', name, payload }, '*');
  const reportHeight = () => parent.postMessage({ source: 'metaforge-sandbox', type: 'resize', height: document.documentElement.scrollHeight }, '*');
  window.addEventListener('error', (event) => parent.postMessage({ source: 'metaforge-sandbox', type: 'error', message: String(event.message || '运行错误') }, '*'));
  root.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-mf-event]') : null;
    if (target) emit(target.getAttribute('data-mf-event'), {});
  });
  ${customScript}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reportHeight);
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.documentElement);
  setTimeout(reportHeight, 30);
  setTimeout(reportHeight, 240);
})();
</script>
</body>
</html>`;
}

export async function integrityOfBytes(bytes: BufferSource, algorithm: "SHA-256" | "SHA-384" | "SHA-512" = "SHA-384"): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, bytes);
  const binary = Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join("");
  const prefix = algorithm.toLowerCase().replace("sha-", "sha");
  return `${prefix}-${btoa(binary)}`;
}

export async function sha384Integrity(text: string): Promise<string> {
  return integrityOfBytes(new TextEncoder().encode(text));
}

export function componentGroupsOf(components: ComponentDef[]): Array<{ label: string; items: ComponentDef[] }> {
  const groups = new Map<string, ComponentDef[]>();
  for (const component of components) {
    const group = component.group || "业务组件";
    const items = groups.get(group) ?? [];
    items.push(component);
    groups.set(group, items);
  }
  const order = ["布局", "容器", "数据", "表单", "展示", "操作", "业务组件", "图表", "其他"];
  return Array.from(groups, ([label, items]) => ({ label, items })).sort((left, right) => {
    const leftIndex = order.indexOf(left.label);
    const rightIndex = order.indexOf(right.label);
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  });
}

export function mergeComponents(builtin: ComponentDef[], custom: ComponentDef[]): ComponentDef[] {
  const map = new Map<string, ComponentDef>();
  for (const item of builtin) map.set(item.name, item);
  for (const item of custom) {
    if (!item?.name) continue;
    if (!map.has(item.name)) map.set(item.name, item);
  }
  return Array.from(map.values());
}

export function componentStats(components: ComponentDef[]) {
  const kinds = new Set<string>();
  let sandboxed = 0;
  let remote = 0;
  let props = 0;
  for (const component of components) {
    kinds.add(component.kind);
    if ((component.runtime ?? "builtin") === "sandbox") sandboxed += 1;
    if (component.runtime === "remote") remote += 1;
    props += component.props?.length ?? 0;
  }
  return { total: components.length, kinds: kinds.size, sandboxed, remote, props };
}

export function validateComponents(components: ComponentDef[], builtinNames: string[] = []): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const names = new Map<string, string>();
  const ids = new Map<string, string>();
  const builtin = new Set(builtinNames);

  const push = (level: ComponentIssue["level"], where: string, message: string) => {
    issues.push({ level, where, message });
  };

  components.forEach((component, index) => {
    const where = component.name || `components[${index}]`;
    if (!component.id || component.id.length !== 26) push("error", where, "组件 id 必须是 26 位 ULID");
    if (component.id && ids.has(component.id)) push("error", where, `组件 id 与 ${ids.get(component.id)} 重复`);
    if (component.id) ids.set(component.id, where);

    if (!/^[a-z][a-z0-9-]{1,47}$/.test(component.name || "")) {
      push("error", where, "组件名必须是小写 kebab-case（2-48 位）");
    }
    if (builtin.has(component.name)) push("error", where, `组件名 ${component.name} 与平台内建组件冲突`);
    const owner = names.get(component.name);
    if (owner) push("error", where, `组件名与 ${owner} 重复`);
    else names.set(component.name, where);

    if (!Number.isInteger(component.version) || component.version < 1) push("error", where, "version 必须是正整数");
    if (!textOf(component.title).trim()) push("error", where, "组件标题不能为空");
    if (!COMPONENT_KINDS.some((item) => item.value === component.kind)) {
      push("error", where, `未知组件类型 ${component.kind}`);
    }
    const runtime = component.runtime ?? "builtin";
    if (runtime === "builtin") push("warning", where, "租户自定义组件不建议使用 builtin 运行时");
    if ((runtime === "remote" || runtime === "sandbox") && !component.source?.trim()) {
      push("error", where, `${runtime} 运行时必须提供 source`);
    }
    if (runtime === "remote") {
      if (!component.integrity?.trim()) push("error", where, "远程组件必须提供 integrity（SRI）");
      if (component.source && !/^https:\/\//.test(component.source)) {
        push("error", where, "远程组件 source 必须是 https:// 地址");
      }
      if (component.source && !component.source.includes("{version}")) {
        push("error", where, "远程组件 source 必须包含 {version} 占位，用于锁定模块版本");
      }
    }
    if (component.integrity && !/^(sha256|sha384|sha512)-[A-Za-z0-9+/=]+$/.test(component.integrity)) {
      push("error", where, "integrity 必须是 sha256/sha384/sha512 的 SRI 格式");
    }
    if (component.container && component.kind !== "container" && component.kind !== "layout") {
      push("warning", where, "container=true 建议使用 container/layout 类型");
    }
    if (!component.container && ((component.minChildren ?? 0) > 0 || component.maxChildren !== undefined)) {
      push("warning", where, "非容器组件不应声明子节点数量约束");
    }
    if (component.minChildren !== undefined && component.maxChildren !== undefined && component.minChildren > component.maxChildren) {
      push("error", where, "minChildren 不能大于 maxChildren");
    }

    const propKeys = new Set<string>();
    (component.props ?? []).forEach((prop, propIndex) => {
      const propWhere = `${where}.props[${propIndex}]`;
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(prop.key || "")) {
        push("error", propWhere, "属性 key 必须是 camelCase");
      }
      if (propKeys.has(prop.key)) push("error", propWhere, `属性 key ${prop.key} 重复`);
      propKeys.add(prop.key);
      if (!textOf(prop.label).trim()) push("error", propWhere, "属性 label 不能为空");
      if (!prop.type) push("error", propWhere, "属性 type 不能为空");
      else if (!PROP_TYPES.includes(prop.type)) push("warning", propWhere, `属性类型 ${prop.type} 不在内置类型清单中`);
    });

    for (const key of Object.keys(component.defaultProps ?? {})) {
      if (!propKeys.has(key)) push("warning", where, `defaultProps.${key} 未在 props 中声明`);
    }

    if (component.kind === "field" && !component.capabilities?.formField) {
      push("warning", where, "field 类型组件建议开启 formField 能力");
    }
    if (component.kind === "data" && !component.capabilities?.supportsDataSource) {
      push("warning", where, "data 类型组件建议开启 supportsDataSource 能力");
    }

    const slotNames = new Set<string>();
    (component.slots ?? []).forEach((slot, slotIndex) => {
      const slotWhere = `${where}.slots[${slotIndex}]`;
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(slot.name || "")) push("error", slotWhere, "插槽名必须是 camelCase 或 default");
      if (slotNames.has(slot.name)) push("error", slotWhere, `插槽 ${slot.name} 重复`);
      slotNames.add(slot.name);
    });

    const eventNames = new Set<string>();
    (component.events ?? []).forEach((event, eventIndex) => {
      const eventWhere = `${where}.events[${eventIndex}]`;
      if (!/^[a-z][a-zA-Z0-9]{0,47}$/.test(event.name || "")) push("error", eventWhere, "事件名必须是 camelCase");
      if (eventNames.has(event.name)) push("error", eventWhere, `事件 ${event.name} 重复`);
      eventNames.add(event.name);
    });

    const sandbox = defaultSandbox(component.sandbox);
    if (sandbox.network && !(sandbox.allowedHosts ?? []).length) {
      push("error", where, "sandbox.network=true 时必须声明 allowedHosts");
    }
    if (sandbox.allowEval) push("warning", where, "allowEval 会显著扩大攻击面，不建议开启");
    if (sandbox.dom) push("warning", where, "dom=true 允许访问外部 DOM，沙箱隔离性下降");
    if (sandbox.storage) push("warning", where, "严格 iframe 沙箱不提供同源存储，storage 仅作为运行时声明");
    if ((sandbox.memoryLimitMb ?? 64) < 16) push("warning", where, "memoryLimitMb 低于 16MB 可能导致组件不稳定");

    const preview = component["x-previewHtml"];
    if (typeof preview === "string" && preview.length > 200_000) {
      push("warning", where, "内联预览 HTML 超过 200KB，建议改为远程模块");
    }
    if (runtime !== "builtin" && !preview) {
      push("warning", where, "未提供内联预览，设计器只能显示契约占位");
    }
  });

  return issues;
}
