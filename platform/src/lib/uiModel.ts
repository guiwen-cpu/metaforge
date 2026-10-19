import registryJson from "@/data/builtinComponents.json";
import type { ArtifactRef, DataEntity, DataField, DataSchema } from "@/types/dataModel";
import type {
  ComponentDef,
  ComponentPropDef,
  ComponentRegistry,
  NodeLocation,
  PageDataSource,
  PageKind,
  UiIssue,
  UINode,
  UISchema
} from "@/types/uiModel";
import { ulid } from "./ulid";

export const registry = registryJson as unknown as ComponentRegistry;
export const COMPONENTS: ComponentDef[] = registry.components;
export const builtinComponentNames = new Set(COMPONENTS.map((component) => component.name));
export const componentMap = new Map(COMPONENTS.map((component) => [component.name, component]));

export function isBuiltinComponent(name: string): boolean {
  return builtinComponentNames.has(name);
}

export function componentOf(name: string): ComponentDef | null {
  return componentMap.get(name) ?? null;
}

export function registerCustomComponents(list: ComponentDef[] | null | undefined): void {
  for (const name of Array.from(componentMap.keys())) {
    if (!builtinComponentNames.has(name)) componentMap.delete(name);
  }
  for (const component of list ?? []) {
    if (!component?.name || builtinComponentNames.has(component.name)) continue;
    componentMap.set(component.name, component);
  }
}

export function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.default === "string") return record.default;
    if (typeof record.default === "number") return String(record.default);
  }
  return "";
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const PAGE_KINDS: Array<{ value: PageKind; label: string; hint: string }> = [
  { value: "list", label: "列表页", hint: "搜索 + 表格 + 分页" },
  { value: "form", label: "表单页", hint: "新建 / 编辑表单" },
  { value: "detail", label: "详情页", hint: "只读字段展示" },
  { value: "approval", label: "审批页", hint: "流程表单 + 审批动作" },
  { value: "dashboard", label: "看板页", hint: "指标与图表布局" },
  { value: "report", label: "报表页", hint: "查询与统计" },
  { value: "custom", label: "自定义页", hint: "自由布局" }
];

export function pageKindLabel(kind: string): string {
  return PAGE_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export const WIDGET_COMPONENTS = COMPONENTS.filter((component) => component.kind === "field");

export const componentGroups = (() => {
  const groups = new Map<string, ComponentDef[]>();
  for (const component of COMPONENTS) {
    const group = component.group ?? "其他";
    const items = groups.get(group) ?? [];
    items.push(component);
    groups.set(group, items);
  }
  const order = ["布局", "容器", "数据", "表单", "展示", "操作", "业务组件", "图表", "其他"];
  return Array.from(groups, ([label, items]) => ({ label, items })).sort(
    (left, right) => order.indexOf(left.label) - order.indexOf(right.label)
  );
})();

export function sanitizeKey(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .replace(/_{2,}/g, "_");
  return normalized || "page";
}

export function uniqueKey(existing: string[], base: string): string {
  const seed = sanitizeKey(base);
  if (!existing.includes(seed)) return seed;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${seed}_${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${seed}_${Date.now()}`;
}

export function entityRefOf(entity: DataEntity): ArtifactRef {
  return { kind: "entity", key: entity.key, version: 1 };
}

export function refKey(ref: unknown): string {
  if (!ref || typeof ref !== "object") return "";
  const record = ref as Record<string, unknown>;
  return typeof record.key === "string" ? record.key : "";
}

export function findEntity(schemas: DataSchema[], ref: unknown): DataEntity | null {
  const key = refKey(ref);
  if (!key) return null;
  for (const schema of schemas) {
    const entity = schema.entities.find((item) => item.key === key);
    if (entity) return entity;
  }
  return null;
}

export function entityFields(schemas: DataSchema[], ref: unknown): DataField[] {
  return findEntity(schemas, ref)?.fields ?? [];
}

export function defaultProps(component: ComponentDef): Record<string, unknown> {
  const props: Record<string, unknown> = cloneJson(
    (component.defaultProps ?? {}) as Record<string, unknown>
  );
  for (const prop of component.props ?? []) {
    if (prop.type === "entityRef" || prop.type === "dataSourceRef") continue;
    if (prop.type === "fieldList" || prop.type === "columnList" || prop.type === "searchFieldList") continue;
    if (prop.defaultValue !== undefined) props[prop.key] = cloneJson(prop.defaultValue);
  }
  return props;
}

export function createNode(componentName: string, overrides: Partial<UINode> = {}): UINode {
  const component = componentOf(componentName);
  const node: UINode = {
    id: ulid(),
    component: componentName,
    props: component ? defaultProps(component) : {}
  };
  if (component?.container) node.children = [];
  return Object.assign(node, overrides);
}

export function isContainer(node: UINode | null | undefined): boolean {
  if (!node) return false;
  return !!componentOf(node.component)?.container || (node.children?.length ?? 0) > 0;
}

export function childNodes(node: UINode): UINode[] {
  return node.children ?? [];
}

export function slotNodes(node: UINode, slot: string): UINode[] {
  return node.slots?.[slot] ?? [];
}

export function walkNodes(
  nodes: UINode[],
  visit: (node: UINode, parent: UINode | null, slot?: string) => void,
  parent: UINode | null = null,
  slot?: string
): void {
  for (const node of nodes) {
    visit(node, parent, slot);
    if (node.children?.length) walkNodes(node.children, visit, node, "default");
    for (const [slotName, slotChildren] of Object.entries(node.slots ?? {})) {
      if (slotChildren?.length) walkNodes(slotChildren, visit, node, slotName);
    }
  }
}

export function allNodes(root: UINode): UINode[] {
  const nodes: UINode[] = [];
  walkNodes([root], (node) => nodes.push(node));
  return nodes;
}

export function findNodeLocation(root: UINode, nodeId: string): NodeLocation | null {
  let found: NodeLocation | null = null;
  const scan = (list: UINode[], parent: UINode | null, slot?: string) => {
    list.forEach((node, index) => {
      if (found) return;
      if (node.id === nodeId) {
        found = { node, parent, list, index, slot };
        return;
      }
      if (node.children?.length) scan(node.children, node, "default");
      for (const [slotName, slotChildren] of Object.entries(node.slots ?? {})) {
        if (slotChildren?.length) scan(slotChildren, node, slotName);
      }
    });
  };
  scan([root], null);
  return found;
}

export function findNode(root: UINode, nodeId: string): UINode | null {
  return findNodeLocation(root, nodeId)?.node ?? null;
}

export function canAccept(parent: UINode | null, childComponent: string): boolean {
  if (!parent) return true;
  const def = componentOf(parent.component);
  if (!def?.container) return false;
  const child = componentOf(childComponent);
  if (!def.acceptChildren?.length || !child) return true;
  return def.acceptChildren.includes(child.kind);
}

export function containerTarget(root: UINode, selectedId: string | null): UINode {
  let cursor: UINode | null = selectedId ? findNode(root, selectedId) : root;
  while (cursor) {
    if (componentOf(cursor.component)?.container) return cursor;
    const location = findNodeLocation(root, cursor.id);
    cursor = location?.parent ?? null;
  }
  return root;
}

export function appendNode(root: UINode, parentId: string, node: UINode, slot = "default"): boolean {
  const parent = findNode(root, parentId);
  if (!parent) return false;
  if (slot === "default") {
    if (!parent.children) parent.children = [];
    parent.children.push(node);
    return true;
  }
  if (!parent.slots) parent.slots = {};
  if (!parent.slots[slot]) parent.slots[slot] = [];
  parent.slots[slot].push(node);
  return true;
}

export function removeNode(root: UINode, nodeId: string): UINode | null {
  const location = findNodeLocation(root, nodeId);
  if (!location || location.node.id === root.id) return null;
  location.list.splice(location.index, 1);
  return location.node;
}

export function moveNode(root: UINode, nodeId: string, delta: number): boolean {
  const location = findNodeLocation(root, nodeId);
  if (!location) return false;
  const next = location.index + delta;
  if (next < 0 || next >= location.list.length) return false;
  const [node] = location.list.splice(location.index, 1);
  location.list.splice(next, 0, node);
  return true;
}

export function regenerateIds(node: UINode): UINode {
  const copy = cloneJson(node);
  copy.id = ulid();
  copy.children = copy.children?.map(regenerateIds);
  if (copy.slots) {
    for (const key of Object.keys(copy.slots)) {
      copy.slots[key] = copy.slots[key].map(regenerateIds);
    }
  }
  return copy;
}

export function nodeCount(root: UINode): number {
  return allNodes(root).length;
}
const FIELD_WIDGETS: Record<string, string> = {
  string: "x-input",
  text: "x-textarea",
  richText: "x-rich-text",
  integer: "x-number",
  decimal: "x-number",
  boolean: "x-switch",
  date: "x-date-picker",
  datetime: "x-date-picker",
  time: "x-date-picker",
  enum: "x-select",
  ref: "x-select",
  file: "x-upload",
  image: "x-upload",
  video: "x-upload",
  json: "x-json-editor",
  signature: "x-signature",
  location: "x-location",
  array: "x-select"
};

export function widgetForField(field: DataField): string {
  const explicit = field.uiHints?.widget;
  if (explicit) return explicit;
  return FIELD_WIDGETS[field.type] ?? "x-input";
}

function columnWidth(field: DataField): number {
  if (field.type === "datetime") return 160;
  if (field.type === "date") return 120;
  if (field.type === "boolean" || field.type === "enum") return 100;
  if (field.type === "text") return 220;
  if (field.type === "decimal" || field.type === "integer") return 100;
  return 140;
}

export function columnOf(field: DataField, existing: string[] = []): Record<string, unknown> {
  const column: Record<string, unknown> = {
    field: field.key,
    label: field.label,
    width: String(columnWidth(field)),
    widget: widgetForField(field)
  };
  if (field.enumRef) column.enumRef = cloneJson(field.enumRef);
  if (field.type === "datetime") column.format = "YYYY-MM-DD HH:mm";
  if (field.type === "date") column.format = "YYYY-MM-DD";
  if (field.type === "decimal" || field.type === "integer") column.align = "right";
  if (field.searchable) column.sortable = true;
  if (existing.includes(String(column.field))) return {};
  return column;
}

export function formItemOf(field: DataField): Record<string, unknown> {
  return {
    field: field.key,
    label: field.label,
    span: field.type === "text" || field.type === "richText" || field.type === "file" ? 24 : 12,
    required: !!field.required,
    widget: widgetForField(field),
    ...(field.uiHints?.placeholder ? { placeholder: field.uiHints.placeholder } : {}),
    ...(field.enumRef ? { enumRef: cloneJson(field.enumRef) } : {}),
    ...(field.type === "file" || field.type === "image" || field.type === "video"
      ? {
          maxSize: (field.uiHints?.upload?.maxSizeMb ?? 20) * 1024 * 1024,
          maxCount: field.uiHints?.upload?.maxCount ?? (field.type === "file" ? 5 : 1),
          multiple: field.uiHints?.upload?.multiple ?? field.type === "file"
        }
      : {})
  };
}

export function searchItemOf(field: DataField): Record<string, unknown> {
  const widget = widgetForField(field);
  const op =
    field.type === "string" || field.type === "text"
      ? "like"
      : field.type === "date" || field.type === "datetime"
        ? "between"
        : "in";
  return {
    field: field.key,
    label: field.label,
    op,
    span: field.type === "datetime" || field.type === "date" ? 6 : 5,
    widget
  };
}

function starterButton(text: string, type = "primary"): UINode {
  return createNode("x-btn", { props: { text, type } });
}

function visibleFields(entity: DataEntity | null): DataField[] {
  return (entity?.fields ?? []).filter((field) => !field.uiHints?.hideInList && field.key !== "id");
}

export function createStarterPage(
  kind: PageKind,
  key: string,
  title: string,
  schemas: DataSchema[],
  entityKey?: string
): UISchema {
  const entity = entityKey
    ? schemas.flatMap((schema) => schema.entities).find((item) => item.key === entityKey) ?? null
    : schemas[0]?.entities[0] ?? null;
  const entityRef = entity ? entityRefOf(entity) : undefined;
  const fields = visibleFields(entity);
  const dataSources: PageDataSource[] = [];
  const state: Record<string, unknown> = {};

  if (kind === "list") {
    dataSources.push({
      id: "ds_main",
      type: "entity",
      name: `${title}数据`,
      ...(entityRef ? { entityRef } : {}),
      mode: "page",
      immediate: true
    });
    state.query = { type: "object", initial: { page: 1, size: 10 } };
  } else if (kind === "form") {
    state.form = { type: "object", initial: {} };
  } else if (kind === "approval") {
    dataSources.push({
      id: "ds_detail",
      type: "entity",
      name: "业务单据",
      ...(entityRef ? { entityRef } : {}),
      mode: "one",
      immediate: true
    });
    state.form = { type: "object", initial: {} };
  }

  const root = createNode("x-page", {
    props: {
      title,
      subtitle: kind === "list" ? "按条件检索、分页浏览并处理业务数据" : "",
      showBreadcrumb: true
    }
  });

  if (kind === "list") {
    const searchList = (fields.filter((field) => field.searchable).length
      ? fields.filter((field) => field.searchable)
      : fields.filter((field) => ["string", "enum", "date", "datetime"].includes(field.type)).slice(0, 4)
    ).map(searchItemOf);

    const columns = fields.slice(0, 8).map((field) => columnOf(field));

    const search = createNode("x-search-form", {
      props: {
        ...(entityRef ? { entityRef: cloneJson(entityRef) } : {}),
        model: { $ref: "$page.state.query" },
        targetDataSourceId: "ds_main",
        fieldsPerRow: 4,
        collapsible: true,
        searchFieldList: searchList
      },
      slots: { right: [starterButton("+ 新建")] }
    });

    const table = createNode("x-table", {
      props: {
        ...(entityRef ? { entityRef: cloneJson(entityRef) } : {}),
        dataSourceId: "ds_main",
        rowKey: "id",
        selection: "none",
        stripe: true,
        autoHeight: true,
        emptyText: "暂无数据",
        columnList: columns
      }
    });

    const pagination = createNode("x-pagination", {
      props: { dataSourceId: "ds_main" }
    });

    const card = createNode("x-card", {
      props: { title: `${title}列表`, bordered: true },
      children: [search, table, pagination]
    });
    root.children = [card];
  } else if (kind === "form") {
    const form = createNode("x-form", {
      props: {
        ...(entityRef ? { entityRef: cloneJson(entityRef) } : {}),
        model: { $ref: "$page.state.form" },
        fieldList: fields.map(formItemOf),
        labelWidth: "110px",
        columnsPerRow: 2,
        showActions: true,
        submitText: "保存"
      }
    });
    const card = createNode("x-card", {
      props: { title },
      children: [form]
    });
    root.children = [card];
  } else if (kind === "detail") {
    const descriptions = createNode("x-descriptions", {
      props: {
        ...(entityRef ? { entityRef: cloneJson(entityRef) } : {}),
        dataSourceId: "ds_main",
        column: 2,
        border: true,
        fieldList: fields.map((field) => ({ field: field.key, label: field.label }))
      }
    });
    const card = createNode("x-card", {
      props: { title },
      children: [descriptions]
    });
    root.children = [card];
  } else if (kind === "approval") {
    const processForm = createNode("x-process-form", {
      props: {
        flowRef: { $ref: "$page.state.flow" },
        ...(entityRef ? { entityRef: cloneJson(entityRef) } : {}),
        model: { $ref: "$page.state.form" },
        columnsPerRow: 2
      }
    });
    const timeline = createNode("x-approval-timeline", {
      props: {
        processInstanceId: { $ref: "$page.state.processInstanceId" },
        showComment: true,
        showAssignee: true
      }
    });
    const left = createNode("x-col", {
      props: { span: 16 },
      children: [createNode("x-card", { props: { title: "申请信息" }, children: [processForm] })]
    });
    const right = createNode("x-col", {
      props: { span: 8 },
      children: [createNode("x-card", { props: { title: "审批流程" }, children: [timeline] })]
    });
    const row = createNode("x-row", { props: { gutter: 16 }, children: [left, right] });
    const actions = createNode("x-approval-actions", {
      props: {
        taskId: { $ref: "$page.state.taskId" },
        flowRef: { $ref: "$page.state.flow" },
        outcomes: ["approve", "reject"],
        showAssignee: true
      }
    });
    root.children = [row, actions];
  } else if (kind === "dashboard") {
    const metrics = [
      { title: "本月新增", value: "128", hint: "较上月 +12%" },
      { title: "待处理", value: "23", hint: "需要在今日处理" },
      { title: "完成率", value: "86%", hint: "目标 90%" }
    ];
    const cols = metrics.map((metric) =>
      createNode("x-col", {
        props: { span: 8 },
        children: [
          createNode("x-card", {
            props: { title: metric.title },
            children: [
              createNode("x-text", {
                props: { content: metric.value, size: "28px", type: "primary" }
              }),
              createNode("x-text", { props: { content: metric.hint, size: "12px", type: "info" } })
            ]
          })
        ]
      })
    );
    root.children = [createNode("x-row", { props: { gutter: 16 }, children: cols })];
  } else {
    root.children = [
      createNode("x-card", {
        props: { title },
        children: [createNode("x-text", { props: { content: "从左侧组件面板拖入组件开始搭建页面" } })]
      })
    ];
  }

  return {
    id: ulid(),
    key,
    title: { default: title },
    kind,
    scope: "app",
    version: 1,
    route: {
      path: `/${key.replace(/_/g, "-")}`,
      name: key.replace(/(^|_)([a-z])/g, (_, __, char: string) => char.toUpperCase()),
      layout: "side",
      auth: true
    },
    dataSources,
    state,
    layout: root,
    semantic: { intent: `${title}页面由页面设计器生成` }
  };
}

export function systemColumns(entity: DataEntity): Set<string> {
  const columns = new Set<string>(["id"]);
  const storage = entity.storage ?? {};
  if (storage.primaryKey) columns.add(storage.primaryKey);
  if (storage.tenantColumn) columns.add(storage.tenantColumn);
  if (storage.jsonbColumn) columns.add(storage.jsonbColumn);
  const timestamps = storage.timestamps ?? {};
  for (const key of [timestamps.createdAt, timestamps.updatedAt, timestamps.createdBy, timestamps.updatedBy]) {
    if (key) columns.add(key);
  }
  if (storage.softDelete?.column) columns.add(storage.softDelete.column);
  if (storage.optimisticLock) columns.add("version");
  return columns;
}

export function titleOfPage(page: UISchema): string {
  return textOf(page.title) || page.key;
}

export function validateUiSchemas(
  pages: UISchema[],
  dataSchemas: DataSchema[],
  customComponents: Array<ComponentDef | string> = []
): UiIssue[] {
  const issues: UiIssue[] = [];
  const pageKeys = new Set<string>();
  const pageIds = new Set<string>();
  const routePaths = new Map<string, string>();
  const entityKeys = new Set(dataSchemas.flatMap((schema) => schema.entities.map((entity) => entity.key)));
  const customDefs = customComponents.filter(
    (item): item is ComponentDef => typeof item === "object" && item !== null
  );
  registerCustomComponents(customDefs);
  const customNames = customComponents
    .map((item) => (typeof item === "string" ? item : item.name))
    .filter(Boolean);
  const knownComponents = new Set([...COMPONENTS.map((component) => component.name), ...customNames]);

  const push = (level: UiIssue["level"], where: string, message: string) => {
    issues.push({ level, where, message });
  };

  pages.forEach((page, pageIndex) => {
    const where = page.key || `uiSchemas[${pageIndex}]`;
    if (!page.id || page.id.length !== 26) push("error", where, "页面 id 必须是 26 位 ULID");
    if (pageIds.has(page.id)) push("error", where, "页面 id 重复");
    pageIds.add(page.id);
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(page.key || "")) {
      push("error", where, "页面 key 必须是小写 snake_case");
    }
    if (pageKeys.has(page.key)) push("error", where, "页面 key 重复");
    pageKeys.add(page.key);
    if (!titleOfPage(page).trim()) push("error", where, "页面标题不能为空");
    if (!page.route?.path) {
      push("error", where, "路由路径不能为空");
    } else {
      if (!page.route.path.startsWith("/")) push("error", where, "路由路径必须以 / 开头");
      const owner = routePaths.get(page.route.path);
      if (owner) push("error", where, `路由路径与页面 ${owner} 冲突`);
      else routePaths.set(page.route.path, page.key);
    }
    if (!PAGE_KINDS.some((item) => item.value === page.kind)) {
      push("warning", where, `未知页面类型 ${page.kind}`);
    }

    const dataSourceIds = new Set<string>();
    (page.dataSources ?? []).forEach((source) => {
      if (!source.id) push("error", where, "数据源 id 不能为空");
      if (dataSourceIds.has(source.id)) push("error", where, `数据源 id ${source.id} 重复`);
      dataSourceIds.add(source.id);
      if (source.type === "entity") {
        const key = refKey(source.entityRef);
        if (!key) push("error", `${where} / 数据源 ${source.id}`, "实体数据源必须选择实体");
        else if (!entityKeys.has(key)) push("error", `${where} / 数据源 ${source.id}`, `实体 ${key} 不存在`);
      }
    });

    if (!page.layout) {
      push("error", where, "页面缺少 layout");
      return;
    }
    if (page.layout.component !== "x-page") {
      push("error", `${where} / layout`, "根节点必须是 x-page");
    }

    const nodeIds = new Set<string>();
    walkNodes([page.layout], (node, parent) => {
      const nodeWhere = `${where} / ${node.component}#${node.id.slice(-4)}`;
      if (nodeIds.has(node.id)) push("error", nodeWhere, "节点 id 重复");
      nodeIds.add(node.id);
      if (!node.id || node.id.length !== 26) push("error", nodeWhere, "节点 id 必须是 26 位 ULID");

      const def = componentOf(node.component);
      if (!def) {
        if (customNames.includes(node.component)) {
          push("warning", nodeWhere, `自定义组件 ${node.component} 需要确保运行时会注册`);
        } else {
          push("error", nodeWhere, `未知组件 ${node.component}`);
        }
      } else {
        (node.children ?? []).forEach((child) => {
          if (!canAccept(node, child.component)) {
            push("error", `${nodeWhere} / 子节点 ${child.component}`, `${node.component} 不接受 ${child.component}`);
          }
        });
        for (const prop of def.props ?? []) {
          const value = node.props?.[prop.key];
          if (prop.required && (value === undefined || value === null || value === "")) {
            push("error", nodeWhere, `缺少必填属性 ${prop.key}`);
          }
        }
        for (const key of Object.keys(node.props ?? {})) {
          if (key.startsWith("x-") || key === "semantic") continue;
          if (!(def.props ?? []).some((prop) => prop.key === key)) {
            push("warning", nodeWhere, `属性 ${key} 不在 ${node.component} 契约中`);
          }
        }
      }

      if (parent && !componentOf(parent.component)?.container) {
        push("error", nodeWhere, `父组件 ${parent.component} 不是容器`);
      }

      const entityKey = refKey(node.props?.entityRef);
      if (entityKey && !entityKeys.has(entityKey)) {
        push("error", nodeWhere, `引用的实体 ${entityKey} 不存在`);
      }

      const boundSource = node.props?.dataSourceId ?? node.props?.targetDataSourceId;
      if (typeof boundSource === "string" && !dataSourceIds.has(boundSource)) {
        push("error", nodeWhere, `数据源 ${boundSource} 不存在`);
      }

      const collections: Array<[string, unknown]> = [
        ["columnList", node.props?.columnList],
        ["fieldList", node.props?.fieldList],
        ["searchFieldList", node.props?.searchFieldList]
      ];
      for (const [propKey, value] of collections) {
        if (!Array.isArray(value)) continue;
        value.forEach((item, index) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          const fieldKey = record.field;
          if (typeof fieldKey !== "string" || !fieldKey) {
            // 操作列 / 按钮列允许没有 field
            if (record.widget || record.type) return;
            push("warning", `${nodeWhere} / ${propKey}[${index}]`, "列表项缺少 field");
            return;
          }
          const entity = findEntity(dataSchemas, node.props?.entityRef);
          const physical = entity ? systemColumns(entity) : new Set<string>();
          if (
            entity &&
            !entity.fields.some((field) => field.key === fieldKey) &&
            fieldKey !== "actions" &&
            !physical.has(fieldKey)
          ) {
            push("warning", `${nodeWhere} / ${propKey}`, `字段 ${fieldKey} 不在实体 ${entity.key} 中`);
          }
        });
      }
    });
  });

  return issues;
}