#!/usr/bin/env node
/**
 * gen-ts.mjs —— 从 6 份 Schema + 2 份注册表生成 TypeScript 类型包。
 *
 * 用法（任意 cwd 均可，路径按脚本自身位置解析）：
 *   node tools/gen-ts.mjs
 *
 * 产物（ts/）：
 *   types.ts     6 份 Schema 的 $defs -> 强类型定义
 *   guards.ts    判别联合的运行时守卫 + 判别器
 *   registry.ts  枚举字面量、type-mapping、表达式注册表（属性面板/AI 提示词的唯一数据源）
 *   index.ts     barrel
 *   README.md    用法与生成规则
 *
 * 不由本脚本生成（手写，脚本只校验其存在）：
 *   expr.ts      common.Expr 的 5 分支手写模型
 *   text.ts      common.Text 的读写工具
 *
 * 生成规则（每条都对应一个设计决策，改这里等于改契约）：
 *  1. 命名：命名空间前缀 + PascalCase，名字已以该前缀开头则不重复加前缀
 *     （ui.UISchema -> UISchema，data.Field -> DataField，logic.Step -> LogicStep）。
 *  2. 纯 $ref 别名定义 -> 生成 type 别名并标 @alias，保留 $defs 与类型的 1:1 映射，
 *     这样 Java/TS 两端 codegen、Code Connect、AI 提示词都能拿到同名类型。
 *  3. 可选性：required 且无 default -> 必填；否则加 ? 并补 | null。
 *     JSON 语义里 null 与「未提供」是两件事，Schema 允许 null，类型就必须允许。
 *  4. 判别联合：分支 properties.type.const 全为字符串 -> 具名成员 interface + 联合，
 *     名字取 const 的 PascalCase（logic.Step 的 23 个变体、DataValidator 的 10 个、
 *     ApiAuth 的 7 个、DataSource 的 5 个）。
 *  5. anyOf 里的 required 约束（「至少提供一个」）-> Base interface 交叉联合，
 *     而不是把字段全变成可选 —— 让 TS 在编译期挡住「url 和 assetRef 都没写」。
 *  6. 内联对象（properties 直接内嵌）-> 具名嵌套 interface，
 *     名字 = 宿主类型 + 属性路径，紧跟宿主定义输出，避免一堆匿名结构。
 *  7. patternProperties（^x- 扩展键）-> [key: string]: unknown 索引签名。
 *  8. 生成结束自检：引用完整性 + 括号配平 + 异常片段扫描。本机无 tsc，
 *     所以自检不是可选项，而是唯一的安全网。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCHEMA_DIR = path.join(ROOT, "schema");
const REGISTRY_DIR = path.join(ROOT, "registry");
const OUT_DIR = path.join(ROOT, "ts");

const FILES = ["common", "data", "ui", "logic", "component", "bundle"];
const NS_PREFIX = {
  common: "Common",
  data: "Data",
  ui: "Ui",
  logic: "Logic",
  component: "Component",
  bundle: "Bundle",
};

/** 手写在 ts/ 下、不由本脚本生成的文件。 */
const HANDWRITTEN = ["expr", "text"];
const HANDWRITTEN_EXPORTS = new Set([
  "Expr",
  "ExprLiteral",
  "ExprReference",
  "ExprFunction",
  "ExprTemplate",
  "ExprConditional",
  "ExprOperator",
]);

/** 手写代替：common.Expr 由 expr.ts 提供，类型名直接叫 Expr。 */
const NAME_OVERRIDE = { "common.Expr": "Expr" };
const NOT_GENERATED = new Set(["common.Expr"]);

const problems = [];
const fail = message => {
  problems.push(message);
};

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

const schemas = {};
for (const file of FILES) schemas[file] = readJson(path.join(SCHEMA_DIR, file + ".schema.json"));
const typeMapping = readJson(path.join(REGISTRY_DIR, "type-mapping.json"));
const componentRegistry = readJson(path.join(REGISTRY_DIR, "builtin-components.json"));
const expressionRegistry = readJson(path.join(SCHEMA_DIR, "expression-registry.json"));

/* ------------------------------------------------------------------ */
/* 1. 类型名分配                                                       */
/* ------------------------------------------------------------------ */

const pascal = value =>
  String(value)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const screaming = value =>
  String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();

const lowerFirst = value => value.charAt(0).toLowerCase() + value.slice(1);

function prefixedName(file, name) {
  const prefix = NS_PREFIX[file];
  return name.toLowerCase().startsWith(prefix.toLowerCase()) ? name : prefix + name;
}

/** "file.Name" -> TS 类型名 */
const TS_NAME = new Map();
for (const file of FILES) {
  for (const name of Object.keys(schemas[file].$defs ?? {})) {
    const key = file + "." + name;
    TS_NAME.set(key, NOT_GENERATED.has(key) ? NAME_OVERRIDE[key] : prefixedName(file, name));
  }
}

const usedNames = new Map();
for (const [key, value] of TS_NAME) {
  if (usedNames.has(value)) fail("类型名冲突：" + value + " 同时来自 " + usedNames.get(value) + " 与 " + key);
  usedNames.set(value, key);
}

let nestedCounter = 0;
function uniqueName(hint) {
  if (!usedNames.has(hint)) {
    usedNames.set(hint, null);
    return hint;
  }
  nestedCounter += 1;
  let candidate = hint + nestedCounter;
  while (usedNames.has(candidate)) {
    nestedCounter += 1;
    candidate = hint + nestedCounter;
  }
  usedNames.set(candidate, null);
  return candidate;
}

function refFileOf(ref) {
  const hashIndex = ref.indexOf("#");
  const filePart = ref.slice(0, hashIndex);
  if (filePart === "") return null;
  const matched = /\/([A-Za-z0-9_.-]+)\.schema\.json$/.exec(filePart);
  if (matched === null) throw new Error("无法解析的 $ref 基址：" + ref);
  return matched[1];
}

function refTargetOf(ref, currentFile) {
  const hashIndex = ref.indexOf("#");
  const pointer = ref.slice(hashIndex + 1);
  if (!pointer.startsWith("/$defs/")) throw new Error("无法解析的 $ref 指针：" + ref);
  const file = refFileOf(ref) ?? currentFile;
  const name = pointer.slice("/$defs/".length);
  if (!schemas[file] || !schemas[file].$defs[name]) throw new Error("$ref 指向不存在的定义：" + ref);
  return { file, name, key: file + "." + name };
}

function resolveRef(ref, currentFile) {
  const target = refTargetOf(ref, currentFile);
  if (!TS_NAME.has(target.key)) throw new Error("$ref 指向未纳入类型表的定义：" + ref);
  return TS_NAME.get(target.key);
}

/* ------------------------------------------------------------------ */
/* 2. 文档注释                                                         */
/* ------------------------------------------------------------------ */

const escapeDoc = text =>
  String(text)
    .replace(/\*\//g, "*\\/")
    .split("\n")
    .map(line => " * " + line.replace(/\s+$/, ""))
    .join("\n");

function docComment(node, extraNotes) {
  const notes = [];
  if (node.description) notes.push(node.description);
  if (Array.isArray(extraNotes)) notes.push(...extraNotes);
  if (node.const !== undefined) notes.push("@const " + JSON.stringify(node.const));
  if (node.default !== undefined) notes.push("@default " + JSON.stringify(node.default));
  if (node.pattern !== undefined) notes.push("@pattern " + node.pattern);
  if (node.format !== undefined) notes.push("@format " + node.format);
  if (node.minimum !== undefined) notes.push("@minimum " + node.minimum);
  if (node.maximum !== undefined) notes.push("@maximum " + node.maximum);
  if (node.minLength !== undefined) notes.push("@minLength " + node.minLength);
  if (node.maxLength !== undefined) notes.push("@maxLength " + node.maxLength);
  if (node.minItems !== undefined) notes.push("@minItems " + node.minItems);
  if (Array.isArray(node.examples) && node.examples.length > 0) notes.push("@example " + JSON.stringify(node.examples[0]));
  if (notes.length === 0) return "";
  return "/**\n" + escapeDoc(notes.join("\n")) + "\n */";
}

/* ------------------------------------------------------------------ */
/* 3. 类型表达式                                                       */
/* ------------------------------------------------------------------ */

const referenced = new Set();
const definedNames = new Set();
const nestedByOwner = new Map();
const nestedNameByHint = new Map();

const identKey = name => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name));

function literalOf(value) {
  if (value === undefined) return "undefined";
  const text = JSON.stringify(value);
  return text === undefined ? "unknown" : text;
}

const needsParens = type => type.includes(" | ") || type.includes(" & ") || type.includes("=>");

/**
 * 联合体渲染。block=true 时对超过 3 个成员或过长的联合启用前导竖线多行格式，
 * 让 23 个 Step 变体的联合在 diff 里逐行可读，而不是挤成一整行。
 */
function renderUnion(members, options) {
  const unique = [...new Set(members)];
  const joined = unique.join(" | ");
  const block = options?.block === true;
  const indent = options?.indent ?? "";
  const prefix = options?.prefix ?? "";
  if (!block) return prefix + joined;
  if (unique.length <= 3 && indent.length + joined.length <= 100) return prefix + joined;
  return "\n" + unique.map(member => indent + "  | " + member).join("\n");
}

const SCALARS = { string: "string", number: "number", integer: "number", boolean: "boolean", null: "null" };

function typeExpr(node, file, ownerKey, hint) {
  if (node === null || node === undefined || typeof node !== "object") return "unknown";
  if (node.$ref) {
    const name = resolveRef(node.$ref, file);
    referenced.add(name);
    return name;
  }
  if (node.const !== undefined) return literalOf(node.const);
  if (node.enum) return renderUnion(node.enum.map(literalOf));
  if (node.oneOf) return renderUnion(node.oneOf.map((branch, index) => typeExpr(branch, file, ownerKey, hint + "Alt" + (index + 1))));
  if (node.anyOf) return renderUnion(node.anyOf.map((branch, index) => typeExpr(branch, file, ownerKey, hint + "Alt" + (index + 1))));
  if (node.allOf) return node.allOf.map(branch => typeExpr(branch, file, ownerKey, hint)).join(" & ");

  const declared = node.type;
  if (Array.isArray(declared)) {
    // 多类型声明（common.Value 是 with ["string","number","integer","boolean","object","array","null"]）。
    // 注意不能把 object/array 也落到 "unknown" —— unknown 在联合里会吸收其它成员，
    // 整个类型会退化成 unknown，绑定值的类型检查就彻底失效了。
    return renderUnion(
      declared.map(item => {
        if (item === "object") return "Record<string, unknown>";
        if (item === "array") return "unknown[]";
        return SCALARS[item] ?? "unknown";
      }),
    );
  }

  if (declared === "array") {
    const inner = typeExpr(node.items ?? {}, file, ownerKey, hint + "Item");
    return needsParens(inner) ? "(" + inner + ")[]" : inner + "[]";
  }

  if (declared === "object" || node.properties || node.additionalProperties !== undefined) {
    if (node.properties && Object.keys(node.properties).length > 0) return namedObjectType(node, file, ownerKey, hint);
    const additional = node.additionalProperties;
    if (additional === undefined || additional === true) return "Record<string, unknown>";
    if (additional === false) return "Record<string, never>";
    return "Record<string, " + typeExpr(additional, file, ownerKey, hint + "Value") + ">";
  }

  if (declared !== undefined) return SCALARS[declared] ?? "unknown";
  return "unknown";
}

/**
 * 内联对象 -> 具名嵌套 interface。
 * 用 ownerKey+hint 做记忆化：同一个属性在「属性声明处」和「anyOf 约束处」会被访问两次，
 * 必须复用同一个名字，否则会生成两个内容相同、名字不同的类型。
 */
function namedObjectType(node, file, ownerKey, hint) {
  const memoKey = ownerKey + "|" + hint;
  const existing = nestedNameByHint.get(memoKey);
  if (existing !== undefined) return existing;
  const name = uniqueName(hint);
  definedNames.add(name);
  nestedNameByHint.set(memoKey, name);
  if (!nestedByOwner.has(ownerKey)) nestedByOwner.set(ownerKey, []);
  nestedByOwner.get(ownerKey).push(() => renderObjectDeclaration(name, node, file, ownerKey));
  return name;
}

/* ------------------------------------------------------------------ */
/* 4. object -> interface / Record                                     */
/* ------------------------------------------------------------------ */

function renderProperties(node, file, ownerKey, holderName) {
  const required = new Set(node.required ?? []);
  const lines = [];
  for (const [propName, propSchema] of Object.entries(node.properties ?? {})) {
    const isRequired = required.has(propName) && propSchema.default === undefined;
    const type = typeExpr(propSchema, file, ownerKey, holderName + pascal(propName));
    const doc = docComment(propSchema, undefined);
    if (doc) lines.push("  " + doc.split("\n").join("\n  "));
    lines.push("  " + identKey(propName) + (isRequired ? "" : "?") + ": " + type + (isRequired ? "" : " | null") + ";");
  }
  const patternKeys = node.patternProperties ? Object.keys(node.patternProperties) : [];
  if (lines.length > 0 && patternKeys.length > 0) lines.push("");
  for (const patternKey of patternKeys) {
    lines.push("  /** 扩展键：匹配 " + patternKey + " 的额外属性，平台原样透传，不参与校验 */");
    lines.push("  [key: string]: unknown;");
  }
  return lines;
}

function renderObjectDeclaration(tsName, node, file, ownerKey) {
  const lines = renderProperties(node, file, ownerKey, tsName);
  const doc = docComment(node, undefined);
  const body = [];
  if (doc) body.push(doc);
  if (lines.length === 0) {
    const additional = node.additionalProperties;
    body.push("export type " + tsName + " = " + (additional === false ? "Record<string, never>" : "Record<string, unknown>") + ";");
    return body.join("\n");
  }
  body.push("export interface " + tsName + " {");
  body.push(...lines);
  body.push("}");
  return body.join("\n");
}

/* ------------------------------------------------------------------ */
/* 5. 联合体分析（判别联合 / 引用联合 / 结构联合）                      */
/* ------------------------------------------------------------------ */

const unionInfo = new Map();

/** 取分支的判别键与判别值。先看 type，其次 kind / mode / op（当前 Schema 只用 type）。 */
function discriminantOf(branch, file) {
  let node = branch;
  if (branch.$ref) {
    const target = refTargetOf(branch.$ref, file);
    node = schemas[target.file].$defs[target.name];
  }
  const properties = node.properties ?? {};
  for (const key of ["type", "kind", "mode", "op"]) {
    const candidate = properties[key];
    if (candidate && typeof candidate.const === "string") return { key, value: candidate.const };
  }
  return { key: null, value: null };
}

for (const file of FILES) {
  for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
    if (!node.oneOf) continue;
    const discriminants = node.oneOf.map(branch => discriminantOf(branch, file));
    const discriminated = discriminants.length > 1 && discriminants.every(item => item.key !== null && typeof item.value === "string");
    unionInfo.set(file + "." + name, { discriminated, discriminants });
  }
}

/* ------------------------------------------------------------------ */
/* 6. 生成 types.ts                                                    */
/* ------------------------------------------------------------------ */

const blocks = [];

function unionMemberName(ownerTsName, branch, index) {
  if (branch.title) return ownerTsName + pascal(branch.title);
  const constValue = branch.properties?.type?.const;
  if (typeof constValue === "string") return ownerTsName + pascal(constValue);
  const required = branch.required;
  if (Array.isArray(required) && required.length > 0) return ownerTsName + pascal(required[0]);
  return ownerTsName + "Variant" + (index + 1);
}

/** 收集分支约束：anyOf 里只含 required 的合法子句 -> Base & ({a} | {b})。 */
function branchConstraints(node, file, ownerKey, tsName) {
  const source = node.anyOf;
  if (!node.properties || !source) return null;
  const clauses = [];
  for (const branch of source) {
    const keys = branch.required;
    if (!Array.isArray(keys) || keys.length === 0) return null;
    if (Object.keys(branch).some(branchKey => branchKey !== "required")) return null;
    const parts = keys.map(
      propName => identKey(propName) + ": " + typeExpr(node.properties[propName] ?? {}, file, ownerKey, tsName + pascal(propName)),
    );
    clauses.push("{ " + parts.join("; ") + " }");
  }
  return clauses;
}

function flush(file, ownerKey, local) {
  blocks.push({ file, key: ownerKey, lines: local });
  const nestedThunks = nestedByOwner.get(ownerKey);
  if (nestedThunks) {
    for (const thunk of nestedThunks) blocks.push({ file, key: ownerKey, lines: [thunk()] });
    nestedByOwner.delete(ownerKey);
  }
}

function emitDef(file, name) {
  const key = file + "." + name;
  if (NOT_GENERATED.has(key)) return;
  const node = schemas[file].$defs[name];
  const tsName = TS_NAME.get(key);
  const ownerKey = key;
  const local = [];
  definedNames.add(tsName);

  if (Object.keys(node).length === 1 && typeof node.$ref === "string") {
    const target = resolveRef(node.$ref, file);
    referenced.add(target);
    local.push("/** @alias 该定义是 " + target + " 的别名，不引入新结构。 */");
    local.push("export type " + tsName + " = " + target + ";");
    flush(file, ownerKey, local);
    return;
  }

  if (node.oneOf) {
    const info = unionInfo.get(key);
    const members = [];
    node.oneOf.forEach((branch, index) => {
      if (branch.$ref) {
        const target = resolveRef(branch.$ref, file);
        referenced.add(target);
        members.push(target);
        return;
      }
      if (branch.properties && Object.keys(branch.properties).length > 0) {
        const hint = unionMemberName(tsName, branch, index);
        const memberName = uniqueName(hint);
        definedNames.add(memberName);
        // 必须登记到 nestedNameByHint：guards.ts 那一趟要靠同一个键把成员名找回来，
        // 否则会静默地漏掉整个联合的所有成员守卫（第一版就漏了 DataValidator/ApiAuth/HandlerRef）。
        nestedNameByHint.set(key + "|" + hint, memberName);
        local.push(renderObjectDeclaration(memberName, branch, file, ownerKey));
        local.push("");
        members.push(memberName);
        return;
      }
      members.push(typeExpr(branch, file, ownerKey, tsName + "Variant" + (index + 1)));
    });
    const doc = docComment(node, info?.discriminated ? ["@discriminant properties.type"] : undefined);
    if (doc) local.push(doc);
    // 块状联合的分号必须显式补上：renderUnion 只负责 " | " 换行缩进，不管语句终结符。
    local.push("export type " + tsName + " =" + renderUnion(members, { block: true, prefix: " " }) + ";");
    flush(file, ownerKey, local);
    return;
  }

  const clauses = branchConstraints(node, file, ownerKey, tsName);
  if (clauses && clauses.length > 0) {
    const baseName = uniqueName(tsName + "Base");
    definedNames.add(baseName);
    local.push(renderObjectDeclaration(baseName, node, file, ownerKey));
    local.push("");
    const doc = docComment(node, [
      "@constraint 以下字段组至少提供一组：" + node.anyOf.map(branch => (branch.required ?? []).join(" + ")).join(" 或 "),
    ]);
    if (doc) local.push(doc);
    local.push("export type " + tsName + " = " + baseName + " & (" + clauses.join(" | ") + ");");
    flush(file, ownerKey, local);
    return;
  }

  if (node.type === "object" || node.properties) {
    local.push(renderObjectDeclaration(tsName, node, file, ownerKey));
    flush(file, ownerKey, local);
    return;
  }

  if (node.enum) {
    const doc = docComment(node, undefined);
    if (doc) local.push(doc);
    local.push("export type " + tsName + " =" + renderUnion(node.enum.map(literalOf), { block: true, prefix: " " }) + ";");
    flush(file, ownerKey, local);
    return;
  }

  if (Array.isArray(node.type) || typeof node.type === "string") {
    const doc = docComment(node, undefined);
    if (doc) local.push(doc);
    local.push("export type " + tsName + " = " + typeExpr(node, file, ownerKey, tsName) + ";");
    flush(file, ownerKey, local);
    return;
  }

  fail("未处理的 $defs 形态：" + key);
}

for (const file of FILES) {
  for (const name of Object.keys(schemas[file].$defs ?? {})) emitDef(file, name);
}

const missingRefs = [...referenced].filter(name => !definedNames.has(name) && !HANDWRITTEN_EXPORTS.has(name));
if (missingRefs.length > 0) fail("引用完整性失败，未定义的类型：" + missingRefs.join(", "));

const TS_HEADER_LINES = [
  "/**",
  " * LCP Schema Protocol v0.1 —— 由 6 份 JSON Schema 生成的类型定义。",
  " *",
  " * 本文件由 tools/gen-ts.mjs 生成，请勿手工修改 —— 先改 Schema，再重新生成：",
  " *   node tools/gen-ts.mjs",
  " *",
  " * 覆盖 6 个命名空间：Common(common) / Data(data) / Ui(ui) / Logic(logic) /",
  " * Component(component) / Bundle(bundle)。跨文件 $ref（含 https://lcp.dev 绝对形式）",
  " * 已全部解析为本地类型名。",
  " *",
  " * 手写部分不在本文件：",
  " *   expr.ts  common.Expr 的 5 分支模型（$lit / $ref / $fn / $tpl / $if）",
  " *   text.ts  common.Text 的多语言读写",
  " */",
  'import type { Expr } from "./expr";',
  "",
  'export type { Expr } from "./expr";',
  "",
];
const TS_HEADER = TS_HEADER_LINES.join("\n");

const typesBody = [];
let currentFile = null;
for (const block of blocks) {
  if (block.file !== currentFile) {
    currentFile = block.file;
    const defCount = Object.keys(schemas[block.file].$defs ?? {}).length;
    const rule = "/* " + "=".repeat(72) + " */";
    typesBody.push("");
    typesBody.push(rule);
    typesBody.push("/* " + block.file + ".schema.json —— " + defCount + " 个定义，命名空间前缀 " + NS_PREFIX[block.file] + " */");
    typesBody.push(rule);
  }
  typesBody.push("");
  typesBody.push(...block.lines);
}
const typesText = TS_HEADER + typesBody.join("\n") + "\n";

/* ------------------------------------------------------------------ */
/* 7. 生成 guards.ts                                                   */
/* ------------------------------------------------------------------ */

const guardsImports = new Set();
const guardBlocks = [];

/** 把分支解析成「成员类型名 + 判别值 + 结构键」三元组，判别联合与结构联合共用。 */
function collectUnionMembers(file, key, tsName, node) {
  const members = [];
  node.oneOf.forEach((branch, index) => {
    if (branch.$ref) {
      const target = refTargetOf(branch.$ref, file);
      const targetNode = schemas[target.file].$defs[target.name];
      const required = targetNode.required ?? [];
      const discriminant = discriminantOf(branch, file);
      members.push({
        tsName: resolveRef(branch.$ref, file),
        constValue: discriminant.value,
        requiredKey: required.length === 1 ? required[0] : null,
        objectLike: true,
        primitive: null,
      });
      return;
    }
    if (branch.properties && Object.keys(branch.properties).length > 0) {
      const memberName = nestedNameByHint.get(key + "|" + unionMemberName(tsName, branch, index)) ?? null;
      const required = branch.required ?? [];
      members.push({
        tsName: memberName,
        constValue: typeof branch.properties?.type?.const === "string" ? branch.properties.type.const : null,
        requiredKey: required.length === 1 ? required[0] : null,
        objectLike: true,
        primitive: null,
      });
      return;
    }
    members.push({ tsName: null, constValue: null, requiredKey: null, objectLike: false, primitive: typeExpr(branch, file, key, tsName) });
  });
  return members;
}

for (const file of FILES) {
  for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
    if (!node.oneOf) continue;
    const key = file + "." + name;
    // 手写代替的联合（common.Expr）在 types.ts 里就没有成员类型，这里只留指针。
    if (NOT_GENERATED.has(key)) {
      guardBlocks.push("");
      guardBlocks.push("/* " + key + " —— 分支模型手写在 expr.ts，用 isExpr / isStrictExpr 判定 */");
      continue;
    }
    const tsName = TS_NAME.get(key);
    const info = unionInfo.get(key);
    const members = collectUnionMembers(file, key, tsName, node);
    const lines = [];

    if (info.discriminated) {
      const values = members.map(member => member.constValue).filter(value => typeof value === "string");
      const constName = screaming(tsName) + "_TYPE_VALUES";
      const typeName = screaming(tsName) + "_TYPE";
      lines.push("/** 全部 type 判别值，顺序与 Schema 分支顺序一致。 */");
      lines.push("export const " + constName + " = [" + values.map(literalOf).join(", ") + "] as const;");
      lines.push("");
      lines.push("export type " + typeName + " = (typeof " + constName + ")[number];");
      lines.push("");
      lines.push("/** 宽松判定：结构像 + type 命中任一判别值。运行时入口用这个，不要用 as 强转。 */");
      lines.push("export function is" + tsName + "(value: unknown): value is " + tsName + " {");
      lines.push('  return isPlainRecord(value) && typeof value["type"] === "string" && (' + constName + ' as readonly string[]).indexOf(value["type"] as string) >= 0;');
      lines.push("}");
      lines.push("");
      lines.push("/** 取判别值。调用前请先用 is" + tsName + " 收窄，否则拿不到精确类型。 */");
      lines.push("export function " + lowerFirst(tsName) + "Type(value: " + tsName + "): " + typeName + " {");
      lines.push("  return value.type as " + typeName + ";");
      lines.push("}");
      guardsImports.add(tsName);
      for (const member of members) {
        if (member.tsName === null || typeof member.constValue !== "string") continue;
        guardsImports.add(member.tsName);
        lines.push("");
        lines.push("export function is" + member.tsName + "(value: " + tsName + "): value is " + member.tsName + " {");
        lines.push("  return value.type === " + literalOf(member.constValue) + ";");
        lines.push("}");
      }
    } else {
      for (const member of members) {
        if (member.objectLike && member.tsName !== null) {
          guardsImports.add(tsName);
          guardsImports.add(member.tsName);
          // 必须用带引号的字面量：required 键可能是保留字（common.Text 的 default），
          // 裸写 `default in value` 是语法错误。接口属性名不受此限，所以这里不能用 identKey。
          const test = member.requiredKey !== null ? literalOf(member.requiredKey) + " in value" : "true";
          lines.push("export function is" + member.tsName + "(value: " + tsName + "): value is " + member.tsName + " {");
          lines.push("  return isPlainRecord(value) && " + test + ";");
          lines.push("}");
          lines.push("");
        } else if (member.primitive !== null) {
          guardsImports.add(tsName);
          const guardName = "is" + tsName + pascal(member.primitive);
          lines.push("export function " + guardName + "(value: " + tsName + "): value is " + member.primitive + " {");
          lines.push("  return typeof value === " + literalOf(member.primitive) + ";");
          lines.push("}");
          lines.push("");
        }
      }
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    }

    guardBlocks.push("");
    guardBlocks.push("/* " + key + " —— " + (info.discriminated ? "判别联合，" + members.length + " 个变体" : "结构联合，" + members.length + " 个变体") + " */");
    guardBlocks.push(...lines);
  }
}

const guardsHeaderLines = [
  "/**",
  " * 运行时类型守卫与判别器 —— 由 tools/gen-ts.mjs 生成，请勿手工修改。",
  " *",
  " * 定位：给「元数据运行时」用，不是给业务代码用的。BFF 聚合层、前端运行时渲染器、",
  " * 自定义组件沙箱宿主、出码引擎拿到的都是 unknown（来自 JSON / HTTP / postMessage），",
  " * 进入强类型世界之前先过这里。",
  " *",
  " * 边界：只做结构判定，不做语义校验 —— 函数是否存在、字段是否在实体上、",
  " * 权限动作是否合法，都属于 L2/L3 校验（tools/validate.mjs）的职责。",
  " *",
  " * 用法：",
  " *   if (!isLogicStep(raw)) throw new Error(\"不是合法的步骤\");",
  " *   switch (logicStepType(raw)) { case \"apiCall\": ... }",
  " */",
  'import type {',
];
for (const name of [...guardsImports].sort()) guardsHeaderLines.push("  " + name + ",");
guardsHeaderLines.push('} from "./types";');
guardsHeaderLines.push("");
guardsHeaderLines.push("/** 纯对象判定：排除 null 与数组。所有字段型守卫的第一步。 */");
guardsHeaderLines.push("export function isPlainRecord(value: unknown): value is Record<string, unknown> {");
guardsHeaderLines.push('  return typeof value === "object" && value !== null && !Array.isArray(value);');
guardsHeaderLines.push("}");
guardsHeaderLines.push("");
guardsHeaderLines.push("/** 穷尽检查：switch 漏掉联合成员时编译期报错。 */");
guardsHeaderLines.push("export function assertNever(value: never, hint?: string): never {");
guardsHeaderLines.push('  throw new Error("unreachable union member" + (hint === undefined ? "" : " (" + hint + ")") + ": " + JSON.stringify(value));');
guardsHeaderLines.push("}");

const guardsText = guardsHeaderLines.concat(guardBlocks, [""]).join("\n") + "\n";

/* ------------------------------------------------------------------ */
/* 8. 生成 registry.ts                                                 */
/* ------------------------------------------------------------------ */

/**
 * 解析枚举的来源，返回 { constName, values } 或 null。
 * 三种形态都要支持：
 *   ① $defs 级 enum（data.FieldType）—— 已生成 <NAME>_VALUES 常量
 *   ② properties.type.enum（内联枚举）—— 需要就地生成常量
 *   ③ properties.type.$ref 指向 ①（data.ValueType.type -> FieldType）—— 复用 ① 的常量
 * 第 ③ 种是坑：ValueType 看起来是个「值类型」，其实 type 字段直接复用了 FieldType 的 19 项，
 * 如果这里不复用而是复制一份字面量，两处就会各自漂移。
 */
function resolveEnumSource(file, name, depth) {
  if ((depth ?? 0) > 8) return null;
  const node = schemas[file]?.$defs?.[name];
  if (!node) return null;
  if (node.enum) return { constName: screaming(TS_NAME.get(file + "." + name)) + "_VALUES", values: node.enum };
  const typeNode = node.properties?.type;
  if (typeNode && Array.isArray(typeNode.enum)) return { constName: null, values: typeNode.enum };
  if (typeNode && typeNode.$ref) {
    const target = refTargetOf(typeNode.$ref, file);
    return resolveEnumSource(target.file, target.name, (depth ?? 0) + 1);
  }
  return null;
}

const enumDefs = [];
for (const file of FILES) {
  for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
    if (!node.enum) continue;
    enumDefs.push({ file, name, tsName: TS_NAME.get(file + "." + name), values: node.enum, description: node.description });
  }
}

const registryLines = [];
const push = (...lines) => registryLines.push(...lines);

push("/**");
push(" * 平台注册表 —— 由 tools/gen-ts.mjs 生成，请勿手工修改。");
push(" *");
push(" * 这是「设计器属性面板 / 前端运行时 / 出码引擎 / AI 生成器」四方共用的数据源：");
push(" * 枚举字面量来自各 Schema 的 enum，FieldType 映射来自 registry/type-mapping.json，");
push(" * 表达式语义来自 schema/expression-registry.json。这里只做类型化再导出，不复制语义。");
push(" */");
push('import type { ComponentContract, DataFieldType } from "./types";');
push("");
push("/** 协议版本。Schema / Bundle / 注册表三者必须一致，L1 校验会比对。 */");
push("export const PROTOCOL_VERSION = " + literalOf(expressionRegistry.protocolVersion) + ";");
push("");
push("/** 内置组件注册表版本。AppBundle 声明依赖的版本号与此比对。 */");
push("export const COMPONENT_REGISTRY_VERSION = " + literalOf(componentRegistry.registryVersion) + ";");
push("");
push("/* ---------------- 枚举字面量（唯一来源：各 Schema 的 enum 定义） ---------------- */");

for (const item of enumDefs) {
  push("");
  push("/** " + item.tsName + (item.description ? " —— " + item.description : "") + " */");
  push("export const " + screaming(item.tsName) + "_VALUES = [");
  for (const value of item.values) push("  " + literalOf(value) + ",");
  push("] as const;");
}

const valueTypeSource = resolveEnumSource("data", "ValueType");
if (valueTypeSource === null) {
  fail("data.ValueType 的 type 字段既不是枚举也不指向枚举，VALUE_TYPE_VALUES 无法生成");
} else if (valueTypeSource.constName !== null) {
  push("");
  push("/** 列值类型。它复用 FieldType 的取值域，这里只做别名，不复制字面量。 */");
  push("export const VALUE_TYPE_VALUES = " + valueTypeSource.constName + ";");
} else {
  push("");
  push("/** data.ValueType.properties.type 的内联枚举。 */");
  push("export const VALUE_TYPE_VALUES = [");
  for (const value of valueTypeSource.values) push("  " + literalOf(value) + ",");
  push("] as const;");
}

/** 短别名：写业务代码与出码模板时少敲几个前缀。 */
const SHORT_ALIASES = [
  ["FIELD_TYPES", "data", "FieldType", "字段类型 19 项，与 DataSchema FieldType 一致。"],
  ["FIELD_VALUE_TYPES", "data", "ValueType", "字段值类型（对齐 SQL 列类型）。"],
  ["PAGE_KINDS", "ui", "PageKind", "页面种类。"],
  ["COMPONENT_KINDS", "component", "ComponentKind", "组件种类。"],
  ["PROP_TYPES", "component", "PropType", "组件属性类型（PropDef.type 的取值域）。"],
  ["SCOPES", "common", "Scope", "元数据作用域：platform / tenant / app。"],
  ["BREAKPOINT_KEYS", "common", "BreakpointKey", "响应式断点键，与 UISchema.responsive 一致。"],
];

push("");
push("/* ---------------- 常用枚举的短别名 ---------------- */");
for (const [alias, file, name, doc] of SHORT_ALIASES) {
  const source = resolveEnumSource(file, name);
  if (source === null) {
    fail("短别名 " + alias + " 的来源 " + file + "." + name + " 不是枚举");
    continue;
  }
  push("/** " + doc + " */");
  if (source.constName !== null) {
    push("export const " + alias + " = " + source.constName + ";");
  } else {
    push("export const " + alias + " = [" + source.values.map(literalOf).join(", ") + "] as const;");
  }
}

push("");
push("/* ---------------- FieldType -> 存储 / TS / Java / 控件 四向映射 ---------------- */");
push("/**");
push(" * 一处定义，四处消费：");
push(" *   pg       建表 DDL 与索引策略（DDL 生成器读）");
push(" *   ts       出码引擎生成的实体类型（TS 侧）");
push(" *   java     Jackson DTO 字段类型（Java 侧，imports 用于自动补 import）");
push(" *   widget   设计器默认控件与列表渲染器");
push(" *   semantic 语义意图，喂给 AI 生成器做字段推荐");
push(" */");
push("export const FIELD_TYPE_MAPPING = " + JSON.stringify(typeMapping.types, null, 2) + " as const;");
push("");
push("/** 单条 FieldType 映射的形状。 */");
push("export type FieldTypeMapping = (typeof FIELD_TYPE_MAPPING)[DataFieldType];");
push("");
push("/** FieldType 覆盖度自检用：键列表必须与 FIELD_TYPES 完全一致。 */");
push("export const MAPPED_FIELD_TYPES = Object.keys(FIELD_TYPE_MAPPING) as DataFieldType[];");
push("");
push("/** 建表 / 命名 / 精度等约定，出码引擎与 DDL 生成器共用。 */");
push("export const TYPE_MAPPING_CONVENTIONS = " + JSON.stringify(typeMapping.conventions, null, 2) + " as const;");
push("");
push("/** 数组字段的元素控件推荐（array<image> 自动落 x-upload 的依据之一）。 */");
push("export const ARRAY_ITEM_WIDGETS = " + JSON.stringify(typeMapping.arrayItemWidgets, null, 2) + " as const;");
push("");
push("/** SQL 类型推导规则（长度/精度/索引的前置判断）。 */");
push("export const SQL_TYPE_RULES = " + JSON.stringify(typeMapping.sqlTypeRules, null, 2) + " as const;");
push("");
push("/** 出码引擎的生成提示（模板选择、import 生成）。 */");
push("export const GENERATOR_HINTS = " + JSON.stringify(typeMapping.generatorHints, null, 2) + " as const;");

push("");
push("/* ---------------- 表达式注册表（前后端 + Flowable 共用的唯一解释器语义） ---------------- */");
for (const [key, constName] of [
  ["operators", "EXPRESSION_OPERATORS"],
  ["valueRoots", "EXPRESSION_VALUE_ROOTS"],
  ["functions", "EXPRESSION_FUNCTIONS"],
  ["queryOperators", "EXPRESSION_QUERY_OPERATORS"],
  ["types", "EXPRESSION_VALUE_TYPES"],
]) {
  push("");
  push("export const " + constName + " = " + JSON.stringify(expressionRegistry[key], null, 2) + " as const;");
}
push("");
push("/** 函数名清单，供校验器做 O(1) 命中查询。 */");
push("export const EXPRESSION_FUNCTION_NAMES: readonly string[] = EXPRESSION_FUNCTIONS.map(item => item.name);");
push("");
push("/** 函数分类清单，供属性面板分组展示。 */");
push("export const EXPRESSION_FUNCTION_CATEGORIES: readonly string[] = Array.from(new Set(EXPRESSION_FUNCTIONS.map(item => item.cat)));");
push("");
push("/**");
push(" * 注册表里的约定性说明。AI 生成器可直接拼进 system prompt ——");
push(" * 这几段是「模型最容易生成错、且错了最难查」的规则，值得反复投喂。");
push(" */");
push(
  "export const EXPRESSION_DOCS = " +
    JSON.stringify(
      {
        description: expressionRegistry.description,
        statePathConvention: expressionRegistry.statePathConvention,
        pageHandlerConvention: expressionRegistry.pageHandlerConvention,
        assignToConvention: expressionRegistry.assignToConvention,
      },
      null,
      2,
    ) +
    " as const;",
);
push("");
push("/** 取值根文档（$user / $page / $row ...）。fields 供设计器变量选择器自动补全。 */");
push("export type ExprValueRootDoc = (typeof EXPRESSION_VALUE_ROOTS)[number];");
push("");
push("/** 注册表函数文档。AI 生成器据此约束可用函数名与实参个数。 */");
push("export type ExprFunctionDoc = (typeof EXPRESSION_FUNCTIONS)[number];");
push("");
push("/** 查询算子文档。前端渲染搜索项、BFF 生成 WHERE、出码生成查询函数三处共用。 */");
push("export type QueryOperatorDoc = (typeof EXPRESSION_QUERY_OPERATORS)[number];");

push("");
push("/* ---------------- 内置组件注册表 ---------------- */");
push("/**");
push(" * 内置组件注册表文件的形状。前端直接 import JSON（Vite 原生支持）：");
push(' *   import builtins from "@lcp/registry/builtin-components.json";');
push(" * 刻意不把 " + componentRegistry.components.length + " 个组件内联成本文件的 TS 常量 —— 它是数据不是代码，");
push(" * 内联会让 TS 语言服务反复对这一文件做字面量推断。");
push(" */");
push("export interface BuiltinComponentsFile {");
push("  $schema?: string;");
push("  protocolVersion: string;");
push("  registryVersion: number;");
push("  title?: string;");
push("  description?: string;");
push("  /** 控件解析优先级：UINode.props.fieldList[].widget > Field.uiHints.widget > itemType 命中 fieldBindings > Field.type 命中 fieldBindings（priority 小者优先）。 */");
push("  fieldBindingRule?: string;");
push("  /** 结构化 prop（columnList / fieldList / searchFieldList / buttonList / optionList / items）的元素契约说明。 */");
push("  itemContractNote?: string;");
push("  components: ComponentContract[];");
push("}");

const registryText = registryLines.join("\n") + "\n";

/* ------------------------------------------------------------------ */
/* 9. 生成 index.ts / README.md                                        */
/* ------------------------------------------------------------------ */

const indexText = [
  "/**",
  " * LCP Schema Protocol v0.1 —— TypeScript 类型包入口。",
  " *",
  " * 消费方与用法：",
  " *   设计器     ComponentContract + PropDef 驱动属性面板；EXPRESSION_FUNCTIONS 驱动表达式编辑器",
  " *   运行时     UISchema / LogicSchema 强类型化；guards.ts 收窄 unknown；isStrictExpr 判表达式",
  " *   出码引擎   FIELD_TYPE_MAPPING 生成实体类型与 DDL；类型形状决定生成联合还是分支",
  " *   BFF        DataSchema 驱动泛化 CRUD 的 JSONB 读写；EXPRESSION_QUERY_OPERATORS 生成 WHERE",
  " *   AI 生成器  同一套类型做约束解码；EXPRESSION_DOCS 直接进 system prompt",
  " */",
  'export * from "./types";',
  'export * from "./expr";',
  'export * from "./text";',
  'export * from "./guards";',
  'export * from "./registry";',
  "",
].join("\n");

const enumTable = enumDefs
  .map(item => "| `" + item.tsName + "` | " + item.values.length + " | " + item.values.map(literalOf).join(", ") + " |")
  .join("\n");

const readmeLines = [
  "# LCP Schema Protocol v0.1 · TypeScript 类型包",
  "",
  "由 `tools/gen-ts.mjs` 从 6 份 Schema + 2 份注册表生成，**生成文件请勿手工修改**。",
  "",
  "```bash",
  "node tools/gen-ts.mjs        # 重新生成 types.ts / guards.ts / registry.ts / index.ts / README.md",
  "```",
  "",
  "## 文件职责",
  "",
  "| 文件 | 来源 | 说明 |",
  "|---|---|---|",
  "| `types.ts` | 生成 | 6 个命名空间全部 `$defs` 的类型定义 |",
  "| `guards.ts` | 生成 | 判别联合的运行时守卫与判别器 |",
  "| `registry.ts` | 生成 | 枚举字面量、FieldType 四向映射、表达式注册表 |",
  "| `index.ts` | 生成 | barrel |",
  "| `expr.ts` | 手写 | `common.Expr` 的 5 分支模型 + 构造器 + 遍历器 |",
  "| `text.ts` | 手写 | `common.Text` 的多语言读写 |",
  "",
  "## 生成规则（改 Schema 前先读）",
  "",
  "1. 类型名 = 命名空间前缀 + PascalCase；名字已以该前缀开头则不重复加前缀。",
  "2. `$defs` 里的纯别名（只有 `$ref`）生成 `type A = B` 并标 `@alias`，保持 Schema 与类型 1:1。",
  "3. 可选性：`required` 且无 `default` 必填；否则加 `?` 并补 `| null`。",
  "4. 分支 `properties.type.const` 全为字符串的 `oneOf` 生成具名成员 interface + 判别联合。",
  "5. 带 `required` 约束的 `anyOf`（至少提供一个）生成 `Base & ({a} | {b})`，不降级成全可选。",
  "6. 内联对象生成具名嵌套 interface，名字 = 宿主类型 + 属性路径，紧跟宿主定义输出。",
  "7. `patternProperties`（`^x-`）生成 `[key: string]: unknown` 索引签名。",
  "",
  "## 枚举清单（`registry.ts` 的 `*_VALUES`）",
  "",
  "| 类型 | 项数 | 值 |",
  "|---|---|---|",
  enumTable,
  "",
  "## 表达式 DSL 要点",
  "",
  "- 头键只有 5 个：`$lit` / `$ref` / `$fn` / `$tpl` / `$if`；修饰键只有 `$fn.$args`、`$if.$then`、`$if.$else`。",
  "- 歧义规则：对象仅当恰好含一个头键、且其余键都是该头键的合法修饰键时才是表达式。",
  "  要写带 `$` 键的对象字面量必须包一层：`{ \"$lit\": { \"$x\": 1 } }`。",
  "- `isExpr` 宽松（命中头键即算，运行时求值器用）；`isStrictExpr` 严格（修饰键也要合法，L1 校验用）。",
  "- 读路径带 `$` 根（`$page.state.x`），写路径是相对路径（`state.x`）。",
  "- `$ctx.result` 只在紧邻下一步有效，下一步执行即被覆盖。",
  "",
  "## 与其它工件的关系",
  "",
  "- `registry/builtin-components.json` 是数据，不内联进本包；前端直接 import JSON，",
  "  用 `BuiltinComponentsFile` 做形状断言。",
  "- `schema/expression-registry.json` 是表达式语义的唯一权威；本包只做类型化再导出。",
  "- 生成的类型是**元数据**的类型，不是业务实体的类型。业务实体类型由出码引擎读",
  "  `FIELD_TYPE_MAPPING` 生成，二者不要混用。",
  "",
];
const readmeText = readmeLines.join("\n");

/* ------------------------------------------------------------------ */
/* 10. 自检 + 写出                                                     */
/* ------------------------------------------------------------------ */

/**
 * 括号配平检查。本机没有 tsc（离线环境装不了），所以生成物没法编译验证，
 * 这里用一个「去注释去字符串后数括号」的粗糙但有效的兜底 —— 它能抓住
 * 90% 的模板拼接错误（少一个 }、多一个 )）。
 */
function balanceCheck(fileName, text) {
  // 单遍扫描：必须同时跟踪字符串与注释，否则 "https://..." 里的 // 会被误判成行注释，
  // JSON 字符串里的 { } 会被误判成代码括号（第一版就踩了这个坑）。
  const stack = [];
  let state = "code";
  let quote = "";
  let round = 0;
  let curly = 0;
  let square = 0;
  let line = 1;
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    const next = text[index + 1];
    if (character === "\n") {
      line += 1;
      if (state === "line-comment") state = "code";
      index += 1;
      continue;
    }
    if (state === "code") {
      if (character === "/" && next === "*") {
        state = "block-comment";
        index += 2;
        continue;
      }
      if (character === "/" && next === "/") {
        state = "line-comment";
        index += 2;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        state = "string";
        quote = character;
        index += 1;
        continue;
      }
      if (character === "(" || character === "{" || character === "[") {
        if (character === "(") round += 1;
        else if (character === "{") curly += 1;
        else square += 1;
        stack.push(character + " @" + line);
      } else if (character === ")" || character === "}" || character === "]") {
        if (character === ")") round -= 1;
        else if (character === "}") curly -= 1;
        else square -= 1;
        stack.pop();
        if (round < 0 || curly < 0 || square < 0) {
          fail(fileName + " 第 " + line + " 行出现多余的 " + character + "，括号在闭合前就变负");
          return;
        }
      }
    } else if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 2;
        continue;
      }
    } else if (state === "string") {
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === quote) state = "code";
    }
    index += 1;
  }
  if (round !== 0 || curly !== 0 || square !== 0) {
    fail(fileName + " 括号不配平：round=" + round + " curly=" + curly + " square=" + square);
    console.error("  未闭合的括号（最后 5 个）：" + stack.slice(-5).join(", "));
    const suspect = Number(stack[stack.length - 1]?.split(" @")[1] ?? 1) || 1;
    console.error("  疑似位置（第 " + suspect + " 行）：" + (text.split("\n")[suspect - 1] ?? "").slice(0, 160));
  }
}

/** FieldType 与 type-mapping 的键必须一一对应，否则 registry 的类型断言会在编译期炸。 */
const fieldTypeEnum = resolveEnumSource("data", "FieldType")?.values ?? null;
const mappingKeys = Object.keys(typeMapping.types);
const missingMapping = (fieldTypeEnum ?? []).filter(value => !mappingKeys.includes(value));
const extraMapping = mappingKeys.filter(value => !(fieldTypeEnum ?? []).includes(value));
if (missingMapping.length > 0) fail("type-mapping.json 缺少 FieldType：" + missingMapping.join(", "));
if (extraMapping.length > 0) fail("type-mapping.json 多出未知 FieldType：" + extraMapping.join(", "));

const generated = [
  ["types.ts", typesText],
  ["guards.ts", guardsText],
  ["registry.ts", registryText],
  ["index.ts", indexText],
];

for (const [fileName, text] of generated) {
  if (text.includes("[object Object]")) fail(fileName + " 里出现 [object Object]，疑似对象被当字符串拼接");
  if (/:\s*;/.test(text)) fail(fileName + " 里出现空类型声明，疑似类型解析返回空");
  if (text.includes("= ;")) fail(fileName + " 里出现空赋值");
  if (text.includes("export type   =")) fail(fileName + " 里出现未命名类型");
  if (text.includes("export interface  ")) fail(fileName + " 里出现未命名 interface");
  balanceCheck(fileName, text);
}

for (const handwritten of HANDWRITTEN) {
  const target = path.join(OUT_DIR, handwritten + ".ts");
  if (!fs.existsSync(target)) fail("缺少手写文件 ts/" + handwritten + ".ts（本脚本不生成它，但缺了类型包不完整）");
}

if (problems.length > 0) {
  console.error("gen-ts 失败：");
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const written = [...generated, ["README.md", readmeText]];
for (const [fileName, text] of written) fs.writeFileSync(path.join(OUT_DIR, fileName), text, "utf8");

const totalDefs = FILES.reduce((sum, file) => sum + Object.keys(schemas[file].$defs ?? {}).length, 0);
const emittedDefs = FILES.reduce(
  (sum, file) => sum + Object.keys(schemas[file].$defs ?? {}).filter(name => !NOT_GENERATED.has(file + "." + name)).length,
  0,
);
const unionStats = [...unionInfo.values()];
const stepCount = unionInfo.get("logic.Step")?.discriminants.length ?? 0;
console.log("gen-ts 完成 → " + path.relative(process.cwd(), OUT_DIR));
for (const [fileName, text] of written) console.log("  " + fileName.padEnd(12) + String(text.length).padStart(8) + " 字符");
console.log(
  "  Schema $defs " +
    totalDefs +
    " 个（生成 " +
    emittedDefs +
    " 个，手写代替 " +
    NOT_GENERATED.size +
    " 个）→ 产出类型 " +
    definedNames.size +
    " 个，其中嵌套内联对象 " +
    (definedNames.size - emittedDefs) +
    " 个",
);
console.log(
  "  判别联合 " +
    unionStats.filter(info => info.discriminated).length +
    " 个（Step 变体 " +
    stepCount +
    " 个），枚举 " +
    (enumDefs.length + 1) +
    " 个，FieldType 映射 " +
    mappingKeys.length +
    " 条，表达式函数 " +
    expressionRegistry.functions.length +
    " 个，内置组件 " +
    componentRegistry.components.length +
    " 个",
);
