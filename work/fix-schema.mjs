import fs from "node:fs";
const DIR = "outputs/schema-protocol-v0.1";
const S = DIR + "/schema", R = DIR + "/registry";
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const save = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n", "utf8");
const log = [];
const C = load(S + "/common.schema.json");
const D = load(S + "/data.schema.json");
const L = load(S + "/logic.schema.json");
const U = load(S + "/ui.schema.json");
const M = load(S + "/component.schema.json");
const B = load(S + "/bundle.schema.json");

// ---------- common：新增 Ident / HttpToken ----------
C.$defs.Key.description = "snake_case 元数据键。用于实体/字段/动作/页面/角色/枚举等「元数据标识」，同父作用域内唯一，可直接用作 SQL 列名。注意：参数名、局部变量名、HTTP 头名等「编程标识」不要用 Key，见 Ident / HttpToken。";
C.$defs.Ident = {
  type: "string",
  pattern: "^[A-Za-z_][A-Za-z0-9_]{0,62}$",
  description: "编程标识符：动作/API 入参名、页面参数名、代码步骤的输入输出变量名、按钮键。允许 camelCase，因为它要直接落到 TS 变量名与 JS 对象属性名上，不能带连字符。"
};
C.$defs.HttpToken = {
  type: "string",
  pattern: "^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$",
  description: "RFC 7230 的 HTTP 头字段名（token 语法）。含连字符，因此既不是 Key 也不是 Ident。"
};
log.push("common: 新增 $defs.Ident / $defs.HttpToken，Key.description 明确边界");

// ---------- common：Expr 取值根补 $res ----------
const refPat = C.$defs.Expr.oneOf.find((b) => b.title === "Reference").properties.$ref;
refPat.pattern = "^\\$(user|tenant|env|now|page|route|form|row|rows|data|process|ctx|component|res)(\\.[A-Za-z0-9_\\[\\]$-]+)*$";
log.push("common: Expr.$ref 取值根补上 $res（与 expression-registry.valueRoots 对齐）");

// ---------- common：aiHint.generate 补 detail ----------
C.$defs.Semantic.properties.aiHint.properties.generate.enum.push("detail");
log.push("common: Semantic.aiHint.generate 补 detail（AI 生成详情页）");

// ---------- logic：标识符类 key 改用 Ident ----------
const ident = { $ref: "#/$defs/Ident" };
L.$defs.ActionParam.properties.key = ident;
L.$defs.ApiParam.properties.key = ident;
L.$defs.CodeStep.properties.inputs.items.properties.key = ident;
L.$defs.CodeStep.properties.outputs.items.properties.key = ident;
L.$defs.TaskForm.properties.buttons.items.properties.key = ident;
log.push("logic: ActionParam / ApiParam / CodeStep.inputs|outputs / TaskForm.buttons 的 key 改用 Ident");

// ---------- logic：HTTP 头独立建模 ----------
L.$defs.HttpHeader = {
  type: "object",
  description: "外部请求头。名字是 HTTP token（可含连字符），值支持表达式以便注入 token。",
  properties: {
    name: { $ref: "#/$defs/HttpToken" },
    type: { enum: ["string", "integer", "boolean", "json"] },
    value: { $ref: "#/$defs/Expr" },
    required: { type: "boolean", default: false },
    defaultValue: { $ref: "#/$defs/Value" },
    description: { type: "string" },
    semantic: { $ref: "#/$defs/Semantic" }
  },
  required: ["name"],
  additionalProperties: false
};
L.$defs.ApiRequest.properties.headers.items = { $ref: "#/$defs/HttpHeader" };
log.push("logic: 新增 HttpHeader，ApiRequest.headers 改用它（原 ApiParam.key 装不下 Accept 这类头名）");

// ---------- logic：AssignStep.target 是「写」相对路径 ----------
L.$defs.AssignStep.properties.target = {
  type: "string",
  pattern: "^(state|form|row|rows|vars)(\\.[A-Za-z0-9_\\[\\]-]+)+$",
  description: "写入目标，相对路径。state/form/row/rows/vars 五类前缀，与表达式读取侧的 $page.state / $form / $row / $ctx.vars 一一对应。"
};
log.push("logic: AssignStep.target 改为写侧相对路径（原来错用了读侧 $ 前缀的 pattern）");

// ---------- logic：EmitStep.event 允许命名空间 ----------
L.$defs.EmitStep.properties.event = {
  type: "string",
  pattern: "^[a-z][a-z0-9_]*(?:[.:][A-Za-z0-9_]+)+$",
  description: "事件名。业务事件用点分层（leave.approved），平台事件用冒号分层（ds:<dataSourceId>:refresh、page:<pageKey>:<action>）。"
};
log.push("logic: EmitStep.event 允许 . 与 : 两种分层（ds:xxx:refresh）");

// ---------- logic：Flow 变量补 defaultValue ----------
L.$defs.VariableMapping.properties.defaultValue = { $ref: "#/$defs/Value" };
log.push("logic: VariableMapping 补 defaultValue");

// ---------- logic：SLA 语义对齐 ----------
L.$defs.Flow.properties.sla = {
  type: "object",
  description: "流程时限与超时策略。到时只产生事件/通知，不改业务数据。",
  properties: {
    dueDateHours: { type: "number", description: "承诺办结时长（小时），从流程开始计" },
    warningHours: { type: "number", description: "剩余多少小时开始预警" },
    escalateAfterHours: { type: "number", description: "超期多少小时后升级" },
    escalateTo: { $ref: "#/$defs/AssigneeSpec" },
    onTimeout: { enum: ["notify", "autoApprove", "autoReject", "escalate"], default: "notify" },
    semantic: { $ref: "#/$defs/Semantic" }
  },
  additionalProperties: false
};
log.push("logic: Flow.sla 对齐为 dueDateHours / warningHours / escalateAfterHours / escalateTo / onTimeout");

// ---------- logic：TaskForm 办理意见落到流程变量 ----------
L.$defs.TaskForm.properties.commentField = {
  type: "string",
  pattern: "^[a-z][a-zA-Z0-9]{1,62}$",
  description: "办理意见（同意/驳回理由）写入的流程变量名，必须出现在 Flow.variables[].name 中。办理意见不是实体字段，所以不放进 editableFields/requiredFields。"
};
log.push("logic: TaskForm 补 commentField（办理意见走流程变量，不进实体字段表）");

// ---------- ui：路由 path 允许可选段与正则组 ----------
U.$defs.RouteSpec.properties.path.pattern = "^/[A-Za-z0-9_\\-/:*?()]*$";
U.$defs.RouteSpec.properties.path.description = "支持 :id 动态段、:id? 可选段、(*) 正则组等 vue-router 语法";
U.$defs.PageParam.properties.key = { $ref: "https://lcp.dev/schema/0.1/common.schema.json#/$defs/Key" };
U.$defs.PageParam.properties.key = { $ref: "https://lcp.dev/schema/0.1/common.schema.json#/$defs/Ident" };
U.$defs.DataSourceParam.properties.key = { $ref: "https://lcp.dev/schema/0.1/common.schema.json#/$defs/Ident" };
log.push("ui: RouteSpec.path 允许 ? 与 ()；PageParam.key / DataSourceParam.key 改用 Ident");

// ---------- bundle：授权动作补审批语义 ----------
const actEnum = B.$defs.PermissionGrant.properties.actions.items.enum;
for (const a of ["reject", "transfer"]) if (!actEnum.includes(a)) actEnum.push(a);
B.$defs.PermissionGrant.properties.actions.description = "允许的操作。前 9 项是数据操作，approve/reject/transfer 是流程办理动作（与 TaskForm.buttons[].outcome 同源），execute 是动作编排的执行权。";
log.push("bundle: PermissionGrant.actions 补 reject / transfer");

// ---------- bundle：发行元数据补齐 ----------
B.$defs.InstallParam = {
  type: "object",
  description: "应用安装时需要使用者填写的参数（如组织架构来源、审批阈值）。",
  properties: {
    key: { $ref: "#/$defs/Key" },
    label: { $ref: "#/$defs/Text" },
    type: { enum: ["string", "integer", "decimal", "boolean", "date", "select", "json"] },
    required: { type: "boolean", default: false },
    options: { type: "array", items: {} },
    defaultValue: { $ref: "#/$defs/Value" },
    semantic: { $ref: "#/$defs/Semantic" }
  },
  required: ["key", "label", "type"],
  additionalProperties: false
};
const mk = B.$defs.BundleMeta.properties.marketplace;
Object.assign(mk.properties, {
  publishable: { type: "boolean", default: false, description: "是否允许发布到模板市场" },
  category: { type: "string", description: "市场分类，如 education/hr" },
  previewImage: { $ref: "https://lcp.dev/schema/0.1/common.schema.json#/$defs/AssetRef" },
  installParams: { type: "array", items: { $ref: "#/$defs/InstallParam" } },
  semantic: { $ref: "#/$defs/Semantic" }
});
const ai = B.$defs.BundleMeta.properties.ai;
Object.assign(ai.properties, {
  generator: { type: "string", description: "生成该应用的 AI 服务标识，如 lcp-ai/0.1.0；人工手写填 human" },
  capabilities: { type: "array", items: { type: "string" }, description: "本应用中用到/开放的 AI 生成能力，如 form-from-text" },
  note: { type: "string" },
  semantic: { $ref: "#/$defs/Semantic" }
});
log.push("bundle: marketplace 补 publishable/category/previewImage/installParams(+InstallParam)，ai 补 generator/capabilities/note");

// ---------- 语义字段贯穿：所有可寻址对象 def 都补 semantic ----------
const EXEMPT = new Set(["Semantic", "Checksum", "ArtifactRef"]);
const sweep = (doc, file) => {
  let n = 0;
  for (const [name, def] of Object.entries(doc.$defs || {})) {
    if (EXEMPT.has(name)) continue;
    if (def.type !== "object" || !def.properties || def.additionalProperties !== false) continue;
    if (def.properties.semantic) continue;
    def.properties.semantic = { $ref: "#/$defs/Semantic" };
    n += 1;
  }
  if (n) log.push(file + ": " + n + " 个 def 补 semantic");
};
for (const [doc, f] of [[D, "data"], [L, "logic"], [U, "ui"], [M, "component"], [B, "bundle"], [C, "common"]]) sweep(doc, f);

save(S + "/common.schema.json", C);
save(S + "/data.schema.json", D);
save(S + "/logic.schema.json", L);
save(S + "/ui.schema.json", U);
save(S + "/component.schema.json", M);
save(S + "/bundle.schema.json", B);

// ---------- registry：type-mapping 协议版本对齐 ----------
const T = load(R + "/type-mapping.json");
if (T.protocolVersion !== "0.1") { T.protocolVersion = "0.1"; log.push("registry/type-mapping.json: protocolVersion 0.1.0 -> 0.1"); }
save(R + "/type-mapping.json", T);

// ---------- registry：x-search-form 的 right 插槽显式声明白名单 ----------
const RC = load(R + "/builtin-components.json");
const sform = RC.components.find((c) => c.name === "x-search-form");
const rslot = sform.slots.find((s) => s.name === "right");
rslot.accepts = ["x-btn"];
rslot.label = { default: "操作按钮区" };
rslot.semantic = { intent: "放置查询/重置等操作按钮。字段本体走默认插槽，按钮走这里，避免 acceptChildren 既要管字段又要管按钮。" };
log.push("registry: x-search-form.slots.right 声明 accepts=[x-btn]");
save(R + "/builtin-components.json", RC);

// ==========================================================================
// 修复段 2：跨文档 $ref 断链、Ident/Value 门控、资产逻辑寻址、权限动作对齐
// 全部幂等：直接写成最终期望态，重复执行不累积。
// ==========================================================================
// ---------- 跨文档 $ref 断链：本文件写了 #/$defs/X，但 X 只定义在 common 里 ----------
// ui/data 用了 #/$defs/Semantic，logic 用了 #/$defs/Ident|HttpToken，bundle 用了 #/$defs/Value，
// 相对路径会被解析到「本文件」，于是整条 $ref 断链（实测 100+ 条 L1 错误）。
// 修法是补一个指向 common 的纯别名：既不产生第二份定义，又保留 #/$defs/X 的书写习惯。
{
  const cm = load(S + "/common.schema.json");
  const fixed = [];
  for (const f of ["data", "ui", "logic", "component", "bundle"]) {
    const doc = load(`${S}/${f}.schema.json`);
    const text = fs.readFileSync(`${S}/${f}.schema.json`, "utf8");
    const refs = new Set([...text.matchAll(/"#\/\$defs\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    const added = [];
    for (const r of refs) {
      if (doc.$defs[r] || !cm.$defs[r]) continue;
      doc.$defs[r] = { $ref: `https://lcp.dev/schema/0.1/common.schema.json#/$defs/${r}` };
      added.push(r);
    }
    if (added.length) { save(`${S}/${f}.schema.json`, doc); fixed.push(`${f}:[${added.join(",")}]`); }
  }
  if (fixed.length) log.push("跨文档 $ref 断链修复 —— 补 common 基元别名 " + fixed.join(" "));
}

// ---------- common：资产必须有 bundle 内的稳定逻辑 key ----------
// ArtifactRef{kind:"asset"} 用 key 寻址（与 entity/action/flow/page 全部靠 key 寻址一致），
// assetId 只是存储身份。没有 key 时「引用一个资产」根本无法表达。
{
  const doc = load(S + "/common.schema.json");
  const a = doc.$defs.AssetRef;
  a.properties = {
    assetId: a.properties.assetId,
    key: { $ref: "#/$defs/Key", description: "资产在 bundle 内的逻辑键（如 tpl_batch_recall）。跨工件引用一律用 key，assetId 只用于存储寻址。" },
    ...Object.fromEntries(Object.entries(a.properties).filter(([k]) => k !== "assetId"))
  };
  a.required = ["assetId", "key", "kind", "version"];
  save(S + "/common.schema.json", doc);
  log.push("common: AssetRef 增加必填 key（资产的 bundle 内逻辑寻址键）");
}

// ---------- logic：出错字段、校验提示、打印变量绑定 ----------
{
  const doc = load(S + "/logic.schema.json");
  const fieldsDesc = "关联字段列表。既可能是实体字段（snake_case），也可能是动作/页面参数（camelCase），前端按同名表单项标红，故用 Ident 而不是 Key。";
  doc.$defs.FailStep.properties.fields.items = { $ref: "#/$defs/Ident" };
  doc.$defs.FailStep.properties.fields.description = fieldsDesc;
  doc.$defs.ValidateStep.properties.fields.items = { $ref: "#/$defs/Ident" };
  doc.$defs.ValidateStep.properties.fields.description = fieldsDesc;
  doc.$defs.ValidateStep.properties.message = {
    $ref: "#/$defs/Expr",
    description: "校验失败提示。运行时文案统一走表达式（$lit 纯文案 / $tpl 拼接 / $if 分支），静态标签才用 Text。与 FailStep.message 同一套规则。"
  };
  doc.$defs.PrintStep.properties.data = {
    description: "模板变量绑定。可整体用一个表达式算出对象，也可写「变量名 -> 表达式」映射。两个分支靠键名不重叠而互斥：表达式头键是 $ 开头，映射键必须匹配标识符。",
    oneOf: [
      { $ref: "#/$defs/Expr" },
      { type: "object", patternProperties: { "^[A-Za-z_][A-Za-z0-9_]*$": { $ref: "#/$defs/Expr" } }, additionalProperties: false }
    ]
  };
  save(S + "/logic.schema.json", doc);
  log.push("logic: FailStep/ValidateStep.fields -> Ident；ValidateStep.message -> Expr；PrintStep.data 支持变量映射");
}

// ---------- bundle：PermissionGrant.actions 与按钮 outcome 同源 ----------
{
  const doc = load(S + "/bundle.schema.json");
  const acts = doc.$defs.PermissionGrant.properties.actions;
  acts.items.enum = ["create", "read", "update", "delete", "list", "export", "import", "approve", "reject", "return", "transfer", "addSign", "execute", "*"];
  acts.description = "允许的操作。数据操作（create/read/update/delete/list/export/import）+ 流程办理动作（approve/reject/return/transfer/addSign，与 TaskForm.buttons[].outcome 同一套取值）+ 动作编排的 execute 权 + 通配 *。";
  save(S + "/bundle.schema.json", doc);
  log.push("bundle: PermissionGrant.actions 补齐 return / addSign，与 TaskForm.buttons[].outcome 对齐");
}

// ---------- registry：给每个 prop / itemProp 显式补 bindable ----------
// bindable 决定属性面板是否出现「绑定表达式」开关，也是校验器判断「这个位置能不能写表达式」的唯一依据。
// 值类属性默认允许绑定，引用/结构类属性默认只收字面量（否则设计器会给出无意义的绑定入口）。
{
  const RC = load(R + "/builtin-components.json");
  const BINDABLE = new Set(["expr", "text", "string", "number", "integer", "boolean", "json", "enum", "color", "icon", "cssLength", "url", "dateFormat", "style"]);
  let n = 0;
  const fill = (p) => { if (p.bindable === undefined) { p.bindable = BINDABLE.has(p.type); n += 1; } };
  for (const c of RC.components) {
    for (const p of c.props || []) { fill(p); for (const ip of p.itemProps || []) fill(ip); }
  }
  save(R + "/builtin-components.json", RC);
  log.push("registry: " + n + " 个 prop/itemProp 显式补 bindable");
}

// ---------- bundle：PublishTarget 补 semantic ----------
// 多端发布同样需要语义描述：AI 生成发布配置、市场中提示「本应用可发布的端」都依赖它。
// 该节点是 PublishConfig.targets.items 的内联对象（不是 $defs），因此单独补。
{
  const doc = load(S + "/bundle.schema.json");
  const items = doc.$defs.PublishConfig.properties.targets.items;
  if (!items.properties.semantic) {
    items.properties.semantic = { $ref: "#/$defs/Semantic" };
    save(S + "/bundle.schema.json", doc);
    log.push("bundle: PublishTarget 补 semantic（语义层贯穿到发布配置）");
  }
}

// ---------- common：新增 JsonPath，并把响应取值路径从裸 string 收紧 ----------
// 本协议对「表达式位置出现裸字符串」是零容忍的，因为字符串既可能是字面量也可能是路径（歧义）。
// 但 Api 的响应提取天然需要表达「响应体里的哪个位置」——它与 $ref（会话/上下文取值根）不同源，
// 是相对响应体的 JSONPath。因此单独立一个受约束的类型，而不是放开 Expr 接受任意字符串。
{
  const Common = load(S + "/common.schema.json");
  Common.$defs.JsonPath = {
    type: "string",
    pattern: "^\\$(\\.[A-Za-z0-9_-]+|\\[[0-9]+\\])*$",
    description: "相对 JSONPath：以 $ 开头，如 $.data、$.data.rows、$.data[0].id。用于声明式取值路径（行集 / 总数 / 错误信息 / 出参映射）。它不是 Expr：不参与运算，只做定位，因此不允许写函数或取值根。"
  };
  save(S + "/common.schema.json", Common);

  const Logic = load(S + "/logic.schema.json");
  Logic.$defs.JsonPath = { $ref: "https://lcp.dev/schema/0.1/common.schema.json#/$defs/JsonPath" };
  const RP = Logic.$defs.ApiResponse.properties;
  RP.mapping = {
    type: "object",
    additionalProperties: { oneOf: [{ $ref: "#/$defs/JsonPath" }, { $ref: "#/$defs/Expr" }] },
    description: "出参映射：目标字段 -> 响应体内的 JSONPath（如 $.data.id）或表达式。JSONPath 用于直取，表达式用于改名/拼接/兜底。"
  };
  RP.rowsPath = { $ref: "#/$defs/JsonPath", description: "列表数据的路径，如 $.data.rows" };
  RP.totalPath = { $ref: "#/$defs/JsonPath", description: "总数所在的路径，如 $.data.total" };
  RP.errorPath = { $ref: "#/$defs/JsonPath", description: "错误码/错误标记所在的路径" };
  RP.errorMessagePath = { $ref: "#/$defs/JsonPath", description: "错误文案所在的路径，用于直接提示用户" };
  save(S + "/logic.schema.json", Logic);
  log.push("common/logic: 新增 JsonPath，ApiResponse.rowsPath/totalPath/errorPath/errorMessagePath 由裸 string 收紧为 JsonPath，mapping 允许 JsonPath | Expr");
}

console.log(log.join("\n"));
