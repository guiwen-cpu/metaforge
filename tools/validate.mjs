#!/usr/bin/env node
/**
 * LCP Schema Protocol 校验器（零依赖，Node >= 18）
 *
 *   node tools/validate.mjs [bundle.json ...]
 *
 * 不传参数时校验 examples/ 下所有 *.bundle.json。
 *
 * 四层校验流水线：
 *   L1 结构   —— 用自带的极简 JSON Schema 校验器校验 Bundle 与各子 Schema
 *   L2 语义   —— 引用可解析、组件存在、字段存在、事件已声明、状态已声明、枚举可解析
 *   L3 映射   —— FieldType 四向映射表完整性、column 字段类型族兼容、taskKey 与 BPMN 对齐、
 *                表达式函数/取值根/查询算子必须在注册表内
 *   L4 策略   —— 沙箱越界、嵌套事务、破坏性 DDL、外部依赖缺超时、非幂等写接口
 *
 * 退出码：0 = 无 error（warn 不算失败），1 = 存在 error，2 = 运行期异常。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIR = {
  schema: path.join(ROOT, "schema"),
  registry: path.join(ROOT, "registry"),
  examples: path.join(ROOT, "examples")
};

const SCHEMA_FILES = ["common", "data", "ui", "logic", "component", "bundle"];

// ============================================================ 诊断收集
const SINK = [];
const report = (level, check, where, message) => SINK.push({ level, check, where, message });

/** 把 fn 执行期间新增的诊断统一加上 where 前缀（用于把文件标签贴到 bundle 内部的指针上） */
const scoped = (prefix, fn) => {
  const mark = SINK.length;
  fn();
  for (let i = mark; i < SINK.length; i += 1) SINK[i].where = prefix(SINK[i].where);
};

// ============================================================ 载入 schema 文档
const DOCS = new Map();
for (const f of SCHEMA_FILES) {
  const file = path.join(DIR.schema, `${f}.schema.json`);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!doc.$id) { console.error(`schema/${f}.schema.json 缺少 $id`); process.exit(2); }
  DOCS.set(doc.$id, doc);
}
const REG_EXPR = JSON.parse(fs.readFileSync(path.join(DIR.schema, "expression-registry.json"), "utf8"));
const REG_COMP = JSON.parse(fs.readFileSync(path.join(DIR.registry, "builtin-components.json"), "utf8"));
const REG_TYPES = JSON.parse(fs.readFileSync(path.join(DIR.registry, "type-mapping.json"), "utf8"));

// 代码钩子做语法级校验：有 platform/node_modules/typescript 就启用，CI 精简环境自动跳过。
let TS = null;
try {
  TS = createRequire(path.join(ROOT, "platform", "package.json"))("typescript");
} catch {
  TS = null;
}

// ============================================================ 极简 JSON Schema 校验器
function lookupRef(ref, baseId) {
  const hash = ref.indexOf("#");
  const url = hash === -1 ? ref : ref.slice(0, hash);
  const frag = hash === -1 ? "" : ref.slice(hash + 1);
  const targetId = url || baseId;
  const doc = DOCS.get(targetId);
  if (!doc) throw new Error(`未知的 schema 文档 ${targetId}（来自 $ref: ${ref}）`);
  let node = doc;
  for (const raw of frag.replace(/^\//, "").split("/").filter(Boolean)) {
    const seg = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (node == null || typeof node !== "object" || !(seg in node)) throw new Error(`无法解析 $ref: ${ref}`);
    node = node[seg];
  }
  return node;
}

const jstype = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const isType = (v, t) => {
  switch (t) {
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number": return typeof v === "number";
    case "string": return typeof v === "string";
    case "boolean": return typeof v === "boolean";
    case "null": return v === null;
    default: return true;
  }
};

const EQ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SKIP_KEYS = new Set(["description", "title", "default", "deprecated", "examples", "example", "$comment", "$schema", "$id", "$defs", "definitions"]);

function probe(inst, schema, baseId, ptr) {
  const mark = SINK.length;
  validate(inst, schema, baseId, ptr);
  const fresh = SINK.splice(mark);
  return !fresh.some((d) => d.level === "error");
}

function validate(inst, schema, baseId, ptr) {
  if (schema === true || schema == null) return;
  if (schema === false) { report("error", "L1", ptr, "schema 为 false，不允许出现该键"); return; }

  if (schema.$ref) {
    let target;
    try { target = lookupRef(schema.$ref, baseId); }
    catch (e) { report("error", "L1", ptr, e.message); return; }
    const url = schema.$ref.split("#")[0];
    validate(inst, target, url || baseId, ptr);
    const rest = Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "$ref" && !SKIP_KEYS.has(k)));
    if (Object.keys(rest).length) validate(inst, rest, baseId, ptr);
    return;
  }

  if (schema.const !== undefined && !EQ(inst, schema.const)) {
    report("error", "L1", ptr, `期望常量 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(inst)}`);
    return;
  }
  if (schema.enum && !schema.enum.some((v) => EQ(v, inst))) {
    report("error", "L1", ptr, `取值 ${JSON.stringify(inst)} 不在枚举 ${JSON.stringify(schema.enum)} 内`);
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(inst, t))) {
      report("error", "L1", ptr, `期望类型 ${types.join(" | ")}，实际 ${jstype(inst)}`);
      return;
    }
  }

  if (schema.allOf) for (const sub of schema.allOf) validate(inst, sub, baseId, ptr);
  if (schema.anyOf && !schema.anyOf.some((sub) => probe(inst, sub, baseId, ptr))) {
    report("error", "L1", ptr, `未命中 anyOf 任何分支（${schema.anyOf.length} 个候选）`);
  }
  if (schema.oneOf) {
    const hits = schema.oneOf.map((sub, i) => (probe(inst, sub, baseId, ptr) ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) {
      // 全部落空时给出「最接近的分支」及其首个错误，否则调用方只能看到一句无信息量的失败
      let best = null;
      schema.oneOf.forEach((sub, i) => {
        const mark = SINK.length;
        validate(inst, sub, baseId, ptr);
        const errs = SINK.splice(mark).filter((d) => d.level === "error");
        // 取最深的那条（指针最长）——oneOf 的浅层报错通常只是「上面某处也不对」的回声
        const deep = errs.length ? errs.reduce((a, b) => (b.where.length > a.where.length ? b : a)) : null;
        if (!best || errs.length < best.n) best = { i, n: errs.length, at: deep && deep.where, msg: deep && deep.message };
      });
      const hint = best ? `；最接近分支 #${best.i}（${best.n} 处不合）首错 ${best.at} → ${best.msg}` : "";
      report("error", "L1", ptr, `未命中 oneOf 任何分支（${schema.oneOf.length} 个候选）${hint}`);
    } else if (hits.length > 1) {
      report("error", "L1", ptr, `oneOf 歧义：同时命中分支 ${hits.join(", ")}（判别字段缺失或类型不唯一）`);
    }
  }
  if (schema.not && probe(inst, schema.not, baseId, ptr)) report("error", "L1", ptr, "命中了 not 分支");
  if (schema.if) {
    const cond = probe(inst, schema.if, baseId, ptr);
    if (cond && schema.then) validate(inst, schema.then, baseId, ptr);
    if (!cond && schema.else) validate(inst, schema.else, baseId, ptr);
  }

  if (typeof inst === "number") {
    if (schema.minimum !== undefined && inst < schema.minimum) report("error", "L1", ptr, `${inst} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && inst > schema.maximum) report("error", "L1", ptr, `${inst} > maximum ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && inst <= schema.exclusiveMinimum) report("error", "L1", ptr, `${inst} <= exclusiveMinimum ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && inst >= schema.exclusiveMaximum) report("error", "L1", ptr, `${inst} >= exclusiveMaximum ${schema.exclusiveMaximum}`);
  }

  if (typeof inst === "string") {
    if (schema.minLength !== undefined && inst.length < schema.minLength) report("error", "L1", ptr, `长度 ${inst.length} < minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && inst.length > schema.maxLength) report("error", "L1", ptr, `长度 ${inst.length} > maxLength ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(inst)) report("error", "L1", ptr, `"${inst}" 不匹配 pattern ${schema.pattern}`);
  }

  if (Array.isArray(inst)) {
    if (schema.minItems !== undefined && inst.length < schema.minItems) report("error", "L1", ptr, `数组长度 ${inst.length} < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && inst.length > schema.maxItems) report("error", "L1", ptr, `数组长度 ${inst.length} > maxItems ${schema.maxItems}`);
    if (schema.uniqueItems && new Set(inst.map((x) => JSON.stringify(x))).size !== inst.length) report("error", "L1", ptr, "数组元素重复但声明了 uniqueItems");
    if (schema.items) {
      const items = Array.isArray(schema.items) ? schema.items : null;
      inst.forEach((v, i) => validate(v, items ? (items[i] ?? {}) : schema.items, baseId, `${ptr}[${i}]`));
    }
  }

  if (inst !== null && typeof inst === "object" && !Array.isArray(inst)) {
    const props = schema.properties || {};
    const pats = schema.patternProperties || {};
    const patKeys = Object.keys(pats);
    if (schema.required) for (const r of schema.required) {
      if (!(r in inst)) report("error", "L1", ptr, `缺少必填属性 ${r}`);
    }
    if (schema.minProperties !== undefined && Object.keys(inst).length < schema.minProperties) report("error", "L1", ptr, `属性数 < minProperties ${schema.minProperties}`);
    for (const [k, v] of Object.entries(inst)) {
      const child = `${ptr}.${k}`;
      let matched = false;
      if (k in props) { validate(v, props[k], baseId, child); matched = true; }
      for (const p of patKeys) if (new RegExp(p).test(k)) { validate(v, pats[p], baseId, child); matched = true; }
      if (!matched && schema.additionalProperties === false && !k.startsWith("x-")) {
        report("error", "L1", child, `未知属性（additionalProperties=false）。合法键：${Object.keys(props).join(", ") || "（无）"}`);
      } else if (!matched && schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validate(v, schema.additionalProperties, baseId, child);
      }
    }
  }
}

// ============================================================ 注册表派生索引
const OP_NAMES = new Set(REG_EXPR.operators);
const FN = new Map(REG_EXPR.functions.map((f) => [f.name, f]));
const QOP = new Set(REG_EXPR.queryOperators.map((q) => q.op));
const ROOTS = new Map(REG_EXPR.valueRoots.map((r) => [r.name, r]));

const STEP_TYPES = new Map();
{
  const logicDoc = DOCS.get("https://lcp.dev/schema/0.1/logic.schema.json");
  for (const alt of logicDoc.$defs.Step.oneOf) {
    const name = alt.$ref.split("/").pop();
    const v = logicDoc.$defs[name];
    const disc = v.properties && v.properties.type;
    const val = disc && (disc.const ?? (disc.enum && disc.enum[0]));
    if (val) STEP_TYPES.set(val, name);
  }
}
const REF_KINDS = new Set(DOCS.get("https://lcp.dev/schema/0.1/common.schema.json").$defs.ArtifactRef.properties.kind.enum);
const REF_KEYS = new Set(["kind", "id", "key", "version", "snapshotId"]);
const ASSIGN_PREFIX = new Set(["state", "form", "row", "rows", "vars"]);
const PAGE_DS_EVENTS = /^ds:([A-Za-z0-9_]+):(refresh|reset|loadMore)$/;

/** 同一个表达式节点只校验一次：显式检查先跑（标签更精确），兜底全量扫描后跑 */
const CHECKED_EXPR = new WeakSet();

/**
 * 表达式判别。一个对象是表达式，当且仅当它**恰好含一个头键**，且其余键都是该头键允许的修饰键：
 *   $lit 无 / $ref 无 / $fn 带 $args / $tpl 无 / $if 带 $then $else
 * 特别注意：不能用「$ 开头的键恰好一个」来判断 —— {$fn, $args} 有两个 $ 键，却是最普通的函数调用。
 * 本表必须与 common.schema.json 的 Expr.oneOf 完全一致，由 checkRegistry 机器守卫「四处齐改」。
 */
const EXPR_HEADS = { $lit: [], $ref: [], $fn: ["$args"], $tpl: [], $if: ["$then", "$else"] };
function exprHead(node) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return null;
  const keys = Object.keys(node);
  const heads = keys.filter((k) => Object.prototype.hasOwnProperty.call(EXPR_HEADS, k));
  if (heads.length !== 1) return null;
  const head = heads[0];
  return keys.every((k) => k === head || EXPR_HEADS[head].includes(k) || k.startsWith("x-")) ? head : null;
}
const isExpr = (v) => exprHead(v) !== null;
const isRef = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) &&
  REF_KINDS.has(v.kind) && (typeof v.key === "string" || typeof v.id === "string") &&
  Object.keys(v).every((k) => REF_KEYS.has(k) || k.startsWith("x-"));
const isStep = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && typeof v.type === "string" && STEP_TYPES.has(v.type);

/** 通用深度遍历：visit(value, ptr, parent, parentKey) */
function walk(node, visit, ptr = "$", parent = null, parentKey = null, seen = new Set()) {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  visit(node, ptr, parent, parentKey);
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, visit, `${ptr}[${i}]`, node, i, seen));
  } else {
    for (const [k, v] of Object.entries(node)) walk(v, visit, `${ptr}.${k}`, node, k, seen);
  }
}
const childrenOf = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

// ============================================================ 表达式校验（L3）
function checkExpr(node, ptr, label) {
  if (typeof node === "string") {
    // Expr 的五个分支（$lit/$ref/$fn/$tpl/$if）没有任何一个接受裸字符串。
    // 把 "$row.x == $user.id" 这类条件直接写成字符串，等于偷偷引入第二套解释器，必须挡住。
    report("error", "L3", ptr, `${label}: 表达式必须是 JSON 表达式树（$lit/$ref/$fn/$tpl/$if），收到裸字符串 ${JSON.stringify(node.slice(0, 60))}`);
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (CHECKED_EXPR.has(node)) return;
  CHECKED_EXPR.add(node);
  if (Array.isArray(node)) { node.forEach((v, i) => checkExpr(v, `${ptr}[${i}]`, label)); return; }

  // 按头键分派，判别规则与 isExpr 完全一致。绝不能用「$ 开头的键恰好一个」来判断：
  // {$fn, $args} 有两个 $ 键却是最普通的函数调用；一旦落进兜底递归，$args 会被当成普通属性，
  // 字面量对象的每个字符串值都会被误报成「裸字符串」。
  const op = exprHead(node);
  if (op !== null) {
    const body = node[op];
    if (op === "$lit") return;
    if (op === "$ref") {
      if (typeof body !== "string") { report("error", "L3", ptr, `${label}: $ref 必须是字符串路径`); return; }
      const seg = body.replace(/^\$/, "").split(".");
      const root = "$" + seg[0];
      const info = ROOTS.get(root);
      if (!info) { report("error", "L3", ptr, `${label}: $ref 使用了未注册的取值根 ${root}（注册表 valueRoots 内不存在）`); return; }
      if (info.fields && seg.length > 1 && !(seg[1] in info.fields)) {
        report("warn", "L3", ptr, `${label}: $ref ${body} 的字段 ${seg[1]} 不在 ${root} 的约定字段内（合法字段：${Object.keys(info.fields).join(", ")}）`);
      }
      return;
    }
    if (op === "$fn") {
      if (typeof body !== "string") { report("error", "L3", ptr, `${label}: $fn 必须是函数名字符串`); return; }
      const f = FN.get(body);
      if (!f) { report("error", "L3", ptr, `${label}: $fn "${body}" 不在 expression-registry.functions 内`); return; }
      const args = node.$args ?? [];
      if (!Array.isArray(args)) { report("error", "L3", ptr, `${label}: $fn ${body} 的 $args 必须是数组`); return; }
      const [min, max] = f.arity;
      if (args.length < min || (max !== null && args.length > max)) {
        report("error", "L3", ptr, `${label}: $fn ${body} 参数个数 ${args.length} 超出元数 [${min}, ${max === null ? "∞" : max}]`);
      }
      args.forEach((a, i) => checkExpr(a, `${ptr}.$args[${i}]`, label));
      return;
    }
    if (op === "$if") {
      for (const k of ["$if", "$then"]) if (!(k in node)) report("error", "L3", ptr, `${label}: $if 缺少 ${k}`);
      for (const k of ["$if", "$then", "$else"]) if (k in node) checkExpr(node[k], `${ptr}.${k}`, label);
      return;
    }
    if (op === "$tpl") {
      if (!Array.isArray(body)) { report("error", "L3", ptr, `${label}: $tpl 必须是数组`); return; }
      // $tpl 的元素允许是纯字符串字面量，只有非字符串才当子表达式继续递归
      body.forEach((v, i) => { if (typeof v !== "string") checkExpr(v, `${ptr}.$tpl[${i}]`, label); });
      return;
    }
  }
  // 不是表达式对象：形状由 L1 按 $defs 判定，这里既不递归也不报错，
  // 否则 title:"请假申请" 这类合法的字面量属性会被逐键当成表达式。
}

function checkQueryFilter(filter, ptr, label) {
  if (filter == null) return;
  const walkCond = (c, p) => {
    if (c === null || typeof c !== "object") return;
    if (Array.isArray(c)) { c.forEach((v, i) => walkCond(v, `${p}[${i}]`)); return; }
    if ("op" in c) {
      if (!QOP.has(c.op)) report("error", "L3", p, `${label}: 查询算子 "${c.op}" 不在 expression-registry.queryOperators 内`);
      if (c.value !== undefined) checkExpr(c.value, `${p}.value`, label);
      if (c.field !== undefined) checkExpr(c.field, `${p}.field`, label);
      return;
    }
    for (const k of ["and", "or", "not"]) if (k in c) walkCond(c[k], `${p}.${k}`);
  };
  walkCond(filter, ptr);
}

// ============================================================ 工件索引（L2）
function buildIndex(bundle) {
  const ix = new Map();
  const put = (kind, key, ref) => {
    const id = `${kind}:${key}`;
    if (!ix.has(id)) ix.set(id, []);
    ix.get(id).push(ref);
  };
  const A = bundle.artifacts;
  for (const ds of A.dataSchemas || []) {
    put("dataSchema", ds.key, ds);
    for (const e of ds.entities || []) {
      put("entity", e.key, e);
      for (const f of e.fields || []) { put("field", f.key, f); put("field", `${e.key}.${f.key}`, f); }
    }
    for (const en of ds.enums || []) put("enum", en.key, en);
  }
  for (const u of A.uiSchemas || []) { put("uiSchema", u.key, u); put("page", u.key, u); }
  for (const l of A.logicSchemas || []) {
    put("logicSchema", l.key, l);
    for (const a of l.actions || []) put("action", a.key, a);
    for (const a of l.apis || []) put("api", a.key, a);
    for (const f of l.flows || []) put("flow", f.key, f);
    for (const r of l.rules || []) put("rule", r.key, r);
  }
  for (const c of REG_COMP.components) put("component", c.name, c);
  for (const a of bundle.assets || []) {
    put("asset", a.assetId, a);
    put("assetId", a.assetId, a);
    if (a.key) put("asset", a.key, a);
    if (a.fileName) { put("asset", a.fileName, a); put("assetId", a.fileName, a); }
  }
  for (const r of A.roles || []) put("role", r.key, r);
  return ix;
}

/**
 * 实体「全列集合」= 显式 fields[] ∪ 平台注入列。
 * 主键 / 租户列 / 软删除列 / 时间戳列 / 乐观锁列 / JSONB 容器列都不出现在 fields[] 里
 * （它们由 EntityStorage 声明、由 BFF 统一注入），但查询、排序、列配置完全可以引用它们。
 * 判断「这个列是否存在」必须走这个集合，否则 created_at 这类列会被误判成不存在。
 */
function entityColumns(entity) {
  const cols = new Set((entity.fields || []).map((f) => f.key));
  const st = entity.storage || {};
  if (st.primaryKey) cols.add(st.primaryKey);
  if (st.tenantColumn) cols.add(st.tenantColumn);
  if (st.jsonbColumn) cols.add(st.jsonbColumn);
  if (st.softDelete && st.softDelete.enabled !== false) cols.add(st.softDelete.column || "deleted_at");
  const ts = st.timestamps;
  if (ts) for (const k of ["createdAt", "updatedAt", "createdBy", "updatedBy"]) if (ts[k]) cols.add(ts[k]);
  if (st.optimisticLock === true) cols.add("version");
  return cols;
}

/** 列表类属性的虚拟列：操作列、序号列、多选列、展开列 —— 不是实体字段，但列配置里合法 */
const VIRTUAL_COLUMNS = new Set(["actions", "_actions", "index", "_index", "selection", "_selection", "expand", "_expand"]);

// ArtifactRef 用 {kind, key|id}，AssetRef 用 {kind, assetId}；两者命名空间不同，各自独立查。
const resolveRef = (ix, ref) => {
  if (!ref) return undefined;
  for (const k of [ref.key, ref.id]) {
    if (k === undefined) continue;
    const hit = ix.get(`${ref.kind}:${k}`);
    if (hit) return hit[0];
  }
  if (ref.assetId !== undefined) {
    const hit = ix.get(`assetId:${ref.assetId}`);
    if (hit) return hit[0];
  }
  return undefined;
};
const hasRef = (ix, ref) => resolveRef(ix, ref) !== undefined;

// ============================================================ BPMN 解析（零依赖，正则足够用）
function parseBpmn(xml) {
  const processId = (xml.match(/<(?:\w+:)?process\b[^>]*\bid="([^"]+)"/) || [])[1] ?? null;
  const userTasks = [...xml.matchAll(/<(?:\w+:)?userTask\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const gateways = [...xml.matchAll(/<(?:\w+:)?exclusiveGateway\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const flows = [...xml.matchAll(/<(?:\w+:)?sequenceFlow\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const conditions = [...xml.matchAll(/<flowable:field\s+name="lcpExprSource"\s*>\s*<flowable:string>([\s\S]*?)<\/flowable:string>/g)]
    .map((m) => ({ raw: m[1].trim(), json: (() => { try { return JSON.parse(m[1].trim()); } catch { return null; } })() }));
  const dangling = [];
  for (const f of [...xml.matchAll(/<(?:\w+:)?sequenceFlow\b[^>]*\bid="([^"]+)"[^>]*sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"/g)]) {
    const [, id, src, dst] = f;
    const ids = new Set([processId, ...userTasks, ...gateways, ...[...xml.matchAll(/(?:startEvent|endEvent)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1])]);
    if (!ids.has(src) || !ids.has(dst)) dangling.push({ id, src, dst });
  }
  return { processId, userTasks, gateways, flows, conditions, dangling };
}

// ============================================================ 单个 Bundle 校验
function checkBundle(bundle, tag) {
  const at = (ptr) => `${tag}${ptr}`;
  const A = bundle.artifacts || {};

  // ---------------- L1：信封层 + 各子工件独立校验
  scoped(at, () => {
    const docBundle = DOCS.get("https://lcp.dev/schema/0.1/bundle.schema.json");
    validate({ bundle }, docBundle, docBundle.$id, "$");
    const SUB = [
      ["dataSchemas", "data.schema.json", "DataSchema"],
      ["uiSchemas", "ui.schema.json", "UISchema"],
      ["logicSchemas", "logic.schema.json", "LogicSchema"],
      ["components", "component.schema.json", "ComponentContract"]
    ];
    for (const [prop, file, defName] of SUB) {
      const doc = DOCS.get(`https://lcp.dev/schema/0.1/${file}`);
      (A[prop] || []).forEach((item, i) => validate(item, doc.$defs[defName], doc.$id, `$.artifacts.${prop}[${i}]`));
    }
  });

  // ---------------- L2：索引与引用
  const ix = buildIndex(bundle);
  const roleKeys = new Set((A.roles || []).map((r) => r.key));
  roleKeys.add("system");

  const seenRefs = new Set();
  walk(bundle, (v, ptr) => {
    if (!isRef(v)) return;
    const sig = `${ptr}|${JSON.stringify(v)}`;
    if (seenRefs.has(sig)) return;
    seenRefs.add(sig);
    if (v.snapshotId) return; // 跨快照引用由安装器校验
    if (!hasRef(ix, v)) {
      const ident = v.key !== undefined ? `key=${v.key}` : `id=${v.id}`;
      report("error", "L2", at(ptr), `引用无法解析：kind=${v.kind} ${ident}（version=${v.version ?? "snapshot"}）`);
    }
  }, "$");

  const checkRoles = (access, ptr) => {
    if (!access) return;
    for (const r of access.roles || []) if (!roleKeys.has(r)) report("error", "L2", at(ptr), `引用了未声明的角色 "${r}"`);
    if (access.ownerField && access.scope && access.scope !== "self" && access.scope !== "custom") {
      report("warn", "L2", at(ptr), `scope=${access.scope} 时声明 ownerField 无意义（ownerField 只在 scope=self 时生效）`);
    }
  };

  // ---------------- L2/L3：页面
  for (const [pi, page] of (A.uiSchemas || []).entries()) {
    const P = `$.artifacts.uiSchemas[${pi}]`;
    const dsIds = new Set((page.dataSources || []).map((d) => d.id));
    const stateKeys = new Set(Object.keys(page.state || {}));
    const dialogKeys = new Set(Object.keys(page.dialogs || {}));
    const entityOfDs = new Map();

    (page.dataSources || []).forEach((d, di) => {
      const D = `${P}.dataSources[${di}](${d.id})`;
      if (d.entityRef) {
        const e = resolveRef(ix, d.entityRef);
        if (!e && !hasRef(ix, d.entityRef)) report("error", "L2", at(D), "entityRef 无法解析");
        if (e) entityOfDs.set(d.id, e);
      }
      if (d.apiRef && !hasRef(ix, d.apiRef)) report("error", "L2", at(D), "apiRef 无法解析");
      if (d.flowRef && !hasRef(ix, d.flowRef)) report("error", "L2", at(D), "flowRef 无法解析");
      for (const dep of d.dependsOn || []) if (!dsIds.has(dep)) report("error", "L2", at(D), `dependsOn 指向不存在的同级数据源 "${dep}"`);
      checkExpr(d.filter, `${D}.filter`, "查询条件");
      checkQueryFilter(d.filter, `${D}.filter`, "查询条件");
      if (isExpr(d.pkParam)) checkExpr(d.pkParam, `${D}.pkParam`, "pkParam");
      checkExpr(d.expr, `${D}.expr`, "计算表达式");
    });

    // defaultValue / initial / pkParam 的类型是 Value（字面量 + 可选表达式）或 oneOf[路径字符串, Expr]，
    // 字面量必须原样放行，只有写成表达式树时才做表达式校验，否则空字符串初值都会被判为「裸字符串」。
    for (const p of (page.params || [])) if (isExpr(p.defaultValue)) checkExpr(p.defaultValue, `${P}.params(${p.key}).defaultValue`, "参数默认值");
    for (const [k, sv] of Object.entries(page.state || {})) if (isExpr(sv.initial)) checkExpr(sv.initial, `${P}.state.${k}.initial`, "状态初值");

    checkRoles(page.access, `${P}.access`);
    for (const r of (page.route && page.route.roles) || []) if (!roleKeys.has(r)) report("error", "L2", at(`${P}.route.roles`), `引用了未声明的角色 "${r}"`);

    const nodes = [];
    const walkNodes = (node, ptr) => {
      nodes.push([node, ptr]);
      (node.children || []).forEach((c, i) => walkNodes(c, `${ptr}.children[${i}]`));
      for (const [slot, arr] of Object.entries(node.slots || {})) (arr || []).forEach((c, i) => walkNodes(c, `${ptr}.slots.${slot}[${i}]`));
    };
    if (page.layout) walkNodes(page.layout, `${P}.layout`);
    for (const [dk, dl] of Object.entries(page.dialogs || {})) walkNodes(dl, `${P}.dialogs.${dk}`);

    for (const [node, NP] of nodes) {
      const c = REG_COMP.components.find((x) => x.name === node.component);
      if (!c) { report("error", "L2", at(NP), `组件 "${node.component}" 未在 registry/builtin-components.json 中注册`); continue; }
      const nChildren = (node.children || []).length + Object.values(node.slots || {}).reduce((n, a) => n + (a || []).length, 0);
      if (nChildren > 0 && c.container !== true) report("error", "L2", at(NP), `组件 ${node.component} 不是容器，却挂了 ${nChildren} 个子节点`);
      const checkChild = (ch, slotName) => {
        const cc = REG_COMP.components.find((x) => x.name === ch.component);
        if (!cc) return;
        // 具名插槽可以用 accepts 声明自己的白名单（如 x-search-form 的 right 槽只收按钮）；
        // 未声明 accepts 的插槽回落到 acceptChildren 的 kind 白名单。
        const slot = slotName ? (c.slots || []).find((s) => s.name === slotName) : null;
        if (slot && Array.isArray(slot.accepts) && slot.accepts.length) {
          if (!slot.accepts.includes(ch.component)) {
            report("error", "L2", at(NP), `子组件 ${ch.component} 不在 ${node.component} 插槽 ${slotName} 的 accepts [${slot.accepts.join(", ")}] 内`);
          }
          return;
        }
        // acceptChildren 里的 "field" 语义是「能参与表单模型」，判定依据是子组件契约自己的
        // capabilities.formField，而不是另立一份 kind 白名单 —— 这样物料面板把控件归到哪个 kind
        // 分组（例如 kind=advanced 的 x-employee-picker）都不会误伤。
        const isFormField = !!(cc.capabilities && cc.capabilities.formField === true);
        if (c.acceptChildren && !c.acceptChildren.includes(cc.kind) && !(c.acceptChildren.includes("field") && isFormField)) {
          report("error", "L2", at(NP), `子组件 ${ch.component}(${cc.kind}) 不在 ${node.component} 的 acceptChildren [${c.acceptChildren.join(", ")}] 内（也未声明 capabilities.formField）`);
        }
      };
      (node.children || []).forEach((ch) => checkChild(ch, null));
      for (const [slotName, arr] of Object.entries(node.slots || {})) (arr || []).forEach((ch) => checkChild(ch, slotName));
      if (node.bind) {
        if (node.bind.dataSourceId && !dsIds.has(node.bind.dataSourceId)) report("error", "L2", at(NP), `bind.dataSourceId "${node.bind.dataSourceId}" 不存在`);
        const e = node.bind.entityRef ? resolveRef(ix, node.bind.entityRef) : entityOfDs.get(node.bind.dataSourceId);
        if (e && node.bind.fieldKey && !entityColumns(e).has(node.bind.fieldKey)) {
          report("error", "L2", at(NP), `bind.fieldKey "${node.bind.fieldKey}" 不在实体 ${e.key} 中`);
        }
      }
      if (node.props && node.props.dataSourceId && !dsIds.has(node.props.dataSourceId)) {
        report("error", "L2", at(NP), `props.dataSourceId "${node.props.dataSourceId}" 不存在`);
      }
      for (const lp of ["fieldList", "columnList", "searchFieldList", "descriptionsList"]) {
        const arr = node.props && node.props[lp];
        if (!Array.isArray(arr)) continue;
        const e = entityOfDs.get(node.props && node.props.dataSourceId) || (node.bind && node.bind.entityRef ? resolveRef(ix, node.bind.entityRef) : null);
        const cols = e ? entityColumns(e) : null;
        for (const item of arr) {
          const fk = typeof item === "string" ? item : item && item.field;
          if (!fk) continue;
          if (lp === "columnList" && VIRTUAL_COLUMNS.has(fk)) continue;
          if (cols && !cols.has(fk)) report("error", "L2", at(`${NP}.props.${lp}`), `字段 "${fk}" 不在数据源实体 ${e.key} 中（含平台注入列）`);
        }
      }
      if (node.props && node.props.fieldList) {
        for (const item of node.props.fieldList) {
          if (item && item.widget && !REG_COMP.components.some((x) => x.name === item.widget)) {
            report("error", "L2", at(`${NP}.props.fieldList`), `显式指定的 widget "${item.widget}" 未注册`);
          }
        }
      }
      if (node.handlers) {
        const declared = new Set((c.events || []).map((e) => e.name));
        for (const [hk, hv] of Object.entries(node.handlers)) {
          if (declared.size === 0) report("warn", "L2", at(`${NP}.handlers`), `组件 ${c.name} 的契约未声明 events，无法校验事件名 "${hk}"`);
          else if (!declared.has(hk)) report("error", "L2", at(`${NP}.handlers`), `事件 "${hk}" 不在 ${c.name} 契约的 events [${[...declared].join(", ")}] 内`);
          if (hv && hv.code) report("error", "L2", at(`${NP}.handlers.${hk}`), "节点事件不支持 code 代码钩子；请改用具名动作，或把钩子放到页面生命周期 handlers");
        }
      }
      checkExpr(node.visible, `${NP}.visible`, "visible");
      checkExpr(node.disable, `${NP}.disable`, "disable");
      checkExpr(node.loop && node.loop.over, `${NP}.loop.over`, "loop.over");
      if (node.props) {
        // 属性值只有两种合法形态：① 声明 PropType 的字面量；② 仅当 PropDef.bindable=true 时才允许表达式。
        // 因此「是表达式才校验」—— 对这个值无条件调 checkExpr 会把所有字面量属性全部误判。
        const propDefs = new Map((c.props || []).map((p) => [p.key, p]));
        for (const [pk, pv] of Object.entries(node.props)) {
          const pd = propDefs.get(pk);
          const label = `props.${pk}`;
          if (Array.isArray(pv) && !isExpr(pv)) {
            // 复合属性（columnList/fieldList/buttonList/...）：元素可以是裸字符串简写，也可以是对象；
            // 对象内部逐键按 itemProps 的 bindable 判定
            const itemDefs = new Map(((pd && pd.itemProps) || []).map((p) => [p.key, p]));
            pv.forEach((item, i) => {
              if (item === null || typeof item !== "object" || Array.isArray(item)) return;
              if (isExpr(item)) { checkExpr(item, `${NP}.${label}[${i}]`, label); return; }
              for (const [ik, iv] of Object.entries(item)) {
                if (!isExpr(iv)) continue;
                const ipd = itemDefs.get(ik);
                if (ipd && ipd.bindable !== true) {
                  report("error", "L3", at(`${NP}.${label}[${i}].${ik}`), `属性 ${pk}[].${ik} 未声明 bindable（仅接受字面量），不允许绑定表达式`);
                } else {
                  checkExpr(iv, `${NP}.${label}[${i}].${ik}`, `${label}[].${ik}`);
                }
              }
            });
            continue;
          }
          if (!isExpr(pv)) continue;
          if (pd && pd.bindable !== true) {
            report("error", "L3", at(`${NP}.${label}`), `属性 ${pk} 未声明 bindable（仅接受字面量），不允许绑定表达式`);
            continue;
          }
          checkExpr(pv, `${NP}.${label}`, label);
        }
      }
    }

    // 页面内的步骤（handlers / dialogs）
    const pageHandlers = new Set(["onLoad", "onMount", "onParamChange", "onParamsChange", "onError", "onUnmount", "onBeforeLeave"]);
    const collectSteps = (h, ptr) => {
      if (!h) return;
      if (h.code) checkCodeHook(h.code, `${ptr}.code`);
      for (const s of h.steps || []) walk(s, (v, p) => {
        if (isStep(v)) checkStep(v, `${ptr}${p}`, { ix, at, dsIds, stateKeys, dialogKeys, page });
      }, "", `$.steps`);
    };
    for (const [hk, hv] of Object.entries(page.handlers || {})) {
      if (!pageHandlers.has(hk)) report("error", "L2", at(`${P}.handlers`), `页面级 handler "${hk}" 不在约定集合内（${[...pageHandlers].join(" / ")}）`);
      collectSteps(hv, `${P}.handlers.${hk}`);
    }
    for (const [dk, dl] of Object.entries(page.dialogs || {})) {
      for (const [hk, hv] of Object.entries(dl.handlers || {})) {
        if (hv && hv.code) report("error", "L2", at(`${P}.dialogs.${dk}.handlers.${hk}`), "弹窗节点事件不支持 code 代码钩子；请改为动作或在页面生命周期处理");
        collectSteps(hv, `${P}.dialogs.${dk}.handlers.${hk}`);
      }
    }
  }
}

// ============================================================ 代码钩子（L3 + L4）
function checkCodeSource(source, ptr, label) {
  if (typeof source !== "string" || !source.trim()) {
    report("error", "L3", at(ptr), `${label}.source 不能为空`);
    return;
  }
  if (source.length > 200_000) {
    report("error", "L4", at(ptr), `${label}.source 超过 200KB，请拆分或改为平台注册入口`);
    return;
  }
  if (!/export\s+default\b/.test(source)) {
    report("warn", "L3", at(ptr), `${label}.source 建议导出默认函数（export default）`);
  }
  if (/\brequire\s*\(/.test(source)) report("error", "L4", at(ptr), `${label}.source 使用了 require()`);
  if (/\bimport\s*\(/.test(source)) report("error", "L4", at(ptr), `${label}.source 不允许动态 import()`);
  if (/\b(window\.)?(parent|top)\b/.test(source) || /document\.cookie/.test(source)) {
    report("error", "L4", at(ptr), `${label}.source 试图突破沙箱边界（parent/top/document.cookie）`);
  }
  if (!TS) return;
  try {
    const result = TS.transpileModule(source, {
      fileName: "hook.ts",
      reportDiagnostics: true,
      compilerOptions: {
        target: TS.ScriptTarget.ES2020,
        module: TS.ModuleKind.CommonJS,
        isolatedModules: true
      }
    });
    const errors = (result.diagnostics || []).filter((d) => d.category === TS.DiagnosticCategory.Error);
    for (const diag of errors.slice(0, 5)) {
      const message = TS.flattenDiagnosticMessageText(diag.messageText, " ");
      report("error", "L3", at(ptr), `${label}.source 语法错误：${message}`);
    }
  } catch (error) {
    report("warn", "L3", at(ptr), `${label}.source 无法做 TypeScript 语法检查：${error.message}`);
  }
}

function checkCodeHook(hook, ptr) {
  if (!hook || typeof hook !== "object") {
    report("error", "L3", at(ptr), "code hook 必须是对象");
    return;
  }
  if (hook.lang && hook.lang !== "ts") report("error", "L3", at(ptr), `页面代码钩子只支持 lang=ts，收到 ${hook.lang}`);
  if (hook.runtime && hook.runtime !== "browser") report("error", "L3", at(ptr), `页面代码钩子只支持 runtime=browser，收到 ${hook.runtime}`);
  if (!Array.isArray(hook.inputs)) report("error", "L3", at(ptr), "页面代码钩子必须声明 inputs（可为空数组）");
  if (!Array.isArray(hook.outputs)) report("error", "L3", at(ptr), "页面代码钩子必须声明 outputs（可为空数组）");
  const sb = hook.sandbox || {};
  if (sb.network === true && !(sb.allowedHosts || []).length) {
    report("error", "L4", at(ptr), "代码钩子 sandbox.network=true 时必须声明 allowedHosts");
  }
  if (sb.dom === true) report("warn", "L4", at(ptr), "代码钩子开启 dom 会削弱隔离性（沙箱内本就没有宿主 DOM）");
  if (sb.storage === true) report("warn", "L4", at(ptr), "严格 iframe 沙箱不提供同源存储，storage 仅作为声明");
  if (sb.allowEval === true) report("warn", "L4", at(ptr), "代码钩子开启 allowEval 会扩大攻击面");
  if (!sb.memoryLimitMb) report("warn", "L4", at(ptr), "代码钩子未声明 memoryLimitMb");
  checkCodeSource(hook.source, ptr, "CodeHook");
}

// ============================================================ 步骤校验（L3 + L4）
function checkStep(step, ptr, ctx) {
  const at = ctx.at;
  const T = step.type;
  if (step.when !== undefined) checkExpr(step.when, `${ptr}.when`, `${T}.when`);
  if (step.target !== undefined) {
    const seg = String(step.target).split(".");
    if (!ASSIGN_PREFIX.has(seg[0])) {
      report("error", "L3", at(ptr), `AssignStep.target "${step.target}" 的前缀必须是 ${[...ASSIGN_PREFIX].join(" / ")} 之一`);
    } else if (seg[0] === "state" && ctx.stateKeys && !ctx.stateKeys.has(seg[1])) {
      report("warn", "L2", at(ptr), `写入 state.${seg[1]}，但所属页面未声明该状态变量`);
    }
  }
  if (step.value !== undefined && T !== "fail") checkExpr(step.value, `${ptr}.value`, "assign.value");

  if (step.apiRef && !hasRef(ctx.ix, step.apiRef)) report("error", "L2", at(ptr), "ApiCallStep.apiRef 无法解析");
  if (step.flowRef && !hasRef(ctx.ix, step.flowRef)) report("error", "L2", at(ptr), "StartFlowStep.flowRef 无法解析");
  if (step.actionRef && !hasRef(ctx.ix, step.actionRef)) report("error", "L2", at(ptr), "actionRef 无法解析");
  if (step.registerEntity && !hasRef(ctx.ix, step.registerEntity)) report("error", "L2", at(ptr), "UploadStep.registerEntity 无法解析");

  if ((T === "openDialog" || T === "closeDialog") && ctx.dialogKeys && step.dialogKey && !ctx.dialogKeys.has(step.dialogKey)) {
    report("error", "L2", at(ptr), `${T} 引用的 dialogKey "${step.dialogKey}" 不在本页 dialogs 内`);
  }
  if (T === "navigate") {
    if (!step.pageRef && !step.to) report("error", "L3", at(ptr), "NavigateStep 至少需要 pageRef 或 to 之一");
    if (step.pageRef && !hasRef(ctx.ix, step.pageRef)) report("error", "L2", at(ptr), "NavigateStep.pageRef 无法解析");
  }
  if (T === "emit" && typeof step.event === "string") {
    const m = step.event.match(PAGE_DS_EVENTS);
    if (m && ctx.dsIds && !ctx.dsIds.has(m[1])) report("warn", "L2", at(ptr), `emit 事件 "${step.event}" 指向的数据源不存在`);
  }
  if (T === "fail" && !step.code) report("error", "L3", at(ptr), "FailStep 必须给出业务错误码 code，否则前端无法做错误分支");
  if (T === "validate" && !step.fields && !(step.rules && step.rules.length)) {
    report("warn", "L3", at(ptr), "ValidateStep 既未声明 fields 也未声明 rules，等于空校验");
  }

  // ---- L4 策略
  if (T === "code") {
    const sb = step.sandbox || {};
    if (step.lang && step.lang !== "ts") report("warn", "L4", at(ptr), `CodeStep.lang=${step.lang} 目前没有服务端执行器，只能走注册入口`);
    if (step.runtime === "server" && sb.dom === true) report("error", "L4", at(ptr), "服务端 CodeStep 不允许开启 dom 沙箱能力");
    if (step.runtime === "server" && sb.storage === true) report("error", "L4", at(ptr), "服务端 CodeStep 不允许开启 storage 沙箱能力");
    if (sb.network === true && !(sb.allowedHosts || []).length) {
      report("error", "L4", at(ptr), "CodeStep.sandbox.network=true 时必须声明 allowedHosts");
    }
    if (sb.network === true) report("warn", "L4", at(ptr), "CodeStep 开启了 network，需在评审中说明外呼用途（默认应为 false）");
    if (sb.allowEval === true) report("warn", "L4", at(ptr), "CodeStep 开启了 allowEval，存在注入风险");
    if (!sb.memoryLimitMb) report("warn", "L4", at(ptr), "CodeStep 未声明 memoryLimitMb");
    checkCodeSource(step.source, ptr, "CodeStep");
  }
  if (T === "transaction" && ctx.inTransaction) report("error", "L4", at(ptr), "TransactionStep 不允许嵌套（Flowable 与 PG 都不支持嵌套事务语义）");
  if (T === "upload" && !step.pathTemplate) report("warn", "L4", at(ptr), "UploadStep 未声明 pathTemplate，多租户目录隔离只能靠默认值");
  if (T === "branch" && (!step.cases || step.cases.length === 0) && !step.else) report("error", "L3", at(ptr), "BranchStep 既无 cases 也无 else");
  if (T === "loop" && !step.over) report("error", "L3", at(ptr), "LoopStep 缺少 over");

  const nextCtx = T === "transaction" ? { ...ctx, inTransaction: true } : ctx;
  const descend = (arr, sub) => { if (Array.isArray(arr)) arr.forEach((s, i) => { if (isStep(s)) checkStep(s, `${ptr}.${sub}[${i}]`, nextCtx); }); };
  descend(step.steps, "steps");
  descend(step.then, "then");
  descend(step.else, "else");
  descend(step.onError, "onError");
  descend(step.afterComplete, "afterComplete");
  descend(step.before, "before");
  descend(step.after, "after");
  descend(step.branches, "branches");
  if (Array.isArray(step.cases)) step.cases.forEach((c, i) => {
    if (c.when !== undefined) checkExpr(c.when, `${ptr}.cases[${i}].when`, "branch.when");
    descend(c.then, `cases[${i}].then`);
  });
  if (step.assignTo !== undefined) {
    const seg = String(step.assignTo).split(".");
    if (!ASSIGN_PREFIX.has(seg[0])) report("error", "L3", at(ptr), `assignTo "${step.assignTo}" 的前缀必须是 ${[...ASSIGN_PREFIX].join(" / ")} 之一`);
  }
}

// ============================================================ 逻辑层校验（actions / apis / rules / flows）
function checkLogic(bundle, tag) {
  const at = (p) => `${tag}${p}`;
  const ix = buildIndex(bundle);
  const A = bundle.artifacts || {};
  const roleKeys = new Set((A.roles || []).map((r) => r.key));
  roleKeys.add("system");

  for (const [li, ls] of (A.logicSchemas || []).entries()) {
    const L = `$.artifacts.logicSchemas[${li}]`;

    for (const [ai, a] of (ls.actions || []).entries()) {
      const AP = `${L}.actions[${ai}](${a.key})`;
      const names = new Set();
      for (const p of a.params || []) {
        if (names.has(p.key)) report("error", "L3", at(AP), `动作参数 key "${p.key}" 重复`);
        names.add(p.key);
      }
      if (a.access) for (const r of a.access.roles || []) if (!roleKeys.has(r)) report("error", "L2", at(`${AP}.access`), `引用未声明角色 "${r}"`);
      if (!a.steps || a.steps.length === 0) report("error", "L3", at(AP), "Action 没有任何 steps");
      (a.steps || []).forEach((s, si) => { if (isStep(s)) checkStep(s, `${AP}.steps[${si}]`, { ix, at }); });
      if (a.access && a.access.scope && a.access.scope !== "all" && a.access.scope !== "custom" && !a.access.ownerField && a.access.scope !== "dept" && a.access.scope !== "deptAndChildren") {
        report("warn", "L2", at(`${AP}.access`), `scope=${a.access.scope} 未给出 ownerField`);
      }
      if (a.trigger === "onSchedule" && a.idempotent === undefined) report("warn", "L4", at(AP), "定时触发动作未声明 idempotent，重跑可能重复副作用");
      if (a.when !== undefined) checkExpr(a.when, `${AP}.when`, "action.when");
    }

    for (const [di, d] of (ls.apis || []).entries()) {
      const DP = `${L}.apis[${di}](${d.key})`;
      if (d.kind === "rest" && !d.timeoutMs) report("warn", "L4", at(DP), "外部 REST 接口未声明 timeoutMs");
      if (d.kind === "rest" && !d.retry) report("warn", "L4", at(DP), "外部 REST 接口未声明重试策略，网络抖动会直接冒泡给用户");
      // 只对「未表态」告警：显式写 idempotent:false 是一种决策（导出 / 发消息本就非幂等），不应被当成遗漏
      if (["POST", "PUT", "PATCH", "DELETE"].includes(d.method) && d.idempotent === undefined) {
        report("warn", "L4", at(DP), `写接口 ${d.method} 未声明 idempotent，重试可能产生重复数据`);
      }
      if (d.access) for (const r of d.access.roles || []) if (!roleKeys.has(r)) report("error", "L2", at(`${DP}.access`), `引用未声明角色 "${r}"`);
      if (d.response) {
        for (const k of ["successWhen"]) if (d.response[k] !== undefined) checkExpr(d.response[k], `${DP}.response.${k}`, `response.${k}`);
      }
      (d.before || []).forEach((s, i) => { if (isStep(s)) checkStep(s, `${DP}.before[${i}]`, { ix, at }); });
      (d.after || []).forEach((s, i) => { if (isStep(s)) checkStep(s, `${DP}.after[${i}]`, { ix, at }); });
    }

    for (const [ri, r] of (ls.rules || []).entries()) {
      const RP = `${L}.rules[${ri}](${r.key})`;
      if (r.entityRef && !hasRef(ix, r.entityRef)) report("error", "L2", at(RP), "Rule.entityRef 无法解析");
      if (r.when !== undefined) checkExpr(r.when, `${RP}.when`, "rule.when");
      if (!r.then || r.then.length === 0) report("error", "L3", at(RP), "Rule 没有 then 步骤，规则为空");
      (r.then || []).forEach((s, i) => { if (isStep(s)) checkStep(s, `${RP}.then[${i}]`, { ix, at }); });
    }

    for (const [fi, f] of (ls.flows || []).entries()) {
      const FP = `${L}.flows[${fi}](${f.key})`;
      const asset = resolveRef(ix, f.bpmnRef);
      if (!f.bpmnRef || !asset) report("error", "L3", at(FP), "Flow.bpmnRef 无法解析到 bundle.assets 中的 BPMN 资产");
      const entity = f.entityRef ? resolveRef(ix, f.entityRef) : null;
      if (f.entityRef && !entity) report("error", "L2", at(FP), "Flow.entityRef 无法解析");
      if (f.statusField && entity && !entityColumns(entity).has(f.statusField)) {
        report("error", "L3", at(FP), ` Flow.statusField "${f.statusField}" 不是实体 ${entity.key} 的字段`);
      }
      const varNames = new Set();
      for (const v of f.variables || []) {
        if (varNames.has(v.name)) report("error", "L3", at(FP), `流程变量 "${v.name}" 重复声明`);
        varNames.add(v.name);
        checkExpr(v.source, `${FP}.variables(${v.name}).source`, `变量 ${v.name}`);
      }
      for (const [ti, tf] of (f.taskForms || []).entries()) {
        const TP = `${FP}.taskForms[${ti}](${tf.taskKey})`;
        if (tf.pageRef && !hasRef(ix, tf.pageRef)) report("error", "L2", at(TP), "taskForm.pageRef 无法解析");
        if (entity) for (const listName of ["editableFields", "requiredFields", "readonlyFields"]) {
          for (const fk of tf[listName] || []) {
            if (!entityColumns(entity).has(fk)) report("error", "L3", at(`${TP}.${listName}`), `字段 "${fk}" 不在实体 ${entity.key} 中（含平台注入列）`);
          }
        }
        if (tf.commentField && !varNames.has(tf.commentField)) {
          report("error", "L3", at(`${TP}.commentField`), `commentField "${tf.commentField}" 未在 Flow.variables[].name 中声明（办理意见走流程变量，不是实体字段）`);
        }
        if (tf.assignee && tf.assignee.type === "roleInDept" && !(tf.assignee.values || []).length) {
          report("error", "L3", at(`${TP}.assignee`), "roleInDept 型办理人必须给出 values（角色 key 列表）");
        }
      }
      for (const [ki, l] of (f.listeners || []).entries()) {
        const KP = `${FP}.listeners[${ki}]`;
        if (l.actionRef && !hasRef(ix, l.actionRef)) report("error", "L2", at(KP), "FlowListener.actionRef 无法解析");
        if (l.event === "taskCreated" && !l.taskKey) report("warn", "L3", at(KP), "task 级监听器未限定 taskKey，将对所有节点生效");
      }

      // ---- BPMN 交叉校验
      if (asset && asset.storage === "inline" && asset.inline && asset.inline.content) {
        const bpmn = parseBpmn(asset.inline.content);
        if (f.processKey !== bpmn.processId) report("error", "L3", at(FP), `Flow.processKey "${f.processKey}" 与 BPMN 中 process id "${bpmn.processId}" 不一致`);
        const taskKeys = new Set((f.taskForms || []).map((t) => t.taskKey));
        for (const tk of taskKeys) if (!bpmn.userTasks.includes(tk)) report("error", "L3", at(FP), `taskForms 声明的 taskKey "${tk}" 在 BPMN 中找不到同名 userTask`);
        for (const ut of bpmn.userTasks) if (!taskKeys.has(ut)) report("warn", "L3", at(FP), `BPMN 中的 userTask "${ut}" 未在 taskForms 中声明，运行时无法解析办理人与可编辑字段`);
        for (const bad of bpmn.dangling) report("error", "L3", at(FP), `BPMN 连线 ${bad.id} 引用了不存在的节点（${bad.src} -> ${bad.dst}）`);
        for (const [ci, c] of bpmn.conditions.entries()) {
          if (!c.json) { report("error", "L3", at(FP), `第 ${ci + 1} 个网关条件的 lcpExprSource 不是合法 JSON`); continue; }
          checkExpr(c.json, `${FP}#bpmn.condition[${ci}]`, "网关条件");
          walk(c.json, (v) => {
            if (isExpr(v) && v.$ref && typeof v.$ref === "string" && v.$ref.startsWith("$process.variables.")) {
              const name = v.$ref.split(".")[2];
              if (!varNames.has(name)) report("error", "L3", at(FP), `网关条件引用了未声明的流程变量 "${name}"`);
            }
          });
        }
      }
    }
  }
}

// ============================================================ 治理层：角色 / 权限 / 导航
function checkGovernance(bundle, tag) {
  const at = (p) => `${tag}${p}`;
  const ix = buildIndex(bundle);
  const A = bundle.artifacts || {};
  const roleKeys = new Set((A.roles || []).map((r) => r.key));
  roleKeys.add("system");

  const dupRole = new Set();
  for (const r of A.roles || []) { if (dupRole.has(r.key)) report("error", "L3", at("$.artifacts.roles"), `角色 key "${r.key}" 重复`); dupRole.add(r.key); }
  for (const r of A.roles || []) for (const parent of r.inheritFrom || []) {
    if (!roleKeys.has(parent)) report("error", "L2", at(`$.artifacts.roles(${r.key}).inheritFrom`), `继承自未声明的角色 "${parent}"`);
    if (parent === r.key) report("error", "L3", at(`$.artifacts.roles(${r.key}).inheritFrom`), "角色不能继承自身");
  }

  const NORM = (s) => String(s).replace(/^(action|api|entity|page|flow|field|component|menu):/, "");
  const RES_KIND = { entity: "entity", page: "page", action: "action", api: "api", flow: "flow", component: "component", role: "role" };
  for (const [i, g] of (A.permissions || []).entries()) {
    const GP = `$.artifacts.permissions[${i}](${g.roleKey}:${g.resource})`;
    if (!roleKeys.has(g.roleKey)) report("error", "L2", at(GP), `授予了未声明的角色 "${g.roleKey}"`);
    const kind = RES_KIND[g.resourceType];
    if (kind) {
      const target = g.resourceType === "component" ? REG_COMP.components.some((c) => c.name === NORM(g.resource)) : hasRef(ix, { kind, key: NORM(g.resource) });
      if (!target) report("error", "L2", at(GP), `resource "${g.resource}"（resourceType=${g.resourceType}）不存在`);
    }
    // system 是平台内部主体（定时任务 / 监听器），不下发给真实用户，字段白名单对它无意义
    if ((g.resourceType === "entity" || g.resourceType === "field") && g.roleKey !== "system" && (!g.fields || g.fields.length === 0)) {
      report("warn", "L4", at(GP), "实体级授权未声明 fields 白名单，等于放行全部字段（含敏感字段）");
    }
    if (g.condition !== undefined) checkExpr(g.condition, `${GP}.condition`, "权限条件");
  }

  const PAGES = new Set((A.uiSchemas || []).map((p) => p.key));
  const PATHS = new Map((A.uiSchemas || []).filter((p) => p.route && p.route.path).map((p) => [p.route.path, p.key]));
  const menus = bundle.navigation && bundle.navigation.menus;
  const seenMenu = new Set();
  const walkMenu = (m, ptr) => {
    if (seenMenu.has(m.key)) report("error", "L3", at(ptr), `菜单 key "${m.key}" 重复`);
    seenMenu.add(m.key);
    if (m.pageRef && !hasRef(ix, m.pageRef)) report("error", "L2", at(ptr), "menu.pageRef 无法解析");
    if (!m.pageRef && !m.url && !m.path && !(m.children && m.children.length)) report("warn", "L2", at(ptr), `菜单 "${m.key}" 既无 pageRef/url/path 也无子菜单，点不动`);
    for (const r of m.roles || []) if (!roleKeys.has(r)) report("error", "L2", at(ptr), `菜单引用了未声明角色 "${r}"`);
    if (m.visible !== undefined) checkExpr(m.visible, `${ptr}.visible`, "menu.visible");
    (m.children || []).forEach((c, i) => walkMenu(c, `${ptr}.children[${i}]`));
  };
  (menus || []).forEach((m, i) => walkMenu(m, `$.navigation.menus[${i}]`));

  if (bundle.navigation) {
    const nav = bundle.navigation;
    if (nav.defaultRoute && !PATHS.has(nav.defaultRoute)) {
      report("error", "L2", at("$.navigation.defaultRoute"), `默认路由 "${nav.defaultRoute}" 不匹配任何页面的 route.path（已知：${[...PATHS.keys()].join(", ")}）`);
    }
    if (nav.homePageRef && !PAGES.has(nav.homePageRef)) report("error", "L2", at("$.navigation.homePageRef"), `首页 "${nav.homePageRef}" 不是已声明的页面`);
  }

  if (bundle.publish) {
    const platforms = (bundle.publish.targets || []).map((t) => t.platform);
    if (new Set(platforms).size !== platforms.length) report("error", "L3", at("$.publish.targets"), "发布目标平台重复");
    if (bundle.publish.allowDestructive === true && bundle.publish.migrationStrategy === "auto") {
      report("warn", "L4", at("$.publish"), "allowDestructive + migrationStrategy=auto：破坏性 DDL 会在无人确认的情况下自动执行");
    }
    if (bundle.snapshot && bundle.snapshot.status === "published") {
      if (!bundle.snapshot.publishedAt) report("warn", "L4", at("$.snapshot"), "status=published 但缺少 publishedAt");
      if (!bundle.snapshot.publishedBy) report("warn", "L4", at("$.snapshot"), "status=published 但缺少 publishedBy");
    }
  }
}

// ============================================================ 注册表完整性（L3「四处齐改」）
function checkRegistry() {
  const dataDoc = DOCS.get("https://lcp.dev/schema/0.1/data.schema.json");
  const FT = dataDoc.$defs.FieldType.enum;
  const T = REG_TYPES.types;

  for (const t of FT) if (!T[t]) report("error", "L3", `registry/type-mapping.json`, `FieldType "${t}" 缺少 PG/TS/Java/组件 四向映射`);
  for (const t of Object.keys(T)) if (!FT.includes(t)) report("error", "L3", `registry/type-mapping.json`, `映射表存在多余类型 "${t}"，不在 FieldType 枚举内`);
  for (const [t, m] of Object.entries(T)) {
    for (const k of ["pg", "ts", "java", "widget"]) if (!m[k]) report("error", "L3", `registry/type-mapping.json`, `类型 "${t}" 缺少 ${k} 段`);
    if (m.widget && m.widget.name && !REG_COMP.components.some((c) => c.name === m.widget.name)) {
      report("error", "L3", `registry/type-mapping.json`, `类型 "${t}" 的默认组件 "${m.widget.name}" 未在组件注册表中`);
    }
  }
  for (const [t, m] of Object.entries(T)) {
    if (m.pg && m.pg.stored === false && m.pg.base !== null) {
      report("error", "L3", `registry/type-mapping.json`, `类型 "${t}" 声明 pg.stored=false（不入 PostgreSQL 列）却仍给出 pg.base="${m.pg.base}"，二者语义矛盾`);
    }
    if (m.pg && m.pg.base === null && m.pg.stored !== false) {
      report("error", "L3", `registry/type-mapping.json`, `类型 "${t}" 的 pg.base 为 null（无列类型），必须同时显式声明 pg.stored=false`);
    }
  }

  const names = new Set();
  for (const c of REG_COMP.components) {
    if (names.has(c.name)) report("error", "L3", `registry/builtin-components.json`, `组件名 "${c.name}" 重复`);
    names.add(c.name);
    for (const p of c.props || []) {
      if (p.bindable === undefined) report("warn", "L3", `registry/builtin-components.json`, `组件 ${c.name} 的属性 ${p.key} 未声明 bindable，设计器无法判断能否绑定表达式`);
    }
    if (c.fieldBindings) {
      for (const ft of c.fieldBindings.forFieldTypes || []) {
        if (!FT.includes(ft)) report("error", "L3", `registry/builtin-components.json`, `组件 ${c.name} 的 fieldBindings 引用了不存在的 FieldType "${ft}"`);
      }
    }
    if (c.acceptChildren) {
      for (const k of c.acceptChildren) if (!DOCS.get("https://lcp.dev/schema/0.1/component.schema.json").$defs.ComponentKind.enum.includes(k)) {
        report("error", "L3", `registry/builtin-components.json`, `组件 ${c.name} 的 acceptChildren 含非法 kind "${k}"`);
      }
    }
  }
  const mapped = new Set();
  for (const c of REG_COMP.components) for (const ft of (c.fieldBindings && c.fieldBindings.forFieldTypes) || []) mapped.add(ft);
  for (const t of FT) if (!mapped.has(t)) report("error", "L3", `registry/builtin-components.json`, `FieldType "${t}" 没有任何内置组件可渲染（缺省控件解析会失败）`);

  for (const [t, cfg] of Object.entries(REG_TYPES.arrayItemWidgets || {})) {
    if (t === "description") continue;
    if (cfg.widget && !names.has(cfg.widget)) report("error", "L3", `registry/type-mapping.json`, `arrayItemWidgets.${t} 指向的组件 "${cfg.widget}" 未注册`);
  }

  const logicDoc = DOCS.get("https://lcp.dev/schema/0.1/logic.schema.json");
  const seen = new Map();
  for (const alt of logicDoc.$defs.Step.oneOf) {
    const name = alt.$ref.split("/").pop();
    const disc = logicDoc.$defs[name].properties.type;
    const val = disc.const ?? (disc.enum && disc.enum[0]);
    if (seen.has(val)) report("error", "L3", `schema/logic.schema.json`, `Step 判别值 "${val}" 被 ${seen.get(val)} 与 ${name} 共用，oneOf 会歧义`);
    seen.set(val, name);
  }

  // ---- 表达式算子表三方对齐：common.Expr.oneOf ⇄ expression-registry.operators ⇄ 校验器 EXPR_HEADS
  // 这是「新增一个算子要四处齐改」的机器守卫：漏改任何一处，isExpr 判别就会与 schema 悄悄漂移。
  const exprDoc = DOCS.get("https://lcp.dev/schema/0.1/common.schema.json").$defs.Expr;
  const derived = {};
  for (const br of exprDoc.oneOf) {
    const head = (br.required || []).find((k) => Object.prototype.hasOwnProperty.call(EXPR_HEADS, k));
    if (!head) {
      report("error", "L3", `schema/common.schema.json`, `Expr.oneOf 的 ${br.title} 分支找不到已知头键（必须是 ${Object.keys(EXPR_HEADS).join(" / ")} 之一）`);
      continue;
    }
    derived[head] = Object.keys(br.properties || {}).filter((k) => k !== head);
  }
  const sigOf = (o) => Object.keys(o).sort().map((k) => `${k}(${[...o[k]].sort().join("+")})`).join(" , ");
  if (sigOf(derived) !== sigOf(EXPR_HEADS)) {
    report("error", "L3", `schema/common.schema.json`, `Expr 算子表不一致：schema=[${sigOf(derived)}] / 校验器 EXPR_HEADS=[${sigOf(EXPR_HEADS)}]`);
  }
  const regOps = [...OP_NAMES].sort().join(",");
  const schOps = Object.keys(derived).sort().join(",");
  if (regOps !== schOps) {
    report("error", "L3", `schema/expression-registry.json`, `operators [${regOps}] 与 Expr.oneOf 的头键 [${schOps}] 不一致`);
  }

  // ---- 语义层贯穿：所有可寻址对象 def 都必须预留 semantic（AI 生成与自然语言检索的锚点）
  const SEM_EXEMPT = new Set(["Semantic", "Checksum", "ArtifactRef"]);
  for (const [fid, doc] of DOCS) {
    const short = fid.split("/").pop();
    for (const [name, def] of Object.entries(doc.$defs || {})) {
      if (SEM_EXEMPT.has(name)) continue;
      if (def.type !== "object" || !def.properties || def.additionalProperties !== false) continue;
      if (!def.properties.semantic) report("error", "L3", `schema/${short}`, `$defs.${name} 是可寻址对象却没有 semantic 字段（语义层必须贯穿）`);
    }
  }

  // ---- Expr 取值根 pattern 必须与 expression-registry.valueRoots 完全一致（「四处齐改」的机器守卫）
  const refPat = DOCS.get("https://lcp.dev/schema/0.1/common.schema.json").$defs.Expr.oneOf.find((b) => b.title === "Reference").properties.$ref.pattern;
  const patRoots = new Set((/\^\\\$\(([^)]+)\)/.exec(refPat)?.[1] || "").split("|").map((s) => "$" + s));
  for (const r of ROOTS.keys()) if (!patRoots.has(r)) report("error", "L3", `schema/common.schema.json`, `取值根 ${r} 在 expression-registry.valueRoots 内，但 Expr.$ref 的 pattern 没放行`);
  for (const r of patRoots) if (!ROOTS.has(r)) report("error", "L3", `schema/common.schema.json`, `Expr.$ref 的 pattern 放行了取值根 ${r}，但 expression-registry.valueRoots 内没有它`);
}

// ============================================================ 报告
const ICON = { error: "x", warn: "!" };
function printReport() {
  const byCheck = new Map();
  for (const d of SINK) {
    if (!byCheck.has(d.check)) byCheck.set(d.check, []);
    byCheck.get(d.check).push(d);
  }
  for (const lv of ["error", "warn"]) {
    const groups = [...byCheck.entries()].filter(([, v]) => v.some((d) => d.level === lv));
    if (groups.length === 0) continue;
    console.log(`\n${lv === "error" ? "错误" : "警告"}（${groups.reduce((n, [, v]) => n + v.filter((d) => d.level === lv).length, 0)}）`);
    for (const [check, list] of groups) {
      const hits = list.filter((d) => d.level === lv);
      console.log(`  [${ICON[lv]}] ${check}  (${hits.length})`);
      const shown = hits.slice(0, Number(process.env.LCP_MAX_DETAIL ?? 8));
      for (const d of shown) console.log(`      ${d.where}\n        ${d.message}`);
      if (hits.length > shown.length) console.log(`      ... 另有 ${hits.length - shown.length} 条同类问题（LCP_MAX_DETAIL 可调）`);
    }
  }
}

// ============================================================ main
function main() {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : fs.readdirSync(DIR.examples).filter((f) => f.endsWith(".bundle.json")).map((f) => path.join(DIR.examples, f));
  if (files.length === 0) { console.error("没有找到待校验的 bundle"); process.exit(2); }

  checkRegistry();

  const versions = new Set([REG_EXPR.protocolVersion, REG_TYPES.protocolVersion].filter(Boolean));
  if (versions.size > 1) report("error", "L3", "protocolVersion", `注册表之间的 protocolVersion 不一致：${[...versions].join(" vs ")}`);

  for (const f of files) {
    const tag = `${path.basename(f)} `;
    let bundle;
    try { bundle = JSON.parse(fs.readFileSync(f, "utf8")).bundle; }
    catch (e) { report("error", "L1", path.basename(f), `JSON 解析失败：${e.message}`); continue; }
    if (!bundle) { report("error", "L1", path.basename(f), "缺少顶层 { bundle: ... } 信封"); continue; }
    if (versions.size === 1 && bundle.protocolVersion && !versions.has(bundle.protocolVersion)) {
      report("error", "L3", tag + "$.protocolVersion", `bundle.protocolVersion="${bundle.protocolVersion}" 与注册表 "${[...versions][0]}" 不一致`);
    }
    checkBundle(bundle, tag);
    checkLogic(bundle, tag);
    checkGovernance(bundle, tag);
    // 兜底：全量扫一遍表达式，覆盖上面未显式检查的位置
    walk(bundle, (v, ptr) => { if (isExpr(v)) checkExpr(v, tag + ptr, "表达式"); }, "$");
  }

  // 同一处结构违规会被两个视角各报一次：L1 的信封层校验（validate({bundle})）产生 $.bundle.* 指针，
  // 子工件单独校验又产生 $.* 指针。把 $.bundle. 归一后去重，避免同一问题在报告里翻倍，
  // 并保留后出现的「工件视角」指针（它更贴近用户实际编辑的位置）。
  const normDup = (s) => s.replace(/\$\.bundle\./g, "$.");
  const byDiag = new Map();
  for (const d of SINK) {
    const sig = `${d.level}|${d.check}|${normDup(d.where)}|${normDup(d.message)}`;
    byDiag.set(sig, { ...d, where: normDup(d.where), message: normDup(d.message) });
  }
  SINK.length = 0;
  SINK.push(...byDiag.values());

  const errors = SINK.filter((d) => d.level === "error").length;
  const warns = SINK.filter((d) => d.level === "warn").length;

  // 机器可读模式：每行一条诊断，便于 CI / 编辑器 / 后续步骤二次消费
  if (process.env.LCP_JSON) {
    for (const d of SINK) console.log(JSON.stringify({ level: d.level, check: d.check, where: d.where, message: d.message }));
    process.exit(errors ? 1 : 0);
  }

  console.log("LCP Schema Protocol 校验器  ·  " + SCHEMA_FILES.length + " 份 schema  ·  " + REG_COMP.components.length + " 个内置组件  ·  " + Object.keys(REG_TYPES.types).length + " 个 FieldType");
  console.log("校验目标：" + files.map((f) => path.basename(f)).join(", "));
  printReport();
  console.log(`\n合计 ${errors} 个错误 / ${warns} 个警告 → ${errors ? "失败" : "通过"}`);
  process.exit(errors ? 1 : 0);
}

main();
