import fs from "node:fs";
const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let seq = 0;
const uid = () => { seq += 1; let n = seq, s = ""; while (s.length < 6) { s = A[n % 32] + s; n = Math.floor(n / 32); } return "01J8ZQ4K2M0000000000" + s; };

const p = (key, label, type, flags = "", extra = {}) => ({
  key, label, type,
  ...(flags.includes("B") ? { bindable: true } : {}),
  ...(flags.includes("R") ? { required: true } : {}),
  ...(flags.includes("A") ? { advanced: true } : {}),
  ...extra
});

const C = (name, kind, title, o = {}) => {
  const c = { id: uid(), name, version: 1, title, kind, props: o.props || [], capabilities: o.caps || {} };
  if (o.group) c.group = o.group;
  if (o.desc) c.description = o.desc;
  if (o.container) { c.container = true; c.acceptChildren = o.acceptChildren || []; }
  if (o.slots) c.slots = o.slots;
  if (o.events) c.events = o.events;
  if (o.actions) c.actions = o.actions;
  if (o.data) c.data = o.data;
  if (o.fb) c.fieldBindings = o.fb;
  if (o.sandbox) c.sandbox = o.sandbox;
  if (o.semantic) c.semantic = o.semantic;
  if (o.defaultProps) c.defaultProps = o.defaultProps;
  return c;
};

const S = (name, label, o = {}) => ({ name, label, ...(o.multiple === false ? { multiple: false } : {}), ...(o.scope ? { scope: o.scope } : {}), ...(o.accepts ? { accepts: o.accepts } : {}), ...(o.desc ? { description: o.desc } : {}) });
const E = (name, label, params = []) => ({ name, label, ...(params.length ? { params } : {}) });
const CAP = (o) => ({ formField: false, listColumn: false, supportsDataSource: false, supportsLoop: false, virtualScroll: false, ...o });

const components = [];

components.push(
  C("x-page", "layout", "页面容器", { group: "布局", container: true, acceptChildren: ["layout", "container", "data", "display", "field", "action", "chart", "advanced"],
    desc: "每个 UISchema.layout 的根节点必须是 x-page。负责标题、面包屑、页面级 loading 与留白。",
    props: [
      p("title", "页面标题", "text", "B"), p("subtitle", "副标题", "text", "B"),
      p("showBreadcrumb", "显示面包屑", "boolean", "", { defaultValue: true }),
      p("loading", "加载中", "expr", "B"), p("padding", "内边距", "cssLength", "", { defaultValue: "16px" }),
      p("background", "背景色", "color"), p("maxWidth", "最大宽度", "cssLength", "A")
    ],
    slots: [S("header", "页头", { multiple: false }), S("default", "主体"), S("footer", "页脚", { multiple: false })],
    caps: CAP({}) }),

  C("x-card", "container", "卡片", { group: "布局", container: true, acceptChildren: ["data", "display", "field", "action", "layout", "advanced"],
    props: [p("title", "标题", "text", "B"), p("extra", "右上角文案", "text", "B"), p("bordered", "带边框", "boolean", "", { defaultValue: true }),
      p("shadow", "阴影", "enum", "", { enum: ["always", "hover", "never"], defaultValue: "never" }), p("collapsible", "可折叠", "boolean"), p("padding", "内边距", "cssLength")],
    slots: [S("default", "内容"), S("header", "自定义页头", { multiple: false }), S("extra", "右上角", { multiple: false })],
    caps: CAP({}) }),

  C("x-row", "layout", "栅格行", { group: "布局", container: true, acceptChildren: ["layout", "container", "data", "display", "field", "action", "advanced"],
    props: [p("gutter", "列间距", "integer", "", { defaultValue: 16 }), p("align", "垂直对齐", "enum", "", { enum: ["start", "center", "end", "stretch"] }),
      p("justify", "水平分布", "enum", "", { enum: ["start", "center", "end", "between", "around", "evenly"] }), p("wrap", "自动换行", "boolean", "", { defaultValue: true }),
      p("tag", "渲染标签", "string", "A")],
    slots: [S("default", "列")], caps: CAP({}) }),

  C("x-col", "layout", "栅格列", { group: "布局", container: true, acceptChildren: ["layout", "container", "data", "display", "field", "action", "advanced"],
    props: [p("span", "栅格宽度(24)", "integer", "", { min: 0, max: 24, defaultValue: 24 }), p("offset", "左侧偏移", "integer", "", { min: 0, max: 24 }),
      p("xs", "xs 断点", "integer"), p("sm", "sm 断点", "integer"), p("md", "md 断点", "integer"), p("lg", "lg 断点", "integer"), p("xl", "xl 断点", "integer")],
    slots: [S("default", "内容")], caps: CAP({}) }),

  C("x-toolbar", "layout", "工具栏", { group: "布局", container: true, acceptChildren: ["action", "display", "data", "field"],
    props: [p("align", "对齐", "enum", "", { enum: ["start", "end", "between"], defaultValue: "between" }), p("gap", "间距", "cssLength", "", { defaultValue: "8px" }),
      p("sticky", "吸顶", "boolean"), p("size", "尺寸", "enum", "", { enum: ["small", "default", "large"] })],
    slots: [S("left", "左侧", { multiple: false }), S("default", "中间"), S("right", "右侧", { multiple: false })],
    caps: CAP({}) }),

  C("x-dialog", "container", "对话框/抽屉", { group: "容器", container: true, acceptChildren: ["data", "display", "field", "action", "layout", "container", "advanced"],
    desc: "弹窗承载容器。visible 绑定到页面 state；mode 决定 dialog / drawer / modal 三种形态，出码时映射为不同组件但不改变 Schema。",
    props: [p("model", "显示状态", "expr", "B R"), p("title", "标题", "text", "B"), p("mode", "形态", "enum", "", { enum: ["dialog", "drawer", "modal"], defaultValue: "dialog" }),
      p("width", "宽度", "cssLength", "", { defaultValue: "720px" }), p("fullscreen", "全屏", "boolean"), p("destroyOnClose", "关闭即销毁", "boolean", "", { defaultValue: true }),
      p("closeOnClickModal", "点遮罩关闭", "boolean", "", { defaultValue: false }), p("showFooter", "显示底部", "boolean", "", { defaultValue: true }),
      p("confirmText", "确认文案", "text"), p("cancelText", "取消文案", "text"), p("beforeClose", "关闭前校验", "expr", "B A")],
    slots: [S("default", "内容"), S("header", "自定义头部", { multiple: false }), S("footer", "自定义底部", { multiple: false })],
    events: [E("open", "打开"), E("close", "关闭"), E("confirm", "确认")], caps: CAP({}) }),

  C("x-tabs", "container", "标签页", { group: "容器", container: true, acceptChildren: ["data", "display", "field", "layout", "action", "advanced"],
    props: [p("model", "当前页签", "expr", "B"), p("items", "页签定义", "json", "R"), p("mode", "样式", "enum", "", { enum: ["line", "card", "border-card"], defaultValue: "line" }),
      p("position", "位置", "enum", "", { enum: ["top", "left", "right", "bottom"] }), p("lazy", "懒渲染", "boolean", "", { defaultValue: true })],
    slots: [S("default", "页签内容")], events: [E("change", "切换", [{ key: "name", type: "string" }])], caps: CAP({}) }),

  C("x-form-item", "container", "表单项容器", { group: "容器", container: true, acceptChildren: ["field", "display", "action"],
    desc: "把任意组件包成带标签/校验提示的表单项，用于 fieldList 之外的自由布局。",
    props: [p("label", "标签", "text", "B"), p("field", "绑定字段", "expr", "B"), p("required", "必填", "boolean"),
      p("span", "栅格宽度(24)", "integer", "", { min: 1, max: 24, defaultValue: 24 }), p("help", "帮助文案", "text", "B"), p("labelWidth", "标签宽度", "cssLength")],
    slots: [S("default", "控件")], caps: CAP({}) }),

  C("x-table", "data", "数据表格", { group: "数据", container: true, acceptChildren: ["display", "action"],
    desc: "列表页核心组件。列定义 columnList 只写「相对 Data Schema 的差异」，字段标签/类型/枚举/格式化默认从 Data Schema 推导，避免平行结构漂移。",
    props: [p("entityRef", "实体", "entityRef", "R"), p("dataSourceId", "数据源", "dataSourceRef", "B"), p("columnList", "列定义", "columnList"),
      p("rowKey", "行主键", "string", "", { defaultValue: "id" }), p("selection", "选择模式", "enum", "", { enum: ["none", "single", "multiple"], defaultValue: "none" }),
      p("stripe", "斑马纹", "boolean"), p("border", "带边框", "boolean"), p("height", "高度", "cssLength"), p("size", "密度", "enum", "", { enum: ["small", "default", "large"] }),
      p("emptyText", "空数据文案", "text"), p("showIndex", "显示序号", "boolean"), p("autoHeight", "自适应高度", "boolean", "A")],
    slots: [S("toolbar", "表格上方", { multiple: false }), S("empty", "空状态", { multiple: false }), S("expand", "展开行", { multiple: false })],
    events: [E("rowClick", "行点击", [{ key: "row", type: "object" }, { key: "index", type: "integer" }]), E("selectionChange", "选择变化", [{ key: "rows", type: "array" }]),
      E("sortChange", "排序变化", [{ key: "field", type: "string" }, { key: "direction", type: "string" }]), E("refresh", "刷新完成")],
    actions: [{ name: "refresh", label: "刷新", kind: "list", params: { resetPage: false }, returns: "void" }, { name: "clearSelection", label: "清空选择", kind: "list" }],
    data: { role: "table", modelShape: "array", emits: ["rowClick", "selectionChange", "sortChange"], accepts: ["ds:<dataSourceId>:refresh"], refreshable: true, pagination: false },
    caps: CAP({ listColumn: true, supportsDataSource: true, virtualScroll: true }) }),

  C("x-search-form", "data", "搜索表单", { group: "数据", container: true, acceptChildren: ["field"],
    desc: "搜索条件区。searchFieldList 的 op 由查询下推编译器翻译为 SQL WHERE 片段，前端与 BFF 使用同一份 op 定义。",
    props: [p("entityRef", "实体", "entityRef", "R"), p("searchFieldList", "搜索项", "searchFieldList", "R"), p("model", "查询对象", "expr", "B"),
      p("targetDataSourceId", "联动数据源", "dataSourceRef"), p("fieldsPerRow", "每行项数", "integer", "", { defaultValue: 4 }),
      p("collapsible", "可折叠", "boolean", "", { defaultValue: true }), p("defaultCollapsed", "默认折叠", "boolean", "", { defaultValue: true }),
      p("showReset", "显示重置", "boolean", "", { defaultValue: true }), p("labelWidth", "标签宽度", "cssLength")],
    slots: [S("default", "额外搜索项"), S("right", "右侧按钮区", { multiple: false })],
    events: [E("search", "搜索", [{ key: "query", type: "object" }]), E("reset", "重置"), E("change", "条件变化", [{ key: "query", type: "object" }])],
    actions: [{ name: "submit", label: "触发搜索", kind: "data" }, { name: "reset", label: "重置", kind: "data" }],
    data: { role: "form", modelShape: "object", emits: ["search", "reset"], accepts: [], submitable: true },
    caps: CAP({}) }),

  C("x-pagination", "data", "分页器", { group: "数据",
    props: [p("dataSourceId", "数据源", "dataSourceRef", "B"), p("pageParam", "页码参数名", "string", "", { defaultValue: "page" }),
      p("sizeParam", "每页条数参数名", "string", "", { defaultValue: "size" }), p("pageSizes", "可选页长", "optionList", "", { defaultValue: [10, 20, 50, 100] }),
      p("layout", "布局", "string", "", { defaultValue: "total, sizes, prev, pager, next, jumper" }), p("background", "带背景", "boolean", "", { defaultValue: true }),
      p("total", "总条数", "expr", "B")],
    events: [E("change", "翻页", [{ key: "page", type: "integer" }, { key: "size", type: "integer" }])],
    caps: CAP({ supportsDataSource: true }) }),

  C("x-form", "data", "表单", { group: "数据", container: true, acceptChildren: ["field", "display", "action", "container"],
    desc: "创建型/编辑型表单。fieldList 只声明「要哪些字段 + 顺序 + 覆盖项」，控件、校验、必填、枚举选项全部从 Data Schema 推导。",
    props: [p("entityRef", "实体", "entityRef", "R"), p("fieldList", "字段清单", "fieldList", "R"), p("model", "数据模型", "expr", "B R"),
      p("labelPosition", "标签位置", "enum", "", { enum: ["top", "left", "right"], defaultValue: "right" }), p("labelWidth", "标签宽度", "cssLength", "", { defaultValue: "110px" }),
      p("columnsPerRow", "每行字段数", "integer", "", { defaultValue: 2 }), p("disabled", "整体禁用", "expr", "B"), p("readonly", "只读", "expr", "B"),
      p("showActions", "显示默认按钮", "boolean", "", { defaultValue: true }), p("submitText", "提交文案", "text"), p("resetText", "重置文案", "text"),
      p("validateOnRule", "失焦即校验", "boolean", "", { defaultValue: true })],
    slots: [S("default", "自定义表单项"), S("actions", "按钮区", { multiple: false })],
    events: [E("submit", "提交", [{ key: "model", type: "object" }]), E("reset", "重置"), E("validateFail", "校验失败", [{ key: "errors", type: "array" }])],
    actions: [{ name: "validate", label: "校验", kind: "form", returns: "boolean" }, { name: "submit", label: "提交", kind: "form" },
      { name: "reset", label: "重置", kind: "form" }, { name: "setFields", label: "赋值", kind: "form", params: { values: {} } }],
    data: { role: "form", modelShape: "object", emits: ["submit", "reset", "validateFail"], submitable: true },
    caps: CAP({ supportsBinding: true }) }),

  C("x-descriptions", "data", "详情描述列表", { group: "数据",
    props: [p("entityRef", "实体", "entityRef", "R"), p("dataSourceId", "数据源", "dataSourceRef", "B"), p("fieldList", "字段清单", "fieldList", "R"),
      p("column", "每行列数", "integer", "", { defaultValue: 2 }), p("border", "带边框", "boolean", "", { defaultValue: true }),
      p("direction", "排布方向", "enum", "", { enum: ["horizontal", "vertical"], defaultValue: "horizontal" }), p("labelWidth", "标签宽度", "cssLength")],
    data: { role: "detail", modelShape: "object" }, caps: CAP({ supportsDataSource: true }) })
);

components.push(
  C("x-input", "field", "单行文本", { group: "表单", desc: "string 的默认渲染器。", props: [
    p("model", "绑定值", "expr", "B R"), p("placeholder", "占位提示", "text", "", { defaultValue: "请输入" }), p("maxlength", "最大长度", "integer"),
    p("showWordLimit", "显示字数", "boolean"), p("clearable", "可清空", "boolean", "", { defaultValue: true }),
    p("prefixIcon", "前缀图标", "icon"), p("suffixIcon", "后缀图标", "icon"), p("type", "输入类型", "enum", "", { enum: ["text", "password", "number"], defaultValue: "text" })],
    events: [E("input", "输入", [{ key: "value", type: "string" }]), E("change", "变化"), E("blur", "失焦")],
    fb: { forFieldTypes: ["string"], priority: 100, listRenderer: false }, caps: CAP({ formField: true }) }),

  C("x-textarea", "field", "多行文本", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("rows", "行数", "integer", "", { defaultValue: 3 }), p("maxlength", "最大长度", "integer"),
    p("showWordLimit", "显示字数", "boolean", "", { defaultValue: true }), p("autosize", "自适应高度", "boolean"), p("placeholder", "占位提示", "text"),
    p("countGraphemes", "按字素计数", "boolean", "A")],
    events: [E("input", "输入"), E("blur", "失焦")], fb: { forFieldTypes: ["text"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-rich-text", "field", "富文本", { group: "表单", desc: "richText。出码后端渲染时需注意 XSS：统一走平台 sanitize 白名单。", props: [
    p("model", "绑定值", "expr", "B R"), p("height", "编辑区高度", "cssLength", "", { defaultValue: "280px" }),
    p("toolbar", "工具栏", "enum", "", { enum: ["full", "simple", "minimal"], defaultValue: "simple" }), p("readonly", "只读", "expr", "B"), p("placeholder", "占位提示", "text")],
    events: [E("change", "变化")], fb: { forFieldTypes: ["richText"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-number", "field", "数字输入", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("min", "最小值", "number"), p("max", "最大值", "number"), p("precision", "小数位", "integer"),
    p("step", "步长", "number"), p("unit", "单位", "string"), p("controls", "显示步进按钮", "boolean", "", { defaultValue: false })],
    events: [E("change", "变化")], fb: { forFieldTypes: ["integer", "decimal"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-switch", "field", "开关", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("activeText", "开启文案", "text"), p("inactiveText", "关闭文案", "text"),
    p("activeValue", "开启值", "json", "", { defaultValue: true }), p("inactiveValue", "关闭值", "json", "", { defaultValue: false })],
    events: [E("change", "变化")], fb: { forFieldTypes: ["boolean"], priority: 100, listRenderer: true }, caps: CAP({ formField: true, listColumn: true }) }),

  C("x-select", "field", "下拉选择", { group: "表单", desc: "enum / ref 的默认渲染器；array 无 itemType 时退化为多选。选项优先取 enumRef，其次取 refEntity 的 titleField。", props: [
    p("model", "绑定值", "expr", "B R"), p("enumRef", "枚举", "json"), p("optionList", "静态选项", "optionList"),
    p("entityRef", "选项实体", "entityRef", "A"), p("multiple", "多选", "boolean"), p("filterable", "可搜索", "boolean", "", { defaultValue: true }),
    p("clearable", "可清空", "boolean", "", { defaultValue: true }), p("collapseTags", "折叠标签", "boolean"), p("placeholder", "占位提示", "text"),
    p("remoteActionRef", "远程搜索动作", "actionRef", "A")],
    events: [E("change", "变化", [{ key: "value", type: "any" }]), E("remoteSearch", "远程搜索", [{ key: "keyword", type: "string" }])],
    fb: { forFieldTypes: ["enum", "ref", "array"], priority: 100, listRenderer: false }, caps: CAP({ formField: true }) }),

  C("x-radio-group", "field", "单选组", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("enumRef", "枚举", "json"), p("optionList", "静态选项", "optionList"),
    p("button", "按钮样式", "boolean"), p("direction", "排列", "enum", "", { enum: ["horizontal", "vertical"], defaultValue: "horizontal" })],
    events: [E("change", "变化")], fb: { forFieldTypes: ["enum"], priority: 300 }, caps: CAP({ formField: true }) }),

  C("x-checkbox-group", "field", "多选组", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("enumRef", "枚举", "json"), p("optionList", "静态选项", "optionList"),
    p("min", "最少选", "integer"), p("max", "最多选", "integer"), p("button", "按钮样式", "boolean")],
    events: [E("change", "变化")], fb: { forFieldTypes: ["array"], priority: 400 }, caps: CAP({ formField: true }) }),

  C("x-date-picker", "field", "日期时间", { group: "表单", desc: "date / datetime / time 的默认渲染器。valueFormat 决定写回 Schema 的序列化格式，默认 ISO8601。", props: [
    p("model", "绑定值", "expr", "B R"), p("type", "选择类型", "enum", "", { enum: ["date", "datetime", "datetimerange", "daterange", "month", "year"], defaultValue: "date" }),
    p("format", "显示格式", "dateFormat", "", { defaultValue: "YYYY-MM-DD" }), p("valueFormat", "值格式", "string", "", { defaultValue: "YYYY-MM-DDTHH:mm:ssZ" }),
    p("disabledDate", "禁用日期", "expr", "B A"), p("shortcuts", "快捷选项", "json", "A"), p("placeholder", "占位提示", "text")],
    events: [E("change", "变化")], fb: { forFieldTypes: ["date", "datetime", "time"], priority: 100, listRenderer: true }, caps: CAP({ formField: true, listColumn: true }) }),

  C("x-upload", "field", "文件上传", { group: "表单",
    desc: "OSS 客户端直传。流程：向 BFF 取 STS 临时凭证 → 浏览器直接 PUT 到 OSS（不经过后端）→ 成功后回调 BFF 登记 attachment 行。model 写入结构化文件对象数组，而非裸 URL。",
    props: [
      p("model", "绑定值", "expr", "B R"), p("provider", "存储", "enum", "", { enum: ["oss", "local"], defaultValue: "oss" }),
      p("accept", "接受类型", "fileAccept"), p("maxSize", "单文件上限(字节)", "integer", "", { defaultValue: 10485760 }),
      p("maxCount", "数量上限", "integer", "", { defaultValue: 1 }), p("multiple", "多选", "boolean"), p("preview", "可预览", "boolean", "", { defaultValue: true }),
      p("compressImage", "图片压缩", "boolean"), p("listType", "列表样式", "enum", "", { enum: ["text", "picture", "picture-card"], defaultValue: "text" }),
      p("pathTemplate", "OSS 路径模板", "string", "A"), p("autoUpload", "选中即上传", "boolean", "", { defaultValue: true }),
      p("bizType", "业务类型", "string", "A"), p("registerEntity", "登记实体", "entityRef", "A"),
      p("maxVideoDuration", "视频时长上限(秒)", "integer", "A"), p("drag", "支持拖拽", "boolean", "", { defaultValue: true })],
    events: [E("change", "文件变化", [{ key: "files", type: "array" }]), E("success", "上传成功", [{ key: "file", type: "object" }]),
      E("error", "上传失败", [{ key: "error", type: "object" }]), E("remove", "移除", [{ key: "file", type: "object" }]), E("exceed", "超出限制")],
    actions: [{ name: "upload", label: "上传", kind: "upload", params: { files: [] }, returns: "AssetRef[]" },
      { name: "clear", label: "清空", kind: "upload" }, { name: "openPicker", label: "打开选择器", kind: "upload" }],
    data: { role: "form", modelShape: "array", emits: ["change", "success", "error", "remove"] },
    fb: { forFieldTypes: ["file", "image", "video"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-json-editor", "field", "JSON 编辑器", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("height", "高度", "cssLength", "", { defaultValue: "240px" }),
    p("schema", "结构约束", "json", "A"), p("readonly", "只读", "expr", "B")],
    events: [E("change", "变化")], fb: { forFieldTypes: ["json"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-signature", "field", "手写签名", { group: "表单", desc: "输出 PNG 资产并复用上传链路，落库为 AssetRef。", props: [
    p("model", "绑定值", "expr", "B R"), p("height", "画布高度", "cssLength", "", { defaultValue: "200px" }),
    p("penColor", "笔色", "color", "", { defaultValue: "#1f2937" }), p("backgroundColor", "背景色", "color", "", { defaultValue: "#ffffff" }),
    p("required", "必签", "boolean"), p("clearable", "可重签", "boolean", "", { defaultValue: true })],
    events: [E("change", "变化"), E("clear", "清空")], fb: { forFieldTypes: ["signature"], priority: 100 }, caps: CAP({ formField: true }) }),

  C("x-location", "field", "位置选择", { group: "表单", props: [
    p("model", "绑定值", "expr", "B R"), p("mode", "模式", "enum", "", { enum: ["map", "input", "auto"], defaultValue: "map" }),
    p("provider", "地图服务", "enum", "", { enum: ["amap", "tencent", "baidu"], defaultValue: "amap" }),
    p("detail", "显示详细地址", "boolean", "", { defaultValue: true }), p("readonly", "只读坐标", "expr", "B")],
    events: [E("change", "变化", [{ key: "lng", type: "number" }, { key: "lat", type: "number" }, { key: "address", type: "string" }])],
    fb: { forFieldTypes: ["location"], priority: 100 }, caps: CAP({ formField: true }) }),
);

components.push(
  C("x-text", "display", "文本", { group: "展示", props: [
    p("content", "内容", "expr", "B R"), p("tag", "标签", "string", "", { defaultValue: "span" }), p("size", "字号", "cssLength"),
    p("color", "颜色", "color"), p("ellipsis", "超长省略", "boolean"), p("copyable", "可复制", "boolean"), p("type", "语义类型", "enum", "", { enum: ["default", "primary", "success", "warning", "danger", "info"] })],
    fb: { forFieldTypes: ["formula"], priority: 300, listRenderer: true }, caps: CAP({ listColumn: true }) }),

  C("x-enum-text", "display", "枚举文本", { group: "展示", desc: "按 EnumDef 把值翻译成中文标签；列表与详情共用，避免各页重复维护映射。", props: [
    p("value", "值", "expr", "B R"), p("enumRef", "枚举", "json", "R"), p("fallback", "未匹配文案", "text"),
    p("showColor", "显示颜色", "boolean", "", { defaultValue: true, description: "取 EnumValue.color 渲染为标签底色" })],
    caps: CAP({ listColumn: true }) }),

  C("x-status-tag", "display", "状态标签", { group: "展示", props: [
    p("value", "状态值", "expr", "B R"), p("enumRef", "枚举", "json", "R"), p("size", "尺寸", "enum", "", { enum: ["small", "default", "large"] }),
    p("effect", "主题", "enum", "", { enum: ["light", "dark", "plain"], defaultValue: "light" }), p("showDot", "显示圆点", "boolean")],
    actions: [{ name: "mapNext", label: "列出可用流转", kind: "ui", returns: "EnumValue[]", description: "供审批按钮动态渲染，避免页面硬编码状态机" }],
    caps: CAP({ listColumn: true }) })
);

components.push(
  C("x-btn", "action", "按钮", { group: "操作", props: [
    p("text", "文案", "text", "B R"), p("type", "类型", "enum", "", { enum: ["primary", "success", "warning", "danger", "info", "default", "text"], defaultValue: "default" }),
    p("plain", "朴素", "boolean"), p("round", "圆角", "boolean"), p("size", "尺寸", "enum", "", { enum: ["small", "default", "large"] }),
    p("icon", "图标", "icon"), p("disabled", "禁用", "expr", "B"), p("loading", "加载中", "expr", "B"),
    p("visible", "可见", "expr", "B"), p("confirm", "二次确认文案", "expr", "B"), p("permission", "权限表达式", "expr", "B"),
    p("badge", "角标", "expr", "B")],
    events: [E("click", "点击")], caps: CAP({}) }),

  C("x-row-actions", "action", "行内操作", { group: "操作", desc: "表格操作列。每个按钮的 visible 用表达式表达（如 $row.status == 'draft'），状态机只写一遍。", props: [
    p("actions", "按钮清单", "buttonList", "R"), p("maxVisible", "最多显示个数", "integer", "", { defaultValue: 3 }),
    p("size", "尺寸", "enum", "", { enum: ["small", "default"], defaultValue: "small" }), p("layout", "排布", "enum", "", { enum: ["inline", "dropdown"], defaultValue: "inline" })],
    events: [E("command", "命令", [{ key: "key", type: "string" }, { key: "row", type: "object" }])],
    caps: CAP({ listColumn: true }) })
);

components.push(
  C("x-dept-picker", "advanced", "组织选择器", { group: "业务组件", desc: "选择组织架构节点。组织树是平台级能力（模块 A），业务侧只声明选择范围。", props: [
    p("model", "绑定值", "expr", "B R"), p("multiple", "多选", "boolean"), p("mode", "选择对象", "enum", "", { enum: ["dept", "user", "deptAndUser"], defaultValue: "dept" }),
    p("scope", "数据范围", "enum", "", { enum: ["all", "dept", "deptAndChildren", "self"], defaultValue: "deptAndChildren" }),
    p("rootId", "根节点", "string"), p("checkStrictly", "父子不联动", "boolean"), p("placeholder", "占位提示", "text"), p("returnFields", "返回字段", "json", "A")],
    events: [E("change", "变化", [{ key: "value", type: "any" }, { key: "nodes", type: "array" }])], caps: CAP({ formField: true }) }),

  C("x-employee-picker", "advanced", "人员选择器", { group: "业务组件", props: [
    p("model", "绑定值", "expr", "B R"), p("multiple", "多选", "boolean"), p("deptId", "限定部门", "expr", "B"),
    p("valueKey", "值字段", "string", "", { defaultValue: "id" }), p("labelKey", "显示字段", "string", "", { defaultValue: "name" }),
    p("avatarKey", "头像字段", "string"), p("searchable", "可搜索", "boolean", "", { defaultValue: true }), p("remoteActionRef", "远程搜索动作", "actionRef", "A")],
    events: [E("change", "变化")], caps: CAP({ formField: true }) }),

  C("x-attachment-list", "advanced", "附件列表", { group: "业务组件", desc: "只读展示 attachment 实体中的数据，与 x-upload 共用一份登记契约。", props: [
    p("bizType", "业务类型", "string", "R"), p("bizId", "业务主键", "expr", "B"), p("dataSourceId", "数据源", "dataSourceRef", "B"),
    p("readonly", "只读", "boolean", "", { defaultValue: true }), p("allowDownload", "允许下载", "boolean", "", { defaultValue: true }),
    p("previewInline", "内联预览", "boolean", "", { defaultValue: true }), p("groupByKind", "按类型分组", "boolean", "", { defaultValue: true }),
    p("showUploader", "显示上传人", "boolean", "", { defaultValue: true })],
    data: { role: "detail", modelShape: "array" }, caps: CAP({ supportsDataSource: true }) }),

  C("x-approval-timeline", "advanced", "审批流转记录", { group: "业务组件", desc: "数据来自 Flowable 历史（HistoricActivityInstance + 意见表），只读。", props: [
    p("processInstanceId", "流程实例", "expr", "B R"), p("flowRef", "流程", "json", "R"), p("showComment", "显示审批意见", "boolean", "", { defaultValue: true }),
    p("showAssignee", "显示办理人", "boolean", "", { defaultValue: true }), p("order", "排序", "enum", "", { enum: ["asc", "desc"], defaultValue: "asc" }),
    p("height", "高度", "cssLength"), p("showBusinessKey", "显示业务单号", "boolean")],
    actions: [{ name: "refresh", label: "刷新", kind: "flow" }],
    data: { role: "detail", modelShape: "array", refreshable: true }, caps: CAP({}) }),

  C("x-approval-actions", "advanced", "审批操作区", { group: "业务组件",
    desc: "审批办理的核心交互。outcomes 映射为 CompleteTaskStep 的 outcome，前端不自行拼接流程 API。二次确认、意见必填、驳回原因模板都由这里声明。",
    props: [
      p("taskId", "任务 ID", "expr", "B R"), p("flowRef", "流程", "json", "R"),
      p("outcomes", "可用结论", "buttonList", "R", { defaultValue: ["approve", "reject"] }),
      p("commentRequired", "意见必填", "expr", "B"), p("commentPlaceholder", "意见占位", "text"),
      p("allowTransfer", "允许转办", "boolean"), p("allowAddSign", "允许加签", "boolean"), p("allowReturn", "允许退回", "boolean", "", { defaultValue: true }),
      p("reasonTemplates", "常用意见", "optionList"), p("showAssignee", "显示当前办理人", "boolean", "", { defaultValue: true })],
    events: [E("submit", "提交结论", [{ key: "outcome", type: "string" }, { key: "comment", type: "string" }, { key: "nextAssignee", type: "object" }]),
      E("transfer", "转办"), E("return", "退回")],
    actions: [{ name: "complete", label: "提交结论", kind: "flow", params: { outcome: "approve", comment: "", variables: {} } },
      { name: "claim", label: "认领", kind: "flow" }, { name: "transfer", label: "转办", kind: "flow", params: { toUserId: "" } }],
    data: { role: "form", modelShape: "object", emits: ["submit"] }, caps: CAP({}) }),

  C("x-process-form", "advanced", "流程表单（按任务渲染）", { group: "业务组件",
    desc: "按当前任务的 taskDefinitionKey 匹配 Flow.taskForms，用 editable/required/readonly 字段集渲染业务表单，保证「同一张单据在不同节点看到不同可编辑范围」。",
    props: [
      p("flowRef", "流程", "json", "R"), p("taskKey", "任务节点", "string", "A", { description: "缺省时按当前任务的 taskDefinitionKey 自动匹配 Flow.taskForms" }),
      p("entityRef", "实体", "entityRef", "R"), p("model", "数据模型", "expr", "B R"), p("readonly", "只读", "expr", "B"),
      p("labelWidth", "标签宽度", "cssLength"), p("columnsPerRow", "每行字段数", "integer")],
    slots: [S("default", "补充表单项")], caps: CAP({ supportsBinding: true }) }),

  C("x-task-list", "advanced", "待办/已办列表", { group: "业务组件", props: [
    p("flowRef", "流程", "json"), p("kind", "列表类型", "enum", "R", { enum: ["todo", "done", "initiated", "history"], defaultValue: "todo" }),
    p("processKey", "流程标识", "string"), p("columnList", "列定义", "columnList"),
    p("showProcessName", "显示流程名", "boolean", "", { defaultValue: true }), p("showTaskNode", "显示当前节点", "boolean", "", { defaultValue: true }),
    p("showArrivalTime", "显示到达时间", "boolean", "", { defaultValue: true }), p("pageSize", "每页条数", "integer", "", { defaultValue: 10 })],
    events: [E("open", "打开", [{ key: "task", type: "object" }]), E("selectionChange", "选择变化", [{ key: "tasks", type: "array" }])],
    actions: [{ name: "refresh", label: "刷新", kind: "list" }, { name: "batchComplete", label: "批量办理", kind: "flow", params: { taskIds: [], outcome: "approve" } }],
    data: { role: "table", modelShape: "array", refreshable: true, pagination: true }, caps: CAP({ listColumn: true, supportsDataSource: true }) })
);

const registry = {
  $schema: "../schema/component.schema.json",
  protocolVersion: "0.1",
  registryVersion: 1,
  title: "LCP 内置组件注册表 v0.1",
  description: "平台内置组件的唯一权威契约。设计器（可用组件清单/属性面板）、运行时（渲染器解析 component 名）、出码引擎（生成 import 与标签）、AI 生成校验器（可用组件与属性合法性）全部读这一份。app 级自定义组件通过 AppBundle.artifacts.components 追加，沙箱组件用 runtime=sandbox 标记。",
  fieldBindingRule: "控件解析优先级：① UINode.props.fieldList[].widget ② DataSchema Field.uiHints.widget ③ Field.itemType 命中组件的 fieldBindings ④ Field.type 命中 fieldBindings（priority 值小者优先）。第③步让 array<image> 自动落到 x-upload 而无需逐字段手写 widget。",
  components
};
fs.mkdirSync("outputs/schema-protocol-v0.1/registry", { recursive: true });
fs.writeFileSync("outputs/schema-protocol-v0.1/registry/builtin-components.json", JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log("components:", registry.components.length, "ids unique:", new Set(registry.components.map(c => c.id)).size === registry.components.length);
