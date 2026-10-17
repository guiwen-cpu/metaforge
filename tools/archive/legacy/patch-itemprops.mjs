import fs from "node:fs";
const P = "registry/builtin-components.json";
const reg = JSON.parse(fs.readFileSync(P, "utf8"));
const p = (key, label, type, flags = "", extra = {}) => ({
  key, label, type,
  ...(flags.includes("B") ? { bindable: true } : {}),
  ...(flags.includes("R") ? { required: true } : {}),
  ...(flags.includes("A") ? { advanced: true } : {}),
  ...extra
});

const COLUMN_ITEM = { itemType: "json", itemProps: [
  p("field", "字段", "fieldRef", "R", { description: "指向 Data Schema 的 Field.key；标签/类型/枚举/格式化默认由此推导，本项只写差异" }),
  p("label", "列标题", "text", "", { description: "缺省取 Field.label" }),
  p("widget", "渲染控件", "string", "", { description: "覆盖控件解析结果，如 x-status-tag / x-enum-text / x-row-actions" }),
  p("enumRef", "枚举", "json"), p("format", "格式化", "string"), p("width", "宽度", "cssLength"), p("minWidth", "最小宽度", "cssLength"),
  p("align", "对齐", "enum", "", { enum: ["left", "center", "right"] }), p("sortable", "可排序", "boolean"),
  p("fixed", "固定", "enum", "", { enum: ["left", "right"] }), p("hidden", "隐藏", "expr", "B"),
  p("sum", "参与合计", "boolean"), p("slot", "自定义插槽", "string", "A"),
  p("buttons", "操作按钮", "buttonList", "A", { description: "widget=x-row-actions 时的按钮清单" })
]};

const FIELD_ITEM = { itemType: "json", itemProps: [
  p("field", "字段", "fieldRef", "R"),
  p("label", "标签", "text"), p("widget", "渲染控件", "string"), p("span", "栅格宽度(24)", "integer"),
  p("required", "必填", "boolean", "", { description: "只能收紧不能放宽：默认取 Field.required，此处仅可覆盖为 true" }),
  p("readonly", "只读", "expr", "B"), p("hidden", "隐藏", "expr", "B"), p("when", "条件显示", "expr", "B"),
  p("help", "帮助文案", "text"), p("placeholder", "占位提示", "text"), p("defaultValue", "默认值", "json"),
  p("props", "控件属性透传", "json", "A", { description: "直接透传给底层控件，用于 Schema 尚未标准化的冷门属性；能标准化的一律升格为正式 PropDef" })
]};

const SEARCH_ITEM = { itemType: "json", itemProps: [
  p("field", "字段", "fieldRef", "R"),
  p("label", "标签", "text", "", { description: "缺省取 Field.label" }),
  p("op", "查询算子", "enum", "", { enum: ["eq", "ne", "like", "in", "between", "gt", "gte", "lt", "lte", "isNull", "notNull"], defaultValue: "eq", description: "与 expression-registry.queryOperators 同源；前端控件与后端下推编译共用" }),
  p("span", "栅格宽度(24)", "integer", "", { defaultValue: 6 }), p("placeholder", "占位提示", "text"),
  p("defaultValue", "默认值", "json"), p("widget", "渲染控件", "string")
]};

const BUTTON_ITEM = { itemType: "json", itemProps: [
  p("key", "标识", "string", "R"), p("label", "文案", "text", "R"), p("actionRef", "动作", "actionRef", "A"),
  p("steps", "内联步骤", "stepList", "A", { description: "与 actionRef 二选一，用于一次性逻辑，不值得沉淀为 Action 时" }),
  p("params", "参数", "json"), p("visible", "可见", "expr", "B"), p("disabled", "禁用", "expr", "B"),
  p("danger", "危险操作", "boolean"), p("icon", "图标", "icon"), p("confirm", "二次确认", "expr", "B"),
  p("permission", "权限", "expr", "B"), p("badge", "角标", "expr", "B"), p("order", "顺序", "integer")
]};

const OPTION_ITEM = { itemType: "json", itemProps: [
  p("value", "值", "json", "R"), p("label", "标签", "text", "R"), p("color", "颜色", "color"),
  p("disabled", "禁用", "boolean"), p("icon", "图标", "icon"), p("order", "顺序", "integer")
]};

const TAB_ITEM = { itemType: "json", itemProps: [
  p("key", "标识", "string", "R"), p("label", "标题", "text", "R"), p("icon", "图标", "icon"),
  p("disabled", "禁用", "boolean"), p("lazy", "懒渲染", "boolean"), p("badge", "角标", "expr", "B")
]};

const TARGETS = {
  "x-table|columnList": COLUMN_ITEM,
  "x-form|fieldList": FIELD_ITEM,
  "x-descriptions|fieldList": FIELD_ITEM,
  "x-search-form|searchFieldList": SEARCH_ITEM,
  "x-row-actions|actions": BUTTON_ITEM,
  "x-approval-actions|outcomes": BUTTON_ITEM,
  "x-select|optionList": OPTION_ITEM,
  "x-radio-group|optionList": OPTION_ITEM,
  "x-checkbox-group|optionList": OPTION_ITEM,
  "x-approval-actions|reasonTemplates": OPTION_ITEM,
  "x-tabs|items": TAB_ITEM,
  "x-pagination|pageSizes": OPTION_ITEM
};

let hit = 0;
for (const c of reg.components) {
  for (const pd of c.props) {
    const t = TARGETS[`${c.name}|${pd.key}`];
    if (t) { pd.itemType = t.itemType; pd.itemProps = t.itemProps; hit += 1; }
  }
}
reg.itemContractNote = "结构化 prop（columnList / fieldList / searchFieldList / buttonList / optionList / items）的元素契约由各 PropDef.itemProps 声明。设计器据此渲染列编辑器/字段选择器，校验器据此拒绝未知键，出码引擎据此生成模板 —— 三处读同一份。";
fs.writeFileSync(P, JSON.stringify(reg, null, 2) + "\n", "utf8");
console.log("patched props:", hit, "| size:", fs.statSync(P).size);
