#!/usr/bin/env node
/**
 * gen-java.mjs —— 从 6 份 Schema + 2 份注册表生成 Java 类型包（Jackson DTO + 枚举 + 注册表）。
 *
 * 用法（任意 cwd 均可，路径按脚本自身位置解析）：
 *   node tools/gen-java.mjs
 *
 * 产物（java/，一个可直接 mvn compile 的 Maven 工程）：
 *   src/main/java/dev/lcp/schema/v01/dto/*.java       DTO（class / interface / 判别联合成员）
 *   src/main/java/dev/lcp/schema/v01/enums/*.java     枚举（def 级 6 个 + 属性级内联 88 个）
 *   src/main/java/dev/lcp/schema/v01/registry/*.java  FieldType 映射、表达式注册表、内置组件加载器、别名表
 *   src/main/java/dev/lcp/schema/v01/document/*.java  5 份文档型 Schema 的根容器（给 readValue 用）
 *   src/main/java/dev/lcp/schema/v01/support/*.java   ObjectMapper 装配（NON_NULL / JavaTime / 未知字段宽容）
 *   src/main/resources/lcp/*.json                     6 份 Schema + 3 份注册表，随包发布供服务端校验复用
 *   pom.xml / README.md / GENERATED.txt（产物清单，用于清理上一轮留下的过期文件）
 *
 * 重要：本机没有 JDK（离线环境装不了），这份产物【未经编译验证】。
 * 安全网全在本脚本末尾的自检：括号配平、package/类型名一致、引用完整性、
 * 以及与 ts/types.ts 的类型名逐一对齐 —— TS 与 Java 同名是硬约束，AI 提示词、
 * Code Connect、出码引擎都靠这个名字对齐两端。
 *
 * 与 gen-ts.mjs 的刻意差异（只有三条，其余逐条对齐）：
 *  1. Java 没有类型别名：41 个纯 $ref 别名定义（logic.Id -> common.Id 等）不生成类，
 *     字段类型直接落到最终类型；映射表落到 registry/Aliases.java 方便反查。
 *  2. common.Expr 在 TS 里叫 Expr（expr.ts 是手写模块），Java 里叫 CommonExpr，与同包其它类风格一致。
 *  3. 属性级内联枚举（88 处）在 TS 里是字面量联合类型，Java 生成具名枚举类 —— 多 88 个类换类型安全。
 *
 * 生成规则（每条都对应一个设计决策，改这里等于改契约）：
 *  1. 命名：命名空间前缀 + PascalCase，名字已以该前缀开头则不重复加前缀（与 gen-ts 同函数同名）。
 *  2. 判别联合：分支 properties.type.const 全为字符串 -> interface + @JsonTypeInfo/@JsonSubTypes；
 *     成员类保留 type 字段（带 const 初值、不给 setter），判别走 As.EXISTING_PROPERTY，
 *     这样「成员类单独序列化」和「按接口多态序列化」都不会漏掉 type，也不会出现两个 type 键。
 *  3. anyOf 里只含 required 的合法子句 -> 字段全部可空 + @AssertTrue 约束方法，
 *     等价于 TS 的 Base & ({a} | {b})，把「url 和 assetRef 都没写」挡在服务端入口。
 *  4. 非判别联合：分支全是对象 -> 扁平类（各分支字段并列 + head() 指出命中的分支）；
 *     含裸标量分支（只有 common.Text）-> JsonNode 透传包装 + 类型化取值方法。
 *  5. 内联对象 -> 具名顶层类，命名与 TS 的嵌套 interface 完全相同。
 *  6. required && 无 default -> @NotNull；minLength/maxLength/pattern/minimum/maximum/minItems -> jakarta.validation 注解。
 *  7. patternProperties / additionalProperties -> @JsonAnyGetter/@JsonAnySetter 的 Map<String, JsonNode>，x- 扩展键原样透传。
 *  8. 生成结束自检，见文件末尾。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCHEMA_DIR = path.join(ROOT, "schema");
const REGISTRY_DIR = path.join(ROOT, "registry");
const TS_DIR = path.join(ROOT, "ts");
const JAVA_DIR = path.join(ROOT, "java");

const PROTOCOL_VERSION = "0.1";
const GROUP_ID = "dev.lcp";
const ARTIFACT_ID = "lcp-schema-protocol-java";
const PKG_ROOT = "dev.lcp.schema.v01";
const PKG_DTO = PKG_ROOT + ".dto";
const PKG_ENUMS = PKG_ROOT + ".enums";
const PKG_REGISTRY = PKG_ROOT + ".registry";
const PKG_DOCUMENT = PKG_ROOT + ".document";
const PKG_SUPPORT = PKG_ROOT + ".support";

const SRC_DIR = path.join(JAVA_DIR, "src", "main", "java", ...PKG_ROOT.split("."));
const RES_DIR = path.join(JAVA_DIR, "src", "main", "resources", "lcp");
const DTO_DIR = path.join(SRC_DIR, "dto");
const ENUM_DIR = path.join(SRC_DIR, "enums");
const REGISTRY_OUT_DIR = path.join(SRC_DIR, "registry");
const DOCUMENT_DIR = path.join(SRC_DIR, "document");
const SUPPORT_OUT_DIR = path.join(SRC_DIR, "support");
const MANIFEST = path.join(JAVA_DIR, "GENERATED.txt");

const FILES = ["common", "data", "ui", "logic", "component", "bundle"];
const NS_PREFIX = {
  common: "Common",
  data: "Data",
  ui: "Ui",
  logic: "Logic",
  component: "Component",
  bundle: "Bundle",
};

/** 文档型 Schema 的根属性 -> 根容器类。common.schema.json 没有根属性，只需要它的 $defs。 */
const DOCUMENTS = [
  { file: "data", property: "dataSchema", className: "DataSchemaDocument" },
  { file: "ui", property: "uiSchema", className: "UiSchemaDocument" },
  { file: "logic", property: "logicSchema", className: "LogicSchemaDocument" },
  { file: "component", property: "component", className: "ComponentSchemaDocument" },
  { file: "bundle", property: "bundle", className: "BundleSchemaDocument" },
];

/** TS 类型名 -> Java 类型名，只登记不一致的。 */
const NAME_DIVERGENCE = { "common.Expr": "CommonExpr" };

const problems = [];
const fail = message => problems.push(message);
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

const schemas = {};
for (const file of FILES) schemas[file] = readJson(path.join(SCHEMA_DIR, file + ".schema.json"));
const typeMapping = readJson(path.join(REGISTRY_DIR, "type-mapping.json"));
const builtinComponents = readJson(path.join(REGISTRY_DIR, "builtin-components.json"));
const expressionRegistry = readJson(path.join(SCHEMA_DIR, "expression-registry.json"));

/* ------------------------------------------------------------------ */
/* 1. 命名（与 gen-ts.mjs 逐字一致，保证两端同名）                       */
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
    .replace(/^_+/, "")
    .toUpperCase();

function prefixedName(file, name) {
  const prefix = NS_PREFIX[file];
  return name.toLowerCase().startsWith(prefix.toLowerCase()) ? name : prefix + name;
}

/**
 * "file.Name" -> Java 类型名。
 * 注意：这里给【所有】$defs 都分配了名字（包括别名与标量），和 gen-ts 一样先把名字池占满 ——
 * 这样后面给内联对象分配名字时的去重顺序与 gen-ts 完全一致，TS 与 Java 才能逐个同名。
 */
const TYPE_NAME = new Map();
for (const file of FILES) {
  for (const name of Object.keys(schemas[file].$defs ?? {})) {
    const key = file + "." + name;
    TYPE_NAME.set(key, NAME_DIVERGENCE[key] ?? prefixedName(file, name));
  }
}

const usedNames = new Map();
for (const [key, value] of TYPE_NAME) {
  if (usedNames.has(value)) fail("类型名冲突：" + value + " 同时来自 " + usedNames.get(value) + " 与 " + key);
  usedNames.set(value, key);
}

let nestedCounter = 0;
function uniqueTypeName(hint) {
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

/* ------------------------------------------------------------------ */
/* 2. $ref 解析                                                        */
/* ------------------------------------------------------------------ */

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

const isPureRef = node => node && typeof node === "object" && !Array.isArray(node) && Object.keys(node).length <= 2 && typeof node.$ref === "string";

/* ------------------------------------------------------------------ */
/* 3. 属性名 -> 字段名（Java 保留字与非法字符）                         */
/* ------------------------------------------------------------------ */

const JAVA_KEYWORDS = new Set(
  ("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while record sealed permits yield var true false null").split(" "),
);

/** 属性名 -> Java 字段名。$ 系键（$lit/$ref/$args...）去掉 $，保留字加尾下划线。 */
function javaFieldName(propName) {
  let name = String(propName).replace(/\$/g, "").replace(/[^A-Za-z0-9_]/g, "_");
  if (name === "" || /^[0-9]/.test(name)) name = "f_" + name;
  if (JAVA_KEYWORDS.has(name)) name = name + "_";
  return name;
}

const capitalize = value => (value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1));

/* ------------------------------------------------------------------ */
/* 5. Java 类型表达式                                                  */
/* ------------------------------------------------------------------ */

const FQN = {
  String: "java.lang.String",
  Integer: "java.lang.Integer",
  Long: "java.lang.Long",
  Boolean: "java.lang.Boolean",
  Object: "java.lang.Object",
  BigDecimal: "java.math.BigDecimal",
  LocalDate: "java.time.LocalDate",
  OffsetDateTime: "java.time.OffsetDateTime",
  OffsetTime: "java.time.OffsetTime",
  JsonNode: "com.fasterxml.jackson.databind.JsonNode",
  List: "java.util.List",
  Map: "java.util.Map",
  LinkedHashMap: "java.util.LinkedHashMap",
};

const SCALAR_JAVA = { string: "String", integer: "Integer", number: "BigDecimal", boolean: "Boolean", null: "Object" };
const FORMAT_JAVA = { date: "LocalDate", "date-time": "OffsetDateTime", time: "OffsetTime" };

function makeCtx(pkg) {
  return { pkg, imports: new Set() };
}

/** 记录类型名的 FQN 与 import，返回该文件里应当使用的简单名。 */
function useQualified(ctx, fqn) {
  const simple = fqn.slice(fqn.lastIndexOf(".") + 1);
  if (!fqn.startsWith("java.lang.") && !fqn.startsWith(ctx.pkg + ".")) ctx.imports.add(fqn);
  if (fqn.startsWith(PKG_ROOT + ".")) REFERENCED_TYPES.add(simple);
  return simple;
}

/** 生成物里被引用到的同包类型名。渲染结束后与「实际产出的类型」比对，防止拼出一个不存在的类名。 */
const REFERENCED_TYPES = new Set();

function use(ctx, simple) {
  const fqn = FQN[simple];
  if (fqn === undefined) {
    fail("未登记的 Java 类型别名：" + simple);
    return simple;
  }
  return useQualified(ctx, fqn);
}

function scalarJava(node) {
  if (node.type === "string" && node.format && FORMAT_JAVA[node.format]) return FORMAT_JAVA[node.format];
  if (node.type === "integer" && node.format === "int64") return "Long";
  return SCALAR_JAVA[node.type] ?? "JsonNode";
}

function refTypeOf(ref, file, ctx) {
  const target = refTargetOf(ref, file);
  const info = DEF_TYPE.get(target.key);
  if (info === undefined) {
    fail("$ref 指向未分类的定义：" + ref);
    return use(ctx, "JsonNode");
  }
  if (info.mode === "prim") {
    for (const fqn of info.imports) if (!fqn.startsWith("java.lang.")) ctx.imports.add(fqn);
    return info.type;
  }
  if (info.mode === "enum") return useQualified(ctx, PKG_ENUMS + "." + info.name);
  return useQualified(ctx, PKG_DTO + "." + info.name);
}

/** 属性级内联对象 -> 具名顶层类，命名与 gen-ts 的嵌套 interface 完全一致（同一份记忆化键）。 */
function nestedClass(node, file, ownerKey, hint, ctx) {
  const memoKey = ownerKey + "|" + hint;
  const existing = nestedNameByHint.get(memoKey);
  if (existing !== undefined) return useQualified(ctx, PKG_DTO + "." + existing);
  const name = uniqueTypeName(hint);
  nestedNameByHint.set(memoKey, name);
  NESTED_CLASSES.push({ name, node, file, ownerKey });
  return useQualified(ctx, PKG_DTO + "." + name);
}

/** 属性级内联枚举 -> 具名枚举类；名字池与类分开，避免打乱 gen-ts 的取名顺序。 */
function enumTypeOf(values, file, ownerKey, hint, ctx) {
  const unique = [...new Set(values.filter(value => typeof value === "string"))];
  const memoKey = ownerKey + "|enum|" + hint + "|" + unique.join(",");
  const existing = nestedEnumByHint.get(memoKey);
  if (existing !== undefined) return useQualified(ctx, PKG_ENUMS + "." + existing);
  let name = hint;
  if (usedNames.has(name) || enumNames.has(name)) {
    let index = 2;
    while (usedNames.has(name + index) || enumNames.has(name + index)) index += 1;
    name = name + index;
  }
  enumNames.set(name, unique);
  nestedEnumByHint.set(memoKey, name);
  NESTED_ENUMS.push({ name, values: unique, file, ownerKey });
  return useQualified(ctx, PKG_ENUMS + "." + name);
}

function javaTypeOf(node, file, ownerKey, hint, ctx) {
  if (!node || typeof node !== "object") return use(ctx, "JsonNode");
  if (node.$ref) return refTypeOf(node.$ref, file, ctx);
  if (Array.isArray(node.enum)) return enumTypeOf(node.enum, file, ownerKey, hint, ctx);
  if (node.oneOf || node.anyOf) {
    // 属性级内联联合：TS 生成字面量联合，Java 表达不了，落到 JsonNode（分支类型写进 Javadoc）。
    const branches = node.oneOf ?? node.anyOf;
    if (branches.length === 1) return javaTypeOf(branches[0], file, ownerKey, hint, ctx);
    const probe = makeCtx(ctx.pkg);
    const types = [...new Set(branches.map(branch => javaTypeOf(branch, file, ownerKey, hint + "Alt", probe)))];
    if (types.length === 1) return types[0];
    return use(ctx, "JsonNode");
  }
  if (Array.isArray(node.type)) {
    const members = node.type.filter(item => item !== "null");
    if (members.length === 1) return use(ctx, scalarJava({ type: members[0] }));
    return use(ctx, "JsonNode");
  }
  if (node.type === "array") {
    const inner = javaTypeOf(node.items ?? {}, file, ownerKey, hint + "Item", ctx);
    return use(ctx, "List") + "<" + inner + ">";
  }
  if (node.type === "object" || node.properties !== undefined || node.additionalProperties !== undefined) {
    const hasProps = node.properties && Object.keys(node.properties).length > 0;
    if (hasProps) return nestedClass(node, file, ownerKey, hint, ctx);
    const additional = node.additionalProperties;
    if (additional === undefined || additional === true) {
      return use(ctx, "Map") + "<" + use(ctx, "String") + ", " + use(ctx, "JsonNode") + ">";
    }
    if (additional === false) return use(ctx, "JsonNode");
    return use(ctx, "Map") + "<" + use(ctx, "String") + ", " + javaTypeOf(additional, file, ownerKey, hint + "Value", ctx) + ">";
  }
  if (node.const !== undefined) return use(ctx, "String");
  if (typeof node.type === "string") return use(ctx, scalarJava(node));
  return use(ctx, "JsonNode");
}

/* ------------------------------------------------------------------ */
/* 6. 渲染：Javadoc / 注解 / 类                                        */
/* ------------------------------------------------------------------ */

const GENERATED_HEADER = "// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。";

const getterName = field => "get" + capitalize(field);
const setterName = field => "set" + capitalize(field);

function javaStringLiteral(text) {
  const escaped = String(text)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return '"' + escaped + '"';
}

function javaDoc(node, extra) {
  const notes = [];
  if (node.description) notes.push(node.description);
  if (Array.isArray(extra)) notes.push(...extra);
  if (node.const !== undefined) notes.push("@const " + JSON.stringify(node.const));
  if (node.default !== undefined) notes.push("@default " + JSON.stringify(node.default));
  if (node.pattern !== undefined) notes.push("@pattern " + node.pattern);
  if (node.format !== undefined) notes.push("@format " + node.format);
  if (node.minimum !== undefined) notes.push("@minimum " + node.minimum);
  if (node.maximum !== undefined) notes.push("@maximum " + node.maximum);
  if (node.minLength !== undefined) notes.push("@minLength " + node.minLength);
  if (node.maxLength !== undefined) notes.push("@maxLength " + node.maxLength);
  if (node.minItems !== undefined) notes.push("@minItems " + node.minItems);
  if (node.maxItems !== undefined) notes.push("@maxItems " + node.maxItems);
  if (Array.isArray(node.examples) && node.examples.length > 0) notes.push("@example " + JSON.stringify(node.examples[0]));
  if (notes.length === 0) return [];
  const out = ["/**"];
  for (const note of notes) {
    for (const line of String(note).split("\n")) out.push(" * " + line.replace(/\s+$/, "").replace(/\*\//g, "*\\/"));
  }
  out.push(" */");
  return out;
}

/** 校验注解：required -> @NotNull；length -> @Size；pattern -> @Pattern；min/max -> @Min/@Max；items -> @Size。 */
function validationAnnotations(ctx, propSchema, isRequired, javaType) {
  const lines = [];
  const annotation = simple => "@" + useQualified(ctx, "jakarta.validation.constraints." + simple);
  if (isRequired) lines.push(annotation("NotNull"));
  const isCollection = javaType.startsWith("List<") || javaType.startsWith("Map<");
  if (isCollection) {
    if (propSchema.minItems !== undefined || propSchema.maxItems !== undefined) {
      const args = [];
      if (propSchema.minItems !== undefined) args.push("min = " + propSchema.minItems);
      if (propSchema.maxItems !== undefined) args.push("max = " + propSchema.maxItems);
      lines.push(annotation("Size") + "(" + args.join(", ") + ")");
    }
    return lines;
  }
  if (javaType === "String") {
    if (propSchema.minLength !== undefined || propSchema.maxLength !== undefined) {
      const args = [];
      if (propSchema.minLength !== undefined) args.push("min = " + propSchema.minLength);
      if (propSchema.maxLength !== undefined) args.push("max = " + propSchema.maxLength);
      lines.push(annotation("Size") + "(" + args.join(", ") + ")");
    }
    if (propSchema.pattern !== undefined) lines.push(annotation("Pattern") + "(regexp = " + javaStringLiteral(propSchema.pattern) + ")");
    return lines;
  }
  if (javaType === "Integer" || javaType === "Long") {
    if (propSchema.minimum !== undefined) lines.push(annotation("Min") + "(" + Math.trunc(propSchema.minimum) + "L)");
    if (propSchema.maximum !== undefined) lines.push(annotation("Max") + "(" + Math.trunc(propSchema.maximum) + "L)");
    return lines;
  }
  if (javaType === "BigDecimal") {
    if (propSchema.minimum !== undefined) lines.push(annotation("DecimalMin") + "(" + javaStringLiteral(String(propSchema.minimum)) + ")");
    if (propSchema.maximum !== undefined) lines.push(annotation("DecimalMax") + "(" + javaStringLiteral(String(propSchema.maximum)) + ")");
  }
  return lines;
}

/** 只有 const 才写字段初值：const 是硬不变量，default 是文档（对齐 schema 里两者的语义差别）。 */
function constInitializer(propSchema) {
  if (propSchema.const === undefined) return "";
  if (typeof propSchema.const === "string") return " = " + javaStringLiteral(propSchema.const);
  if (typeof propSchema.const === "number" || typeof propSchema.const === "boolean") return " = " + String(propSchema.const);
  return "";
}

function javaFile(pkg, ctx, bodyLines) {
  const out = [GENERATED_HEADER, "package " + pkg + ";", ""];
  const imports = [...ctx.imports].sort();
  for (const fqn of imports) out.push("import " + fqn + ";");
  if (imports.length > 0) out.push("");
  out.push(...bodyLines);
  return out.join("\n") + "\n";
}

const JACKSON = "com.fasterxml.jackson.annotation.";

/**
 * Jackson 注解：登记 import 并返回简单名。
 * 注解不进 FQN 表（表只登记类型），所以单独走这里 —— 否则生成出来的
 * @JsonProperty / @JsonIgnore 会缺 import，整个包编译不过。
 */
function jackson(ctx, simple) {
  return useQualified(ctx, JACKSON + simple);
}

/** object/anyOf 约束 -> class（含 x- 扩展键容器与 @AssertTrue 约束方法）。 */
function renderClass(spec) {
  const pkg = spec.pkg ?? PKG_DTO;
  const ctx = makeCtx(pkg);
  const node = spec.node;
  for (const annotation of ["JsonAnyGetter", "JsonAnySetter", "JsonIgnore", "JsonProperty"]) {
    useQualified(ctx, JACKSON + annotation);
  }
  useQualified(ctx, "jakarta.validation.constraints.AssertTrue");
  const typeName = spec.name;
  const required = new Set(node.required ?? []);
  const fieldNames = new Set();
  const fieldByProp = new Map();

  const uniqueField = propName => {
    let name = javaFieldName(propName);
    if (!fieldNames.has(name)) {
      fieldNames.add(name);
      return name;
    }
    let index = 2;
    while (fieldNames.has(name + index)) index += 1;
    name = name + index;
    fieldNames.add(name);
    return name;
  };

  const members = [];
  for (const [propName, propSchema] of Object.entries(node.properties ?? {})) {
    const fieldName = uniqueField(propName);
    fieldByProp.set(propName, fieldName);
    const isConst = propSchema.const !== undefined;
    const isRequired = required.has(propName) && propSchema.default === undefined;
    const type = javaTypeOf(propSchema, spec.file, spec.ownerKey, typeName + pascal(propName), ctx);
    const block = [];
    block.push(
      ...javaDoc(
        propSchema,
        isConst
          ? ["判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。"]
          : isRequired
            ? ["必填字段（required 且无 default）。"]
            : null,
      ),
    );
    block.push(...validationAnnotations(ctx, propSchema, isRequired, type));
    block.push("@JsonProperty(" + javaStringLiteral(propName) + ")");
    block.push("private " + type + " " + fieldName + constInitializer(propSchema) + ";");
    block.push("");
    block.push("public " + type + " " + getterName(fieldName) + "() {");
    block.push("    return " + fieldName + ";");
    block.push("}");
    if (!isConst) {
      block.push("");
      block.push("public void " + setterName(fieldName) + "(" + type + " " + fieldName + ") {");
      block.push("    this." + fieldName + " = " + fieldName + ";");
      block.push("}");
    }
    members.push(block);
  }

  const hasProperties = Object.keys(node.properties ?? {}).length > 0;
  const openValueNode = node.additionalProperties && typeof node.additionalProperties === "object" ? node.additionalProperties : null;
  const hasExtensions = node.patternProperties !== undefined || (!hasProperties && (node.additionalProperties === true || openValueNode !== null));
  if (hasExtensions) {
    const valueType = node.patternProperties !== undefined || openValueNode === null ? use(ctx, "JsonNode") : javaTypeOf(openValueNode, spec.file, spec.ownerKey, typeName + "Value", ctx);
    members.push([
      "/** x- 扩展键：平台原样透传、不参与校验。 */",
      "@JsonAnyGetter",
      "public " + use(ctx, "Map") + "<" + use(ctx, "String") + ", " + valueType + "> extensions() {",
      "    return extensions;",
      "}",
      "",
      "@JsonAnySetter",
      "public void putExtension(" + use(ctx, "String") + " key, " + valueType + " value) {",
      "    extensions.put(key, value);",
      "}",
      "",
      "private final " + use(ctx, "Map") + "<" + use(ctx, "String") + ", " + valueType + "> extensions = new " + use(ctx, "LinkedHashMap") + "<>();",
    ]);
  }

  if (Array.isArray(spec.constraint)) {
    const missing = spec.constraint.flat().filter(key => !fieldByProp.has(key));
    if (missing.length > 0) fail(typeName + " 的 anyOf 约束引用了不存在的字段：" + missing.join(", "));
    const clauses = spec.constraint.map(keys => keys.map(key => fieldByProp.get(key) + " != null").join(" && "));
    const expression = clauses.length === 1 ? clauses[0] : clauses.map(clause => "(" + clause + ")").join(" || ");
    const message = "至少提供一组字段：" + spec.constraint.map(keys => keys.join(" + ")).join(" 或 ");
    members.push([
      "/** " + message + "（对齐 Schema 的 anyOf 约束）。 */",
      "@AssertTrue(message = " + javaStringLiteral(message) + ")",
      "@JsonIgnore",
      "public boolean isConstraintSatisfied() {",
      "    return " + expression + ";",
      "}",
    ]);
  }

  for (const block of spec.extraMembers ?? []) members.push(block);

  if (spec.flat) {
    const flatLines = [];
    spec.flat.forEach((branch, index) => {
      const required = Array.isArray(branch.required) ? branch.required : [];
      const missing = required.filter(propName => !fieldByProp.has(propName));
      if (missing.length > 0) fail(typeName + " 的扁平联合分支引用了不存在的字段：" + missing.join(", "));
      const test = required.length === 0 ? "true" : required.map(propName => fieldByProp.get(propName) + " != null").join(" && ");
      const label = flatPredicateName(typeName, branch, index);
      if (flatLines.length > 0) flatLines.push("");
      flatLines.push("/** 分支 " + (index + 1) + " 命中判断：" + (required.length === 0 ? "无必填字段，恒命中。" : "需要同时提供 " + required.join(" + ") + "。") + " */");
      flatLines.push("@" + jackson(ctx, "JsonIgnore"));
      flatLines.push("public boolean is" + label + "() {");
      flatLines.push("    return " + test + ";");
      flatLines.push("}");
    });
    flatLines.push("");
    flatLines.push("/** 命中的分支名（第一个满足的分支），都不满足时返回 null。Java 表达不了联合类型，这里用分支谓词 + head() 替代 TS 的窄化。 */");
    flatLines.push("@" + jackson(ctx, "JsonIgnore"));
    flatLines.push("public String head() {");
    spec.flat.forEach((branch, index) => {
      flatLines.push("    if (is" + flatPredicateName(typeName, branch, index) + "()) return " + javaStringLiteral(flatPredicateName(typeName, branch, index)) + ";");
    });
    flatLines.push("    return null;");
    flatLines.push("}");
    members.push(flatLines);
  }

  const body = [];
  body.push(...javaDoc(node, spec.extra));
  body.push(spec.iface ? "public class " + typeName + " implements " + spec.iface + " {" : "public class " + typeName + " {");
  members.forEach((block, index) => {
    if (index > 0) body.push("");
    for (const line of block) body.push(line === "" ? "" : "    " + line);
  });
  body.push("}");
  return javaFile(pkg, ctx, body);
}

/* ================================================================== */
/* 13. 写盘：Java 源码、随包资源、pom.xml、README.md、产物清单          */
/* ------------------------------------------------------------------ */

/** 产物 -> 相对 java/ 的路径。清单与清理共用同一套算法，免得两处漂移。 */
function relativePathOf(dir, typeName) {
  return path.relative(JAVA_DIR, path.join(dir, typeName + ".java")).replace(/\\/g, "/");
}

const RESOURCE_OUT_DIR = path.join("src", "main", "resources", "lcp");

/** 递归列出 root 下的所有文件；root 不存在时返回空数组。 */
function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * 删掉上一轮留下、这一轮不再产出的文件（定义被删、别名改名都会留下孤儿类）。
 * 两个约束：只认本生成器产出的后缀，别人的东西不碰；显式跳过 GENERATED.txt ——
 * 它是清单自身，删了下一轮就没法判断谁过期。
 */
function removeStale(keep) {
  const removed = [];
  for (const existing of listFiles(JAVA_DIR)) {
    const relative = path.relative(JAVA_DIR, existing).replace(/\\/g, "/");
    if (keep.has(relative)) continue;
    if (relative === "GENERATED.txt") continue;
    if (!/\.(java|json|md|xml|txt)$/.test(relative)) continue;
    fs.rmSync(existing, { force: true });
    removed.push(relative);
  }
  return removed;
}

/** 收掉空目录：上一轮独占某个包、这一轮不再产出某个模式时会留下空包。 */
function pruneEmptyDirs() {
  if (!fs.existsSync(JAVA_DIR)) return;
  const dirs = [];
  const walk = root => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(root, entry.name);
      dirs.push(full);
      walk(full);
    }
  };
  walk(JAVA_DIR);
  for (const dir of dirs.sort((left, right) => right.length - left.length)) {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}

/** 产物清单：下一轮生成时，凡是不在清单里的旧产物都会被删掉。 */
function manifestText(written, removed) {
  const lines = [
    "# tools/gen-java.mjs 的产物清单。每行一个文件路径（相对 java/）。",
    "# 下一轮生成时，凡是不在本清单里的 .java/.json/.md/.xml/.txt 都会被删掉 —— 不要往 java/ 放手工文件。",
    "# 文件数：" + (written.length + 1) + "（含本清单）",
  ];
  for (const item of written) lines.push(item.relative);
  lines.push("GENERATED.txt");
  if (removed.length > 0) {
    lines.push("");
    lines.push("# 本轮清理掉的过期产物 " + removed.length + " 个：");
    for (const relative of removed) lines.push("# - " + relative);
  }
  return lines.join("\n") + "\n";
}

/** 落盘：先算出这一轮的完整文件集，据此清理过期产物，再写文件。 */
function writeAll() {
  const written = [];
  for (const item of PRODUCED) written.push({ relative: relativePathOf(item.dir, item.typeName), text: item.text });
  for (const relative of RESOURCES) {
    written.push({
      relative: path.join(RESOURCE_OUT_DIR, path.basename(relative)).replace(/\\/g, "/"),
      text: fs.readFileSync(path.join(ROOT, relative), "utf8"),
    });
  }
  written.push({ relative: "pom.xml", text: POM_XML });
  written.push({ relative: "README.md", text: README_MD });

  const removed = removeStale(new Set(written.map(item => item.relative)));
  for (const item of written) {
    const target = path.join(JAVA_DIR, item.relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.text, "utf8");
  }
  fs.writeFileSync(MANIFEST, manifestText(written, removed), "utf8");
  pruneEmptyDirs();
  return { written, removed };
}

/**
 * 根容器与注册表的渲染入口。
 * 顺序关键：根容器、注册表、支撑类一律排在所有 $defs 之后 —— 它们会新建嵌套类，
 * 只有排在后面才不会抢占 $defs 已经占住的名字（顺序一乱，两端取名就错开）。
 * 由文件末尾的「运行顺序」统一调用，不要在模块顶层直接跑：那时 TYPE_NAME 与 DEF_TYPE 还没算完。
 */
function renderRoots() {
  for (const spec of DOCUMENTS) {
    const text = renderDocumentRoot(spec);
    if (text !== null) emitJavaFile(DOCUMENT_DIR, spec.className, text);
  }

  emitJavaFile(REGISTRY_OUT_DIR, "FieldTypeMapping", renderFieldTypeMapping());
  emitJavaFile(REGISTRY_OUT_DIR, "ExpressionRegistry", renderExpressionRegistry());
  emitJavaFile(REGISTRY_OUT_DIR, "BuiltinComponentRegistry", renderBuiltinComponentRegistry());
  emitJavaFile(REGISTRY_OUT_DIR, "Aliases", renderAliases());

  emitJavaFile(SUPPORT_OUT_DIR, "LcpObjectMapper", renderLcpObjectMapper());
  emitJavaFile(SUPPORT_OUT_DIR, "JsonbSupport", renderJsonbSupport());
  emitJavaFile(SRC_DIR, "package-info", renderPackageInfo());
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 12. 渲染驱动：顺序必须与 gen-ts 的 emitDef 一致，两端才能逐个同名    */
/* ------------------------------------------------------------------ */

const PRODUCED = []; // { dir, typeName, text }
const PRODUCED_IDENTITIES = new Set();

function emitJavaFile(dir, typeName, text) {
  const identity = dir + "|" + typeName;
  if (PRODUCED_IDENTITIES.has(identity)) fail("Java 类型重复产出：" + typeName + "（" + dir + "）");
  PRODUCED_IDENTITIES.add(identity);
  PRODUCED.push({ dir, typeName, text });
}

/**
 * 属性级内联对象的队列。gen-ts 是在每个定义渲染完后 flush 一次，
 * 所以这里每处理完一个定义就把新排进来的类全部渲染掉 —— 顺序差一步，取名就会错开。
 */
let nestedCursor = 0;
function drainNestedClasses() {
  while (nestedCursor < NESTED_CLASSES.length) {
    const spec = NESTED_CLASSES[nestedCursor];
    nestedCursor += 1;
    emitJavaFile(DTO_DIR, spec.name, renderClass({ name: spec.name, file: spec.file, ownerKey: spec.ownerKey, node: spec.node }));
  }
}

/** 判别联合/透传包装的成员类，按所有者分组（延迟建索引：EXTRA_CLASSES 由预扫填充，模块顶层还拿不到）。 */
let extrasByOwner = null;
function extrasOf(ownerKey) {
  if (extrasByOwner === null) {
    extrasByOwner = new Map();
    for (const extra of EXTRA_CLASSES) {
      if (!extrasByOwner.has(extra.ownerKey)) extrasByOwner.set(extra.ownerKey, []);
      extrasByOwner.get(extra.ownerKey).push(extra);
    }
  }
  return extrasByOwner.get(ownerKey) ?? [];
}

function renderExtraClasses(ownerKey) {
  for (const extra of extrasOf(ownerKey)) {
    emitJavaFile(
      DTO_DIR,
      extra.name,
      renderClass({ name: extra.name, file: extra.file, ownerKey: extra.ownerKey, node: extra.node, iface: extra.iface }),
    );
  }
}

/** 按 $defs 顺序渲染：顺序必须与 gen-ts 的 emitDef 一致，两端才能逐个同名。 */
function renderDefs() {
  for (const file of FILES) {
    for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
      const key = file + "." + name;
      const info = DEF_TYPE.get(key);
      if (info === undefined) {
        fail("预扫漏掉的定义：" + key);
        continue;
      }
      const own = TYPE_NAME.get(key);
      if (emittedTypeName(key) === null) continue; // 别名与标量：Java 没有类型别名
      if (info.mode === "iface") {
        emitJavaFile(DTO_DIR, own, renderInterface({ key, file, node, name: own, discriminatorKey: info.discriminatorKey }));
        renderExtraClasses(key);
      } else if (info.mode === "flat") {
        emitJavaFile(DTO_DIR, own, renderFlat({ key, file, node, name: own }));
      } else if (info.mode === "passthrough") {
        emitJavaFile(DTO_DIR, own, renderPassthrough({ key, file, node, name: own }));
        renderExtraClasses(key);
      } else if (info.mode === "enum") {
        emitJavaFile(ENUM_DIR, own, renderEnum(own, node.enum, node));
      } else if (info.mode === "class") {
        const memberOf = MEMBER_OF.get(key);
        emitJavaFile(
          DTO_DIR,
          own,
          renderClass({ name: own, file, ownerKey: key, node, iface: memberOf === undefined ? undefined : memberOf.ifaceName, constraint: info.constraint }),
        );
      } else {
        fail("未处理的渲染模式 " + info.mode + "：" + key);
      }
      drainNestedClasses();
    }
  }

  drainNestedClasses();

  for (const spec of [...NESTED_ENUMS]) {
    emitJavaFile(
      ENUM_DIR,
      spec.name,
      renderEnum(spec.name, spec.values, null, [
        "属性级内联枚举：" + spec.ownerKey + " 上的字面量集合。TypeScript 侧是同名字面量联合，Java 用枚举换类型安全。",
      ]),
    );
  }
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 11. 工程文件：随包资源、pom.xml、README.md                           */
/* ------------------------------------------------------------------ */

/** 随包发布的资源：6 份 Schema + 3 份注册表。服务端校验器直接复用，不另存一份免得漂移。 */
const RESOURCES = [
  "schema/common.schema.json",
  "schema/data.schema.json",
  "schema/ui.schema.json",
  "schema/logic.schema.json",
  "schema/component.schema.json",
  "schema/bundle.schema.json",
  "schema/expression-registry.json",
  "registry/type-mapping.json",
  "registry/builtin-components.json",
];

const POM_XML = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<!-- 由 tools/gen-java.mjs 生成，请勿手工修改。 -->",
  "<project xmlns=\"http://maven.apache.org/POM/4.0.0\"",
  "         xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"",
  "         xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\">",
  "  <modelVersion>4.0.0</modelVersion>",
  "  <groupId>" + GROUP_ID + "</groupId>",
  "  <artifactId>" + ARTIFACT_ID + "</artifactId>",
  "  <version>0.1.0</version>",
  "  <packaging>jar</packaging>",
  "  <name>LCP 元数据协议 " + PROTOCOL_VERSION + " · Java 绑定</name>",
  "  <description>元数据 Schema 的 Jackson DTO + 枚举 + 注册表 + 文档根容器。由 tools/gen-java.mjs 生成。</description>",
  "",
  "  <properties>",
  "    <maven.compiler.release>17</maven.compiler.release>",
  "    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>",
  "    <jackson.version>2.17.2</jackson.version>",
  "  </properties>",
  "",
  "  <dependencyManagement>",
  "    <dependencies>",
  "      <dependency>",
  "        <groupId>com.fasterxml.jackson</groupId>",
  "        <artifactId>jackson-bom</artifactId>",
  "        <version>${jackson.version}</version>",
  "        <type>pom</type>",
  "        <scope>import</scope>",
  "      </dependency>",
  "    </dependencies>",
  "  </dependencyManagement>",
  "",
  "  <dependencies>",
  "    <!-- DTO 注解与 JsonNode 读写：本包的编译期硬依赖。 -->",
  "    <dependency>",
  "      <groupId>com.fasterxml.jackson.core</groupId>",
  "      <artifactId>jackson-databind</artifactId>",
  "    </dependency>",
  "    <!-- LocalDate / OffsetDateTime / OffsetTime 的序列化（support/LcpObjectMapper 注册它）。 -->",
  "    <dependency>",
  "      <groupId>com.fasterxml.jackson.datatype</groupId>",
  "      <artifactId>jackson-datatype-jsr310</artifactId>",
  "    </dependency>",
  "    <!-- 校验注解。只用到注解本身，校验实现由宿主应用（Spring Boot）提供，所以是 provided。 -->",
  "    <dependency>",
  "      <groupId>jakarta.validation</groupId>",
  "      <artifactId>jakarta.validation-api</artifactId>",
  "      <version>3.0.2</version>",
  "      <scope>provided</scope>",
  "    </dependency>",
  "  </dependencies>",
  "",
  "  <build>",
  "    <plugins>",
  "      <plugin>",
  "        <groupId>org.apache.maven.plugins</groupId>",
  "        <artifactId>maven-compiler-plugin</artifactId>",
  "        <version>3.13.0</version>",
  "        <configuration>",
  "          <release>${maven.compiler.release}</release>",
  "          <parameters>true</parameters>",
  "        </configuration>",
  "      </plugin>",
  "    </plugins>",
  "  </build>",
  "</project>",
  "",
].join("\n");

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 10. support/：ObjectMapper 装配、JSONB 契约、包说明                  */
/* ------------------------------------------------------------------ */

function renderLcpObjectMapper() {
  const ctx = makeCtx(PKG_SUPPORT);
  const objectMapper = useQualified(ctx, "com.fasterxml.jackson.databind.ObjectMapper");
  const inclusion = useQualified(ctx, "com.fasterxml.jackson.annotation.JsonInclude");
  const javaTime = useQualified(ctx, "com.fasterxml.jackson.datatype.jsr310.JavaTimeModule");
  const deserializationFeature = useQualified(ctx, "com.fasterxml.jackson.databind.DeserializationFeature");
  const serializationFeature = useQualified(ctx, "com.fasterxml.jackson.databind.SerializationFeature");
  const body = [];
  body.push(...javaDoc({ description: null }, [
    "LCP 协议用的 ObjectMapper 装配。读写 Schema DTO 的地方统一用这一份，不要各自 new。",
    "",
    "三条约定：",
    "  1. NON_NULL —— 可选字段不写 null。契约里「字段缺省」与「字段为 null」同义，写出去只会让 diff 变脏。",
    "  2. 未知字段宽容 —— Schema 是向前演进的，先用上新服务端字段的客户端不该被老代码打挂。",
    "  3. 时间不走时间戳 —— 契约里的 date-time 是 ISO-8601 字符串，写成纪元数字会让两端对不上。",
  ]));
  body.push("public final class LcpObjectMapper {");
  body.push("    /** 共享实例（ObjectMapper 本身线程安全，配置完成后不要再改）。 */");
  body.push("    private static final " + objectMapper + " SHARED = create();");
  body.push("");
  body.push("    private LcpObjectMapper() {}");
  body.push("");
  body.push("    public static " + objectMapper + " shared() {");
  body.push("        return SHARED;");
  body.push("    }");
  body.push("");
  body.push("    /** 新建一个配置好的实例。需要不同配置（例如写审计日志要保留 null）时用这个。 */");
  body.push("    public static " + objectMapper + " create() {");
  body.push("        " + objectMapper + " mapper = new " + objectMapper + "();");
  body.push("        mapper.registerModule(new " + javaTime + "());");
  body.push("        mapper.setSerializationInclusion(" + inclusion + ".Include.NON_NULL);");
  body.push("        mapper.disable(" + serializationFeature + ".WRITE_DATES_AS_TIMESTAMPS);");
  body.push("        mapper.disable(" + deserializationFeature + ".FAIL_ON_UNKNOWN_PROPERTIES);");
  body.push("        return mapper;");
  body.push("    }");
  body.push("}");
  return javaFile(PKG_SUPPORT, ctx, body);
}

function renderJsonbSupport() {
  const ctx = makeCtx(PKG_SUPPORT);
  const objectMapper = useQualified(ctx, "com.fasterxml.jackson.databind.ObjectMapper");
  const jsonNode = useQualified(ctx, FQN.JsonNode);
  const jsonProcessing = useQualified(ctx, "com.fasterxml.jackson.core.JsonProcessingException");
  const body = [];
  body.push(...javaDoc({ description: null }, [
    "JSONB 落库契约。元数据与业务对象存进 PostgreSQL 的 jsonb 列时统一走这里，不要在 DAO 里各写各的。",
    "",
    "为什么只有工具方法、没有 JsonbMapper 注解和 TypeHandler：",
    "  当前 Schema 里没有任何「同一个 DTO 要按多个物理列变体映射」的用例。先生成一层空的映射是死代码，",
    "  更麻烦的是它会诱导后来的人去改生成文件（改完下一次生成就没了）。等真出现多列变体，",
    "  再按那个具体用例生成具名的 TypeHandler，而不是现在先铺一层。",
    "",
    "三条使用约定：",
    "  1. 写库前先过 L1 校验，JSONB 里不允许存没校验过的元数据。",
    "  2. 读库用下面的方法，不要自己 new ObjectMapper —— NON_NULL 与时间格式必须全链路一致。",
    "  3. 要按字段过滤就直接用 PostgreSQL 的 jsonb 操作符，别把整列捞回 Java 里筛。",
  ]));
  body.push("public final class JsonbSupport {");
  body.push("    private JsonbSupport() {}");
  body.push("");
  body.push("    /** DTO -> jsonb 字符串。null 原样返回 null（写库即 SQL NULL，不是 JSON 的 null 字面量）。 */");
  body.push("    public static String write(" + objectMapper + " mapper, Object value) {");
  body.push("        if (value == null) return null;");
  body.push("        try {");
  body.push("            return mapper.writeValueAsString(value);");
  body.push("        } catch (" + jsonProcessing + " error) {");
  body.push("            throw new IllegalArgumentException(" + javaStringLiteral("对象无法序列化成 jsonb：") + " + value.getClass().getName(), error);");
  body.push("        }");
  body.push("    }");
  body.push("");
  body.push("    /** jsonb 字符串 -> DTO。内容坏掉就抛，不返回半成品。 */");
  body.push("    public static <T> T read(" + objectMapper + " mapper, String jsonb, Class<T> type) {");
  body.push("        if (jsonb == null || jsonb.isEmpty()) return null;");
  body.push("        try {");
  body.push("            return mapper.readValue(jsonb, type);");
  body.push("        } catch (" + jsonProcessing + " error) {");
  body.push("            throw new IllegalArgumentException(" + javaStringLiteral("jsonb 内容无法反序列化成 ") + " + type.getName(), error);");
  body.push("        }");
  body.push("    }");
  body.push("");
  body.push("    /** jsonb 字符串 -> JsonNode。给「还不知道要落成哪个 DTO」的场景，例如元数据版本的迁移脚本。 */");
  body.push("    public static " + jsonNode + " readTree(" + objectMapper + " mapper, String jsonb) {");
  body.push("        if (jsonb == null || jsonb.isEmpty()) return null;");
  body.push("        try {");
  body.push("            return mapper.readTree(jsonb);");
  body.push("        } catch (" + jsonProcessing + " error) {");
  body.push("            throw new IllegalArgumentException(" + javaStringLiteral("jsonb 内容不是合法 JSON") + ", error);");
  body.push("        }");
  body.push("    }");
  body.push("}");
  return javaFile(PKG_SUPPORT, ctx, body);
}

/** package-info.java：只允许 package 声明 + 注释，所以不套 javaFile。 */
function renderPackageInfo() {
  const lines = [
    GENERATED_HEADER,
    "/**",
    " * LCP 元数据协议 " + PROTOCOL_VERSION + " 的 Java 绑定。",
    " *",
    " * 本包由 tools/gen-java.mjs 从 schema/*.schema.json 与 registry/*.json 生成，",
    " * 与 TypeScript 侧的 ts/ 逐类型同名 —— 这是硬约束：AI 提示词、Code Connect、出码引擎",
    " * 都靠这个名字把两端对上。",
    " *",
    " * 分包：",
    " *   dto      元数据 DTO（判别联合生成 interface + 成员类）",
    " *   enums    枚举（$defs 级 + 属性级内联枚举）",
    " *   registry 注册表（字段类型映射 / 表达式 / 内置组件 / 别名）",
    " *   document 5 份文档型 Schema 的根容器",
    " *   support  ObjectMapper 装配与 JSONB 契约",
    " *",
    " * 要改契约请改 schema/ 或 registry/ 后重新生成，不要手改本包任何文件。",
    " */",
    "package " + PKG_ROOT + ";",
  ];
  return lines.join("\n") + "\n";
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 9. document/：5 份文档型 Schema 的根容器                            */
/* ------------------------------------------------------------------ */

/**
 * 根容器 = Schema 顶层的那个 properties（dataSchema / uiSchema / ...）。
 * 实测这几份 Schema 的顶层属性都是一根 $ref（dataSchema -> $defs/DataSchema），也就是
 * 文档根和 $defs 里的类型同一份结构 —— 那就只做一层具名继承：文档入口有独立类型名，
 * 字段与校验注解仍然只有一份，不会漂移。顶层属性若内联定义了 properties，则退回 renderClass。
 * 这些类在 TS 侧没有对应物（TS 直接引用 DataSchema 等 $defs），所以不参与两端名字对齐；
 * 但它们必须排在所有 $defs 之后渲染，否则会抢占别人的名字。
 */
function renderDocumentRoot(spec) {
  const root = schemas[spec.file];
  const source = (root.properties ?? {})[spec.property];
  if (!source) {
    fail(spec.file + " 的顶层属性 " + spec.property + " 不存在，根容器无法生成");
    return null;
  }

  if (isPureRef(source)) {
    const target = refTargetOf(source.$ref, spec.file);
    const info = DEF_TYPE.get(target.key);
    if (info === undefined || (info.mode !== "class" && info.mode !== "iface" && info.mode !== "flat")) {
      fail(spec.file + " 的顶层属性 " + spec.property + " 指向的不是对象定义，根容器无法继承：" + target.key);
      return null;
    }
    const ctx = makeCtx(PKG_DOCUMENT);
    const base = refTypeOf(source.$ref, spec.file, ctx);
    const body = [];
    body.push(
      ...javaDoc(source, [
        "根容器：" + spec.file + ".schema.json 的顶层属性 " + spec.property + " 就是 $defs/" + target.name + " 的引用，",
        "所以这里只做一层具名继承 —— 文档入口有独立类型名，字段与校验注解仍然只有一份。",
      ]),
    );
    body.push("public class " + spec.className + " extends " + base + " {");
    body.push("}");
    return javaFile(PKG_DOCUMENT, ctx, body);
  }

  const node = {
    description: source.description,
    properties: source.properties ?? {},
    required: source.required ?? [],
    additionalProperties: false,
  };
  if (Object.keys(node.properties).length === 0) {
    fail(spec.file + " 的根属性 " + spec.property + " 既不是 $ref 也没有 properties");
    return null;
  }
  return renderClass({
    name: spec.className,
    file: spec.file,
    ownerKey: spec.file + ".$root." + spec.property,
    node,
    pkg: PKG_DOCUMENT,
    extra: ["根容器：对应 " + spec.file + ".schema.json 的顶层属性 " + spec.property + "，可直接 readValue 成一整份文档。"],
  });
}

/* ==== CHUNK-BOUNDARY ==== */

/** 该定义是否真的有 Java 类型产出。别名与标量没有：info.name 与 TYPE_NAME 不等就属于这类。 */
function emittedTypeName(key) {
  const info = DEF_TYPE.get(key);
  if (info === undefined || info.name === undefined) return null;
  return info.name === TYPE_NAME.get(key) ? info.name : null;
}

/** 一路穿过别名，拿到终点所在的 Schema 键。 */
function aliasEndKey(file, node, depth) {
  if (depth > 40) fail("别名链超过 40 层，疑似成环：" + file);
  const target = refTargetOf(node.$ref, file);
  const targetNode = schemas[target.file].$defs[target.name];
  return isPureRef(targetNode) ? aliasEndKey(target.file, targetNode, depth + 1) : target.key;
}

/** 该定义落到 Java 里的类型名：标量走 prim 的 type，其余走 name。 */
function resolvedJavaType(key) {
  const info = DEF_TYPE.get(key);
  if (info === undefined) return null;
  if (info.mode === "prim") return info.type;
  return info.name === undefined ? null : info.name;
}

/**
 * 别名表。Java 没有类型别名，所以纯 $ref 定义不生成类，字段类型直接落到终点类型；
 * 这张表让出码引擎、AI 提示词、以及读 Schema 的人还能把 schemaKey 反查回 Java 类型名。
 */
function renderAliases() {
  const ctx = makeCtx(PKG_REGISTRY);
  const listType = useQualified(ctx, FQN.List);
  const mapType = useQualified(ctx, FQN.Map);
  const linkedMap = useQualified(ctx, FQN.LinkedHashMap);
  const arrayList = useQualified(ctx, "java.util.ArrayList");
  const collections = useQualified(ctx, "java.util.Collections");
  const aliases = [];
  for (const file of FILES) {
    for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
      if (!isPureRef(node)) continue;
      const endKey = aliasEndKey(file, node, 0);
      aliases.push({ key: file + "." + name, endKey, javaType: resolvedJavaType(endKey) ?? "JsonNode" });
    }
  }
  const body = [];
  body.push(...javaDoc({ description: null }, [
    "别名表：" + aliases.length + " 个纯 $ref 定义在 Java 侧不生成类（Java 没有类型别名），字段类型直接落到终点。",
    "schemaKey 的格式是 <文件名>.<定义名>，不是 Java 类名 —— 别把两者混着用。",
    "出码引擎与 AI 提示词靠这张表做「Schema 定义 -> Java 类型」的反查。",
  ]));
  body.push("public final class Aliases {");
  body.push("    /** 一条别名：schemaKey 是 <文件名>.<定义名>，endKey 是一路穿透后落到的 Schema 键，javaType 是终点 Java 类型。 */");
  body.push("    public record Alias(String schemaKey, String endKey, String javaType) {}");
  body.push("");
  body.push("    public static final " + listType + "<Alias> ENTRIES = " + listType + ".of(");
  aliases.forEach((alias, index) => {
    const args = [javaStringLiteral(alias.key), javaStringLiteral(alias.endKey), javaStringLiteral(alias.javaType)];
    body.push("        new Alias(" + args.join(", ") + ")" + (index === aliases.length - 1 ? "" : ","));
  });
  body.push("    );");
  body.push("");
  body.push("    private static final " + mapType + "<String, Alias> BY_KEY = buildIndex();");
  body.push("");
  body.push("    private static " + mapType + "<String, Alias> buildIndex() {");
  body.push("        " + mapType + "<String, Alias> index = new " + linkedMap + "<>();");
  body.push("        for (Alias alias : ENTRIES) index.put(alias.schemaKey(), alias);");
  body.push("        return " + collections + ".unmodifiableMap(index);");
  body.push("    }");
  body.push("");
  body.push("    /** 按 schemaKey 取别名；不是别名则返回 null。 */");
  body.push("    public static Alias of(String schemaKey) {");
  body.push("        return BY_KEY.get(schemaKey);");
  body.push("    }");
  body.push("");
  body.push("    /** 按 schemaKey 取终点 Java 类型名；不是别名则返回 null。 */");
  body.push("    public static String javaTypeOf(String schemaKey) {");
  body.push("        Alias alias = BY_KEY.get(schemaKey);");
  body.push("        return alias == null ? null : alias.javaType();");
  body.push("    }");
  body.push("");
  body.push("    /** 反查：哪些 schemaKey 落到了同一个 Java 类型（出码时用来判断" + "\u201c" + "这几个定义其实是一个类型" + "\u201d" + "）。 */");
  body.push("    public static " + listType + "<String> schemaKeysFor(String javaType) {");
  body.push("        " + listType + "<String> out = new " + arrayList + "<>();");
  body.push("        for (Alias alias : ENTRIES) {");
  body.push("            if (alias.javaType().equals(javaType)) out.add(alias.schemaKey());");
  body.push("        }");
  body.push("        return " + collections + ".unmodifiableList(out);");
  body.push("    }");
  body.push("");
  body.push("    private Aliases() {}");
  body.push("}");
  return javaFile(PKG_REGISTRY, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/**
 * registry/builtin-components.json -> BuiltinComponentRegistry。
 * 刻意【不在编译期内联】这 38 份组件契约（104KB）：注册表是运营期可替换的数据，
 * 内联进 class 文件等于把「换一份注册表」变成「重新编译发布」，正好和平台的可配置目标相反。
 * 所以这里只做「从 classpath 加载 + 类型化查询」，数据永远来自 resources/lcp/builtin-components.json。
 */
function renderBuiltinComponentRegistry() {
  const ctx = makeCtx(PKG_REGISTRY);
  const jsonNode = useQualified(ctx, FQN.JsonNode);
  const objectMapper = useQualified(ctx, "com.fasterxml.jackson.databind.ObjectMapper");
  const listType = useQualified(ctx, FQN.List);
  const arrayList = useQualified(ctx, "java.util.ArrayList");
  const mapType = useQualified(ctx, FQN.Map);
  const linkedMap = useQualified(ctx, FQN.LinkedHashMap);
  const collections = useQualified(ctx, "java.util.Collections");
  const inputStream = useQualified(ctx, "java.io.InputStream");
  const ioException = useQualified(ctx, "java.io.IOException");
  const names = builtinComponents.components.map(component => component.name);
  const body = [];
  body.push(...javaDoc({ description: builtinComponents.description }, [
    "内置组件注册表（" + names.length + " 个组件）。数据来自随包发布的 " + "/lcp/builtin-components.json，不在编译期内联。",
    "设计器属性面板、运行时渲染器、校验器、出码引擎、AI 生成器五方读同一份。",
  ]));
  body.push("public final class BuiltinComponentRegistry {");
  body.push("    /** 随包发布的注册表资源路径，对应 src/main/resources/lcp/builtin-components.json。 */");
  body.push("    public static final String RESOURCE = \"/lcp/builtin-components.json\";");
  body.push("");
  body.push("    /** 已登记组件名（x- 前缀），顺序与注册表一致，给设计器组件面板与校验器白名单用。 */");
  body.push("    public static final " + listType + "<String> COMPONENT_NAMES = " + javaLiteral(ctx, names) + ";");
  body.push("");
  body.push("    private static final " + jsonNode + " ROOT = load();");
  body.push("");
  body.push("    private static final " + mapType + "<String, " + jsonNode + "> BY_NAME = index();");
  body.push("");
  body.push("    private BuiltinComponentRegistry() {}");
  body.push("");
  body.push("    /** 注册表版本。AppBundle 声明依赖的版本号与此比对，不一致时出码引擎要拦下来。 */");
  body.push("    public static int registryVersion() {");
  body.push("        return ROOT.path(" + javaStringLiteral("registryVersion") + ").asInt();");
  body.push("    }");
  body.push("");
  body.push("    /** 取一份组件契约（含 props / capabilities / slots）。未登记返回 null。 */");
  body.push("    public static " + jsonNode + " of(String name) {");
  body.push("        return BY_NAME.get(name);");
  body.push("    }");
  body.push("");
  body.push("    /** 按 kind 过滤：layout / container / data / field / display / action / advanced。 */");
  body.push("    public static " + listType + "<String> namesByKind(String kind) {");
  body.push("        " + listType + "<String> out = new " + arrayList + "<>();");
  body.push("        for (" + jsonNode + " component : ROOT.path(" + javaStringLiteral("components") + ")) {");
  body.push("            if (component.path(" + javaStringLiteral("kind") + ").asText().equals(kind)) out.add(component.path(" + javaStringLiteral("name") + ").asText());");
  body.push("        }");
  body.push("        return " + collections + ".unmodifiableList(out);");
  body.push("    }");
  body.push("");
  body.push("    /** 字段绑定优先级说明，原样来自注册表 —— 它是「控件怎么被选中」的唯一权威描述。 */");
  body.push("    public static String fieldBindingRule() {");
  body.push("        return ROOT.path(" + javaStringLiteral("fieldBindingRule") + ").asText();");
  body.push("    }");
  body.push("");
  body.push("    /** 结构化 prop 的元素契约说明（columnList / fieldList / items 等）。 */");
  body.push("    public static String itemContractNote() {");
  body.push("        return ROOT.path(" + javaStringLiteral("itemContractNote") + ").asText();");
  body.push("    }");
  body.push("");
  body.push("    /** 原始注册表树，给「不想跟着 DTO 版本走」的通用工具用。 */");
  body.push("    public static " + jsonNode + " root() {");
  body.push("        return ROOT;");
  body.push("    }");
  body.push("");
  body.push("    private static " + mapType + "<String, " + jsonNode + "> index() {");
  body.push("        " + mapType + "<String, " + jsonNode + "> index = new " + linkedMap + "<>();");
  body.push("        for (" + jsonNode + " component : ROOT.path(" + javaStringLiteral("components") + ")) {");
  body.push("            index.put(component.path(" + javaStringLiteral("name") + ").asText(), component);");
  body.push("        }");
  body.push("        return " + collections + ".unmodifiableMap(index);");
  body.push("    }");
  body.push("");
  body.push("    private static " + jsonNode + " load() {");
  body.push("        try (" + inputStream + " stream = BuiltinComponentRegistry.class.getResourceAsStream(RESOURCE)) {");
  body.push("            if (stream == null) {");
  body.push("                throw new IllegalStateException(" + javaStringLiteral("组件注册表资源缺失：") + " + RESOURCE + " + javaStringLiteral("（生成产物会随包发布，不要手工删）" ) + ");");
  body.push("            }");
  body.push("            return new " + objectMapper + "().readTree(stream);");
  body.push("        } catch (" + ioException + " error) {");
  body.push("            throw new IllegalStateException(" + javaStringLiteral("组件注册表读取失败：") + " + RESOURCE, error);");
  body.push("        }");
  body.push("    }");
  body.push("}");
  return javaFile(PKG_REGISTRY, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/**
 * schema/expression-registry.json -> ExpressionRegistry。
 * 这里只做类型化再导出，不复制语义 —— 表达式求值规则永远只有注册表一份。
 * 值对象统一用 record（Java 17），只有 type-mapping 那张 28 列的宽表用 class。
 */
function renderExpressionRegistry() {
  const ctx = makeCtx(PKG_REGISTRY);
  const listType = useQualified(ctx, FQN.List);
  const mapType = useQualified(ctx, FQN.Map);
  const linkedMap = useQualified(ctx, FQN.LinkedHashMap);
  const collections = useQualified(ctx, "java.util.Collections");
  const functions = expressionRegistry.functions;
  const roots = expressionRegistry.valueRoots;
  const queries = expressionRegistry.queryOperators;
  const body = [];
  body.push(...javaDoc({ description: expressionRegistry.description }, [
    "表达式 DSL 注册表，由 schema/expression-registry.json 生成。",
    "设计器补全、AI 生成提示词、服务端求值器、出码引擎四方共用这一份语义。",
  ]));
  body.push("public final class ExpressionRegistry {");
  body.push("    public static final String PROTOCOL_VERSION = " + javaStringLiteral(expressionRegistry.protocolVersion) + ";");
  body.push("");
  body.push("    /** 表达式节点算子：$lit 字面量、$ref 取值、$fn 调用、$tpl 模板串、$if 条件。 */");
  body.push("    public static final " + listType + "<String> OPERATORS = " + javaLiteral(ctx, expressionRegistry.operators) + ";");
  body.push("");
  body.push("    /** 值类型系统。 */");
  body.push("    public static final " + listType + "<String> TYPES = " + javaLiteral(ctx, expressionRegistry.types) + ";");
  body.push("");
  body.push("    /** 取值根全集。表达式的数据来源只能挂在这些根上，业务代码不得自造根。 */");
  body.push("    public static final " + listType + "<String> VALUE_ROOT_NAMES = " + javaLiteral(ctx, roots.map(root => root.name)) + ";");
  body.push("");
  body.push("    /** 取值根的约定字段名（租户可扩展，但约定名不能改：出码模板与 AI 提示词都依赖它）。 */");
  body.push("    public static final " + mapType + "<String, " + listType + "<String>> VALUE_ROOT_FIELDS = buildValueRootFields();");
  body.push("");
  body.push("    private static " + mapType + "<String, " + listType + "<String>> buildValueRootFields() {");
  body.push("        " + mapType + "<String, " + listType + "<String>> fields = new " + linkedMap + "<>();");
  for (const root of roots) body.push("        fields.put(" + javaStringLiteral(root.name) + ", " + javaLiteral(ctx, Object.keys(root.fields ?? {})) + ");");
  body.push("        return " + collections + ".unmodifiableMap(fields);");
  body.push("    }");
  body.push("");
  body.push("    /**");
  body.push("     * 内置函数。arity 是闭区间 [minArity, maxArity]；variadic 为真表示尾参可变，此时 maxArity 只是建议上限。");
  body.push("     */");
  body.push("    public record Function(String name, String category, int minArity, int maxArity, boolean variadic, String returns, boolean pure, " + listType + "<String> params, String description) {}");
  body.push("");
  body.push("    /** 全部内置函数（" + functions.length + " 个）。 */");
  body.push("    public static final " + listType + "<Function> FUNCTIONS = " + listType + ".of(");
  functions.forEach((fn, index) => {
    const arity = Array.isArray(fn.arity) ? fn.arity : [fn.arity, fn.arity];
    const args = [
      javaStringLiteral(fn.name),
      javaStringLiteral(fn.cat),
      String(arity[0] ?? 0),
      String(arity[1] ?? arity[0] ?? 0),
      String(fn.variadic === true),
      javaStringLiteral(fn.returns),
      String(fn.pure === true),
      javaLiteral(ctx, fn.params ?? []),
      javaStringLiteral(fn.desc ?? ""),
    ];
    body.push("        new Function(" + args.join(", ") + ")" + (index === functions.length - 1 ? "" : ","));
  });
  body.push("    );");
  body.push("");
  body.push("    /** 取值根。fields 是「约定字段名 -> 值类型」；nullable 为真表示该根在部分场景下不存在（如流程外的 $process）。 */");
  body.push("    public record ValueRoot(String name, String type, boolean nullable, String description, " + listType + "<String> fields) {}");
  body.push("");
  body.push("    public static final " + listType + "<ValueRoot> VALUE_ROOTS = " + listType + ".of(");
  roots.forEach((root, index) => {
    const args = [
      javaStringLiteral(root.name),
      javaStringLiteral(root.type),
      String(root.nullable === true),
      javaStringLiteral(root.desc ?? ""),
      javaLiteral(ctx, Object.keys(root.fields ?? {})),
    ];
    body.push("        new ValueRoot(" + args.join(", ") + ")" + (index === roots.length - 1 ? "" : ","));
  });
  body.push("    );");
  body.push("");
  body.push("    /** 查询算子：设计器「查询条件」面板直接读这张表生成下拉与 SQL 片段。{col} 是列占位，{p} 是参数占位。 */");
  body.push("    public record QueryOperator(String op, String label, int args, String sql, String widgetHint, String note) {}");
  body.push("");
  body.push("    public static final " + listType + "<QueryOperator> QUERY_OPERATORS = " + listType + ".of(");
  queries.forEach((query, index) => {
    const args = [
      javaStringLiteral(query.op),
      javaStringLiteral(query.label ?? ""),
      String(query.args ?? 0),
      javaStringLiteral(query.sql ?? ""),
      javaStringLiteral(query.widgetHint ?? ""),
      query.note === undefined ? "null" : javaStringLiteral(query.note),
    ];
    body.push("        new QueryOperator(" + args.join(", ") + ")" + (index === queries.length - 1 ? "" : ","));
  });
  body.push("    );");
  body.push("");
  body.push("    private ExpressionRegistry() {}");
  body.push("}");
  return javaFile(PKG_REGISTRY, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/** registry/type-mapping.json -> FieldTypeMapping。列由 Schema 里真实出现的「组名 + 键名」推导，不写死。 */
function renderFieldTypeMapping() {
  const ctx = makeCtx(PKG_REGISTRY);
  const groups = ["pg", "ts", "java", "widget", "semantic"];
  const columnMap = new Map();
  for (const group of groups) {
    for (const spec of Object.values(typeMapping.types)) {
      for (const [key, value] of Object.entries(spec[group] ?? {})) {
        const field = group + capitalize(key);
        if (!columnMap.has(field)) columnMap.set(field, { field, group, key, values: [] });
        columnMap.get(field).values.push(value);
      }
    }
  }
  const columns = [...columnMap.values()].map(column => ({ ...column, javaType: javaValueType(column.values) }));
  const entryType = "Entry";
  const listType = useQualified(ctx, FQN.List);
  const mapType = useQualified(ctx, FQN.Map);
  const linkedMap = useQualified(ctx, FQN.LinkedHashMap);
  const collections = useQualified(ctx, "java.util.Collections");
  const rows = Object.entries(typeMapping.types);
  const body = [];
  body.push(...javaDoc({ description: typeMapping.description }, [
    "字段类型映射表，由 registry/type-mapping.json 生成。",
    "这是「建表 DDL / TypeScript 类型 / Java DTO / 设计器控件 / AI 语义」五处共用的单一来源，",
    "任何一处想改某个字段类型的落库方式，都要改注册表再重新生成，不要在业务代码里写死。",
  ]));
  body.push("public final class FieldTypeMapping {");
  body.push("    /** 协议版本。Schema / Bundle / 注册表三者必须一致，L1 校验会比对。 */");
  body.push("    public static final String PROTOCOL_VERSION = " + javaStringLiteral(typeMapping.protocolVersion) + ";");
  body.push("");
  body.push("    /** 字段类型全集，与 Schema 的 data.FieldType 一一对应。 */");
  body.push("    public static final " + listType + "<String> FIELD_TYPES = " + javaLiteral(ctx, Object.keys(typeMapping.types)) + ";");
  body.push("");
  body.push("    /** 全部映射条目。 */");
  body.push("    public static final " + listType + "<" + entryType + "> ENTRIES = " + listType + ".of(");
  rows.forEach(([name, spec], index) => {
    const args = [javaStringLiteral(name)];
    for (const column of columns) args.push(javaLiteral(ctx, spec[column.group]?.[column.key] ?? null));
    body.push("        new " + entryType + "(" + args.join(", ") + ")" + (index === rows.length - 1 ? "" : ","));
  });
  body.push("    );");
  body.push("");
  body.push("    private static final " + mapType + "<String, " + entryType + "> BY_FIELD_TYPE = buildIndex();");
  body.push("");
  body.push("    private static " + mapType + "<String, " + entryType + "> buildIndex() {");
  body.push("        " + mapType + "<String, " + entryType + "> index = new " + linkedMap + "<>();");
  body.push("        for (" + entryType + " entry : ENTRIES) index.put(entry.fieldType(), entry);");
  body.push("        return " + collections + ".unmodifiableMap(index);");
  body.push("    }");
  body.push("");
  body.push("    /** 按字段类型取映射；未登记的类型返回 null（调用点负责把它变成校验错误）。 */");
  body.push("    public static " + entryType + " of(String fieldType) {");
  body.push("        return BY_FIELD_TYPE.get(fieldType);");
  body.push("    }");
  body.push("");
  body.push("    private FieldTypeMapping() {}");
  body.push("");
  body.push("    /** 单个字段类型的完整映射。字段名 = 组名 + 键名，例如 pg.base -> pgBase。 */");
  body.push("    public static final class " + entryType + " {");
  const declared = [{ field: "fieldType", javaType: "String" }, ...columns];
  for (const column of declared) body.push("        private final " + column.javaType + " " + column.field + ";");
  body.push("");
  body.push("        private " + entryType + "(" + declared.map(c => c.javaType + " " + c.field).join(", ") + ") {");
  for (const column of declared) body.push("            this." + column.field + " = " + column.field + ";");
  body.push("        }");
  for (const column of declared) {
    body.push("");
    body.push("        public " + column.javaType + " " + column.field + "() {");
    body.push("            return " + column.field + ";");
    body.push("        }");
  }
  body.push("    }");
  body.push("}");
  return javaFile(PKG_REGISTRY, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 8. 注册表类（type-mapping / expression-registry / 内置组件 / 别名）  */
/* ------------------------------------------------------------------ */

/**
 * JSON 取值 -> Java 字面量。
 * 只支持注册表里实际出现的形态：null、字符串、数字、布尔、字符串数组、标量对象。
 * 出现别的形态宁可失败也不要猜 —— 猜出来的 Java 是编译不过的。
 */
function javaLiteral(ctx, value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return javaStringLiteral(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const scalar = item => (typeof item === "string" ? javaStringLiteral(item) : item === null ? "null" : String(item));
  if (Array.isArray(value)) {
    const listType = useQualified(ctx, FQN.List);
    if (value.some(item => typeof item === "object" && item !== null)) fail("注册表里出现对象数组，javaLiteral 处理不了");
    return listType + (value.every(item => typeof item === "string") ? ".<String>of(" : ".<Object>of(") + value.map(scalar).join(", ") + ")";
  }
  const mapType = useQualified(ctx, FQN.Map);
  const parts = [];
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && typeof item === "object") fail("注册表里出现二层的嵌套对象，javaLiteral 处理不了：" + key);
    parts.push(javaStringLiteral(key), scalar(item));
  }
  if (parts.length === 0) return mapType + ".<String, Object>of()";
  if (parts.length > 20) fail("Map.of 最多 10 个键值对，超了要改用 Map.ofEntries");
  return mapType + ".<String, Object>of(" + parts.join(", ") + ")";
}

/** 一列取值的并集 -> Java 字段类型。null 不参与推断（可空性和类型是两件事）。 */
function javaValueType(values) {
  const kinds = new Set();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    kinds.add(Array.isArray(value) ? "array" : typeof value);
  }
  const inferred = [...kinds];
  if (inferred.length === 0) return "String";
  if (inferred.length > 1) return "Object";
  if (inferred[0] === "number") return "Integer";
  if (inferred[0] === "boolean") return "Boolean";
  if (inferred[0] === "string") return "String";
  if (inferred[0] === "array") return "List<String>";
  if (inferred[0] === "object") return "Map<String, Object>";
  return fail("无法推断注册表列类型：" + inferred.join(","));
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 7. 枚举渲染（def 级 6 个 + 属性级内联 88 个）                        */
/* ------------------------------------------------------------------ */

/**
 * 枚举常量名。screaming 之外还要保证合法且唯一：
 * "date-time" 与 "date_time" 都会变成 DATE_TIME，数字开头要补下划线。
 */
function enumConstants(values) {
  const used = new Set();
  return values.map((value, index) => {
    let constant = screaming(value);
    if (constant === "") constant = "VALUE" + index;
    if (/^[0-9]/.test(constant)) constant = "_" + constant;
    if (used.has(constant)) {
      let suffix = 2;
      while (used.has(constant + "_" + suffix)) suffix += 1;
      constant = constant + "_" + suffix;
    }
    used.add(constant);
    return { constant, value };
  });
}

/** 枚举类：@JsonValue 出原始字面量，@JsonCreator 只认白名单（见 fromValue 的注释）。 */
function renderEnum(name, values, node, extra) {
  const ctx = makeCtx(PKG_ENUMS);
  const constants = enumConstants(values);
  const listType = useQualified(ctx, FQN.List);
  const arrayList = useQualified(ctx, "java.util.ArrayList");
  const body = [];
  body.push(...javaDoc(node ?? {}, extra));
  body.push("public enum " + name + " {");
  constants.forEach((item, index) => {
    body.push("    " + item.constant + "(" + javaStringLiteral(item.value) + ")" + (index === constants.length - 1 ? ";" : ","));
  });
  body.push("");
  body.push("    private final String value;");
  body.push("");
  body.push("    " + name + "(String value) {");
  body.push("        this.value = value;");
  body.push("    }");
  body.push("");
  body.push("    /** 协议里的原始字面量（Schema 的 enum 取值）。 */");
  body.push("    @" + jackson(ctx, "JsonValue"));
  body.push("    public String value() {");
  body.push("        return value;");
  body.push("    }");
  body.push("");
  body.push("    /**");
  body.push("     * 反序列化。未知取值直接抛异常，不做 _UNKNOWN 兜底：");
  body.push("     * 本包按协议版本生成（v01 对应 0.1），收到未知取值说明对端在用更新版本的协议，");
  body.push("     * 那是部署错误而不是数据错误，静默兜底只会把问题推到更难查的地方。");
  body.push("     */");
  body.push("    @" + jackson(ctx, "JsonCreator"));
  body.push("    public static " + name + " fromValue(String raw) {");
  body.push("        for (" + name + " item : values()) {");
  body.push("            if (item.value.equals(raw)) return item;");
  body.push("        }");
  body.push("        throw new IllegalArgumentException(" + javaStringLiteral("未知的 " + name + " 取值：") + " + raw);");
  body.push("    }");
  body.push("");
  body.push("    /** 白名单字面量，给校验器与设计器属性面板用。 */");
  body.push("    public static " + listType + "<String> allowed() {");
  body.push("        " + listType + "<String> out = new " + arrayList + "<>();");
  body.push("        for (" + name + " item : values()) out.add(item.value);");
  body.push("        return out;");
  body.push("    }");
  body.push("}");
  return javaFile(PKG_ENUMS, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/**
 * 非判别联合且分支全是对象 -> 扁平类。
 * Java 没有联合类型，所以把各分支字段并排列进同一个类，用分支谓词 + head() 表达「命中了哪种形态」。
 * TS 那边的同名分支 interface（UiHandlerRefActionRef / UiHandlerRefSteps）在 Java 侧不生成 ——
 * 这是两端唯一的类型名差集，自检里按白名单放行。
 */
function renderFlat(spec) {
  const node = spec.node;
  const merged = {};
  const collisions = [];
  for (const branch of node.oneOf) {
    for (const [propName, propSchema] of Object.entries(branch.properties ?? {})) {
      if (merged[propName] !== undefined) {
        if (JSON.stringify(merged[propName]) !== JSON.stringify(propSchema)) collisions.push(propName);
        continue;
      }
      merged[propName] = propSchema;
    }
  }
  if (collisions.length > 0) {
    fail(spec.name + " 的扁平联合里同一属性名在多个分支上定义不同：" + [...new Set(collisions)].join(", "));
  }
  return renderClass({
    name: spec.name,
    file: spec.file,
    ownerKey: spec.key,
    node: { description: node.description, properties: merged, required: [], additionalProperties: false },
    flat: node.oneOf,
    extra: ["扁平联合：" + node.oneOf.length + " 个分支的字段并列，用 is<分支>() 与 head() 判断命中的形态。"],
  });
}

/**
 * 非判别联合里含裸标量分支（协议里只有 common.Text: string | {default, i18n}）-> JsonNode 透传包装。
 * 对象分支照常生成具名类（与 TS 的 CommonTextDefault 同名），包装类只负责透明收发 + 取值便利方法。
 */
function renderPassthrough(spec) {
  const ctx = makeCtx(PKG_DTO);
  const node = spec.node;
  const jsonNode = useQualified(ctx, FQN.JsonNode);
  const mapType = useQualified(ctx, FQN.Map);
  const linkedMap = useQualified(ctx, FQN.LinkedHashMap);
  const iterator = useQualified(ctx, "java.util.Iterator");
  const body = [];
  body.push(...javaDoc(node, ["透传包装：该定义是「裸标量 | 对象」的联合，Java 用 JsonNode 原样收发，取值走下面的便利方法。"]));
  body.push("public final class " + spec.name + " {");
  body.push("    private final " + jsonNode + " value;");
  body.push("");
  body.push("    @" + jackson(ctx, "JsonCreator") + "(mode = JsonCreator.Mode.DELEGATING)");
  body.push("    public " + spec.name + "(" + jsonNode + " value) {");
  body.push("        this.value = value;");
  body.push("    }");
  body.push("");
  body.push("    /** 原始节点。@JsonValue 保证序列化后仍是原来的标量或对象，不会多出一层包装。 */");
  body.push("    @" + jackson(ctx, "JsonValue"));
  body.push("    public " + jsonNode + " raw() {");
  body.push("        return value;");
  body.push("    }");
  body.push("");
  body.push("    @" + jackson(ctx, "JsonIgnore"));
  body.push("    public boolean isPlainText() {");
  body.push("        return value != null && value.isTextual();");
  body.push("    }");
  body.push("");
  body.push("    /** 标量形态直接返回；对象形态取 default 键；都没有则返回 null。 */");
  body.push("    @" + jackson(ctx, "JsonIgnore"));
  body.push("    public String asText() {");
  body.push("        if (value == null || value.isNull()) return null;");
  body.push("        if (value.isTextual()) return value.textValue();");
  body.push("        return value.path(\"default\").asText(null);");
  body.push("    }");
  body.push("");
  body.push("    @" + jackson(ctx, "JsonIgnore"));
  body.push("    public boolean hasI18n() {");
  body.push("        return value != null && value.isObject() && value.has(\"i18n\");");
  body.push("    }");
  body.push("");
  body.push("    /** i18n 表（语言标签 -> 文案）。没有 i18n 键时返回空表，不返回 null。 */");
  body.push("    @" + jackson(ctx, "JsonIgnore"));
  body.push("    public " + mapType + "<String, String> i18n() {");
  body.push("        " + mapType + "<String, String> out = new " + linkedMap + "<>();");
  body.push("        if (!hasI18n()) return out;");
  body.push("        for (" + iterator + "<" + mapType + ".Entry<String, " + jsonNode + ">> it = value.path(\"i18n\").fields(); it.hasNext(); ) {");
  body.push("            " + mapType + ".Entry<String, " + jsonNode + "> entry = it.next();");
  body.push("            out.put(entry.getKey(), entry.getValue().asText());");
  body.push("        }");
  body.push("        return out;");
  body.push("    }");
  body.push("}");
  return javaFile(PKG_DTO, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */

/* ------------------------------------------------------------------ */
/* 6b. 判别联合 / 扁平联合 / 透传包装                                   */
/* ------------------------------------------------------------------ */

/** 扁平联合的分支谓词名：剥掉所有者前缀，"UiHandlerRefActionRef" -> "ActionRef"。 */
function flatPredicateName(typeName, branch, index) {
  const memberName = unionMemberName(typeName, branch, index);
  const suffix = memberName.startsWith(typeName) ? memberName.slice(typeName.length) : "";
  return suffix === "" ? "Branch" + (index + 1) : suffix;
}

/**
 * 判别联合 -> interface + @JsonTypeInfo/@JsonSubTypes。
 * 判别值取【每个分支自己的 const】，不是统一取第一个分支的 —— logic.ApiAuth 的 7 个分支
 * 判别键虽然都是 type，但各自的 const 与 required 并不一致，统一取会写错。
 * 成员类保留 type 字段（带 const 初值、无 setter），所以两条序列化路径都不会漏这个键。
 */
function renderInterface(spec) {
  const ctx = makeCtx(PKG_DTO);
  const node = spec.node;
  const members = IFACE_MEMBERS.get(spec.key) ?? [];
  if (members.length === 0) fail(spec.name + " 是判别联合但一个成员都没有");
  const subtypeLines = [];
  for (const member of members) {
    const ownerName = member.defKey !== undefined ? TYPE_NAME.get(member.defKey) : member.name;
    subtypeLines.push(
      "    @" + jackson(ctx, "JsonSubTypes") + ".Type(value = " + useQualified(ctx, PKG_DTO + "." + ownerName) + ".class, name = " + javaStringLiteral(member.typeValue) + "),",
    );
  }
  const body = [];
  body.push(...javaDoc(node, ["判别联合：按 " + spec.discriminatorKey + " 的取值分派到成员类，成员类持有同名 const 字段作为单一来源。"]));
  body.push(
    "@" + jackson(ctx, "JsonTypeInfo") + "(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = " + javaStringLiteral(spec.discriminatorKey) + ", visible = true)",
  );
  body.push("@" + jackson(ctx, "JsonSubTypes") + "({");
  body.push(...subtypeLines);
  body.push("})");
  body.push("public interface " + spec.name + " {");
  body.push("}");
  return javaFile(PKG_DTO, ctx, body);
}

/* ==== CHUNK-BOUNDARY ==== */
/* ------------------------------------------------------------------ */
/* 4. 预扫：每个 $defs 落成什么 Java 形态                               */
/* ------------------------------------------------------------------ */

const DEF_TYPE = new Map(); // key -> { mode, name?, type?, imports? }
const IFACE_MEMBERS = new Map(); // ifaceKey -> [{ defKey?, name?, typeValue }]
const MEMBER_OF = new Map(); // 成员 def key -> { ifaceName, typeValue, discriminatorKey }
const EXTRA_CLASSES = []; // 判别联合里的内联成员、非判别联合的对象分支
const NESTED_CLASSES = []; // 属性级内联对象
const NESTED_ENUMS = []; // 属性级内联枚举
const nestedNameByHint = new Map();
const nestedEnumByHint = new Map();
const enumNames = new Map(); // 内联枚举名 -> 值列表（与 usedNames 分开，避免打乱 gen-ts 的取名顺序）

/** 分支的判别键与判别值。先看 type，其次 kind / mode / op（当前 Schema 只用 type）。 */
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

/** 与 gen-ts.mjs 的 unionMemberName 同函数同名，保证成员类两端同名。 */
function unionMemberName(ownerName, branch, index) {
  if (branch.title) return ownerName + pascal(branch.title);
  const constValue = branch.properties?.type?.const;
  if (typeof constValue === "string") return ownerName + pascal(constValue);
  const required = branch.required;
  if (Array.isArray(required) && required.length > 0) return ownerName + pascal(required[0]);
  return ownerName + "Variant" + (index + 1);
}

/** anyOf 里只含 required 的合法子句 -> [[a], [b, c]]；否则 null。 */
function constraintClauses(node) {
  if (!node.properties || !node.anyOf) return null;
  const clauses = [];
  for (const branch of node.anyOf) {
    const keys = branch.required;
    if (!Array.isArray(keys) || keys.length === 0) return null;
    if (Object.keys(branch).some(branchKey => branchKey !== "required")) return null;
    clauses.push(keys);
  }
  return clauses;
}

const primType = build => {
  const ctx = makeCtx(PKG_DTO);
  const type = build(ctx);
  return { mode: "prim", type, imports: [...ctx.imports] };
};

function classifyOneOf(file, key, node) {
  const typeName = TYPE_NAME.get(key);
  const discriminants = node.oneOf.map(branch => discriminantOf(branch, file));
  const discriminated =
    node.oneOf.length > 1 && discriminants.every(item => item.key !== null && typeof item.value === "string");

  if (discriminated) {
    const info = { mode: "iface", name: typeName, file, discriminatorKey: discriminants[0].key };
    DEF_TYPE.set(key, info); // 先登记，允许成员类型反向引用接口
    const members = node.oneOf.map((branch, index) => {
      const typeValue = discriminants[index].value;
      if (branch.$ref) {
        const target = refTargetOf(branch.$ref, file);
        MEMBER_OF.set(target.key, { ifaceName: typeName, typeValue, discriminatorKey: discriminants[index].key });
        return { defKey: target.key, typeValue };
      }
      const memberName = uniqueTypeName(unionMemberName(typeName, branch, index));
      EXTRA_CLASSES.push({
        name: memberName,
        node: branch,
        file,
        ownerKey: key,
        iface: typeName,
        typeValue,
        discriminatorKey: discriminants[index].key,
      });
      return { name: memberName, typeValue };
    });
    IFACE_MEMBERS.set(key, members);
    return info;
  }

  const objectBranches = node.oneOf.filter(branch => branch.properties && Object.keys(branch.properties).length > 0);
  if (objectBranches.length === node.oneOf.length) {
    // 分支全是对象 -> 扁平类：各分支字段并列，head() 指出命中的分支。
    return { mode: "flat", name: typeName, file };
  }
  // 含裸标量分支（只有 common.Text: string | {default, i18n}）-> JsonNode 透传 + 为对象分支生成成员类。
  node.oneOf.forEach((branch, index) => {
    if (!(branch.properties && Object.keys(branch.properties).length > 0)) return;
    const memberName = uniqueTypeName(unionMemberName(typeName, branch, index));
    EXTRA_CLASSES.push({ name: memberName, node: branch, file, ownerKey: key });
  });
  return { mode: "passthrough", name: typeName, file };
}

function classifyDef(file, name, seen) {
  const key = file + "." + name;
  const cached = DEF_TYPE.get(key);
  if (cached !== undefined) return cached;
  if (seen.has(key)) {
    fail("别名成环：" + [...seen, key].join(" -> "));
    return primType(() => "JsonNode");
  }
  seen.add(key);
  const node = schemas[file].$defs[name];
  let info;

  if (isPureRef(node)) {
    const target = refTargetOf(node.$ref, file);
    info = classifyDef(target.file, target.name, seen);
    DEF_TYPE.set(key, info);
    seen.delete(key);
    return info;
  }

  if (Array.isArray(node.enum)) {
    info = { mode: "enum", name: TYPE_NAME.get(key), file };
  } else if (node.oneOf) {
    info = classifyOneOf(file, key, node);
  } else if (node.anyOf) {
    const clauses = constraintClauses(node);
    if (!clauses) fail("非「仅 required」的 anyOf 未处理：" + key);
    info = { mode: "class", name: TYPE_NAME.get(key), file, constraint: clauses ?? undefined };
  } else if (node.type === "object" || node.properties !== undefined || node.additionalProperties !== undefined) {
    info = { mode: "class", name: TYPE_NAME.get(key), file };
  } else {
    info = primType(ctx => javaTypeOf(node, file, key, TYPE_NAME.get(key), ctx));
  }
  DEF_TYPE.set(key, info);
  seen.delete(key);
  return info;
}

/** 预扫驱动：DEF_TYPE 决定后面所有类型表达式，必须最先跑。 */
function preScan() {
  for (const file of FILES) {
    for (const name of Object.keys(schemas[file].$defs ?? {})) classifyDef(file, name, new Set());
  }
}

/* ================================================================== */
/* 14. 自检：本机没有 JDK，产物编译不了，只能让生成器自己把关            */
/* ------------------------------------------------------------------ */

/**
 * 括号配平检查（与 gen-ts.mjs 逐字同一个实现，两个生成器共用一套兜底）。
 * 本机没有 javac（离线环境装不了），产物没法编译验证，这里用一个「去注释去字符串后数括号」
 * 的粗糙但有效的兜底 —— 它能抓住 90% 的模板拼接错误（少一个 }、多一个 )）。
 */
function balanceCheck(fileName, text) {
  // 单遍扫描：必须同时跟踪字符串与注释，否则 "https://..." 里的 // 会被误判成行注释，
  // Java 字符串里的 { } 会被误判成代码括号（第一版就踩了这个坑）。
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
      if (character === '"' || character === "'") {
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

/*
 * 自检分七项。前四项是「产物自己讲不讲得通」，后三项是「与旁边的东西对不对得上」：
 *   ① 拼接体检（空类型、[object Object]）与括号配平
 *   ② 引用完整性：生成物点名的类型必须真有类
 *   ③ 目录 / package 声明 / public 类型名三者一致
 *   ④ 类型简单名全局唯一（同名两个类会拼出两条同 simple name 的 import）
 *   ⑤ 与 ts/types.ts 逐名对齐（两端同名是硬约束，差集只允许已登记的例外）
 *   ⑥ type-mapping 与 data.FieldType 一一对应
 *   ⑦ 随包资源在仓库里真实存在
 */
function selfCheck() {
  const producedNames = new Set(PRODUCED.map(item => item.typeName));

  const packageOfDir = new Map([
    [DTO_DIR, PKG_DTO],
    [ENUM_DIR, PKG_ENUMS],
    [REGISTRY_OUT_DIR, PKG_REGISTRY],
    [DOCUMENT_DIR, PKG_DOCUMENT],
    [SUPPORT_OUT_DIR, PKG_SUPPORT],
    [SRC_DIR, PKG_ROOT],
  ]);

  // ①
  for (const item of PRODUCED) {
    const label = relativePathOf(item.dir, item.typeName);
    const text = item.text;
    if (text.includes("[object Object]")) fail(label + " 里出现 [object Object]，疑似对象被当字符串拼接");
    if (/:\s*;/.test(text)) fail(label + " 里出现空类型声明，疑似类型解析返回空");
    if (text.includes("= ;")) fail(label + " 里出现空赋值");
    if (/\b(private|public|protected)\s{2,}\w/.test(text)) fail(label + " 里出现双空格的类型位置，疑似类型名为空");
    balanceCheck(label, text);
  }

  // ②
  for (const name of REFERENCED_TYPES) {
    if (name !== "package-info" && !producedNames.has(name)) fail("生成物引用了没有产出的类型：" + name);
  }

  // ③
  for (const item of PRODUCED) {
    const label = relativePathOf(item.dir, item.typeName);
    const expected = packageOfDir.get(item.dir);
    if (expected === undefined) {
      fail("产物目录不在已知包内：" + label);
      continue;
    }
    const declaredPackage = /^package ([A-Za-z0-9_.]+);/m.exec(item.text);
    if (declaredPackage === null || declaredPackage[1] !== expected) {
      fail(label + " 的 package 声明与目录不符，期望 " + expected);
    }
    if (item.typeName === "package-info") continue;
    const declaredType = /^public (?:final )?(?:class|interface|enum) (\w+)/m.exec(item.text);
    if (declaredType === null) fail(label + " 里找不到 public 类型声明");
    else if (declaredType[1] !== item.typeName) fail(label + " 声明的类型是 " + declaredType[1] + "，与文件名不符");
  }

  // ④
  const nameCount = new Map();
  for (const item of PRODUCED) {
    if (item.typeName === "package-info") continue;
    nameCount.set(item.typeName, (nameCount.get(item.typeName) ?? 0) + 1);
  }
  for (const [name, seen] of nameCount) if (seen > 1) fail("同名类型产出了 " + seen + " 次：" + name);

  // ⑤
  const tsText = fs.readFileSync(path.join(TS_DIR, "types.ts"), "utf8");
  const tsNames = new Set([...tsText.matchAll(/^export (?:type|interface) (\w+)/gm)].map(matched => matched[1]));
  const tsOnly = new Set(["Expr"]); // 手写在 ts/expr.ts；Java 侧对应 CommonExpr
  for (const file of FILES) {
    for (const [name, node] of Object.entries(schemas[file].$defs ?? {})) {
      const key = file + "." + name;
      // 别名与标量：TS 有类型别名，Java 直接落终点类型，差集里必然有它们
      if (emittedTypeName(key) === null) tsOnly.add(TYPE_NAME.get(key));
      // 扁平联合的分支 interface（UiHandlerRefActionRef / UiHandlerRefSteps）：Java 并成一个类
      if (DEF_TYPE.get(key)?.mode === "flat" && Array.isArray(node.oneOf)) {
        node.oneOf.forEach((branch, index) => tsOnly.add(unionMemberName(TYPE_NAME.get(key), branch, index)));
      }
      // anyOf 约束：TS 生成 XxxBase 接口 + 交叉类型，Java 把约束收进同一个类的 isConstraintSatisfied()
      if (constraintClauses(node) !== null) tsOnly.add(TYPE_NAME.get(key) + "Base");
    }
  }
  // Java 独有、TS 侧没有对应物（TS 用字面量联合 / 直接引用 $defs / 这些东西是 Java 侧基础设施）
  const javaOnly = new Set(["CommonExpr"]); // common.Expr 在 Java 侧的具名类
  for (const spec of NESTED_ENUMS) javaOnly.add(spec.name); // 属性级内联枚举：TS 侧是字面量联合，没有名字
  for (const spec of DOCUMENTS) javaOnly.add(spec.className); // 文档根容器：TS 侧直接用 $defs 类型
  for (const name of [
    "FieldTypeMapping",
    "ExpressionRegistry",
    "BuiltinComponentRegistry",
    "Aliases",
    "LcpObjectMapper",
    "JsonbSupport",
  ]) {
    javaOnly.add(name);
  }
  for (const name of producedNames) {
    if (name === "package-info" || javaOnly.has(name)) continue;
    if (!tsNames.has(name)) fail("Java 产出了 " + name + "，但 ts/types.ts 里没有同名类型");
  }
  for (const name of tsNames) {
    if (producedNames.has(name) || tsOnly.has(name)) continue;
    fail("ts/types.ts 导出了 " + name + "，但 Java 侧没有同名类型");
  }

  // ⑥
  const fieldTypeNode = schemas.data.$defs.FieldType;
  const fieldTypeValues = Array.isArray(fieldTypeNode?.enum) ? fieldTypeNode.enum : null;
  const mappingKeys = Object.keys(typeMapping.types);
  if (fieldTypeValues === null) fail("data.FieldType 不是枚举，无法与 type-mapping 比对");
  else {
    for (const value of fieldTypeValues) if (!mappingKeys.includes(value)) fail("type-mapping.json 缺少字段类型：" + value);
    for (const value of mappingKeys) if (!fieldTypeValues.includes(value)) fail("type-mapping.json 多出未登记的字段类型：" + value);
  }

  // ⑦
  for (const relative of RESOURCES) if (!fs.existsSync(path.join(ROOT, relative))) fail("随包资源缺失：" + relative);
}

/* ================================================================== */
/* 15. java/README.md：接手的人先读这一页                                */
/* ------------------------------------------------------------------ */

const README_MD = [
  "# LCP 元数据协议 " + PROTOCOL_VERSION + " · Java 绑定",
  "",
  "由 `tools/gen-java.mjs` 从 `schema/*.schema.json` 与 `registry/*.json` 生成。**本目录任何文件都不要手改** ——",
  "下一次生成会覆盖。要改契约请改 Schema / 注册表，然后重新跑生成器。",
  "",
  "## 与 TypeScript 侧的关系",
  "",
  "`ts/` 与 `java/` 是同一份 Schema 的两个绑定，类型名逐个相同（`LogicStepAssign` 在两端都叫 `LogicStepAssign`）。",
  "这不是审美问题：AI 提示词、Code Connect 映射、出码引擎都靠这个名字把两端对上。三处例外：",
  "",
  "- **别名与标量不生成类**。Java 没有类型别名，纯 `$ref` 定义与全部标量定义直接落到终点类型，",
  "  反查表在 `registry/Aliases`。",
  "- **`common.Expr` 在 Java 侧叫 `CommonExpr`**。TS 侧由手写的 `ts/expr.ts` 提供，Java 侧从 Schema 生成扁平类。",
  "- **属性级内联枚举变成具名枚举类**（`enums/` 下）。TS 侧是字面量联合，Java 用枚举换类型安全。",
  "",
  "## 目录",
  "",
  "- `src/main/java/dev/lcp/schema/v01/dto` —— 元数据 DTO（判别联合是 interface + 成员类）",
  "- `src/main/java/dev/lcp/schema/v01/enums` —— 枚举（$defs 级 + 属性级内联）",
  "- `src/main/java/dev/lcp/schema/v01/registry` —— 字段类型映射、表达式注册表、内置组件、别名表",
  "- `src/main/java/dev/lcp/schema/v01/document` —— 5 份文档型 Schema 的根容器",
  "- `src/main/java/dev/lcp/schema/v01/support` —— `LcpObjectMapper` 与 `JsonbSupport`",
  "- `src/main/resources/lcp` —— 6 份 Schema + 3 份注册表，随包发布，服务端校验器直接复用（不另存一份，免得漂移）",
  "",
  "## 用法",
  "",
  "```java",
  "ObjectMapper mapper = LcpObjectMapper.shared();",
  "DataSchemaDocument document = mapper.readValue(json, DataSchemaDocument.class);",
  "String jsonb = JsonbSupport.write(mapper, document);   // 落 PostgreSQL 的 jsonb 列",
  "```",
  "",
  "- 读写 Schema DTO 一律走 `LcpObjectMapper.shared()`，不要各自 `new ObjectMapper()`：",
  "  NON_NULL、时间格式（ISO-8601，不是纪元数字）、未知字段宽容这三条约定必须全链路一致。",
  "- 落库走 `JsonbSupport`，不要自己拼 JSON 字符串；写库前先过 L1 校验。",
  "- 本包只有元数据。业务表的 `tenant_id` 与行级权限不在 Schema 里，属于数据平面。",
  "",
  "## 三种「Java 表达不了联合类型」的落地方式",
  "",
  "1. **判别联合** -> `interface` + `@JsonTypeInfo(As.EXISTING_PROPERTY)` + `@JsonSubTypes`。判别值取**每个分支自己的 `const`**",
  "   （`logic.ApiAuth` 各分支的判别键相同但取值不同，统一取第一个会写错）。成员类保留判别字段：带初值、不给 setter。",
  "2. **扁平联合**（分支全是对象、又没有判别键）-> 合并字段进同一个类，用 `is<分支>()` 与 `head()` 判断命中的形态。",
  "3. **透传包装**（含裸标量分支，当前只有 `common.Text`）-> `JsonNode` 原样收发，取值走 `asText()` / `i18n()`。",
  "",
  "另外两处约定：`anyOf` 的「至少提供一组字段」落成 `@AssertTrue isConstraintSatisfied()`；",
  "`x-` 扩展键落成 `@JsonAnyGetter` / `@JsonAnySetter`（读进 `LinkedHashMap`，不参与校验）。",
  "",
  "## 关于「未经编译验证」",
  "",
  "生成器跑在没有 JDK 的环境里，`pom.xml` 与全部 Java 源都没真正编译过。生成器的自检只覆盖：",
  "括号配平、空类型/空赋值、`package` 与类名一致、引用完整性、类型名唯一、与 `ts/types.ts` 逐名对齐、枚举覆盖、资源存在性。",
  "**首次跑 `mvn -q compile` 之前，不要假定它能编译通过；报错请改生成器，不要改产物。**",
  "",
  "## 重新生成",
  "",
  "```bash",
  "node tools/gen-java.mjs",
  "```",
  "",
  "生成器按 `GENERATED.txt` 清理上一轮的过期产物（定义被删、别名改名留下的孤儿类），所以不要往这个目录放手工文件。",
].join("\n");

/* ================================================================== */
/* 运行顺序：一次跑完，顺序改不得                                        */
/* ------------------------------------------------------------------ */

preScan(); // 1. 先分类：DEF_TYPE 决定之后所有类型表达式
renderDefs(); // 2. $defs + 属性级内联类 + 属性级内联枚举
renderRoots(); // 3. 文档根容器、注册表、支撑类（会新建嵌套类，必须排在最后）

selfCheck();

if (problems.length > 0) {
  console.error("gen-java 失败：");
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}

const { written, removed } = writeAll();

const filesIn = dir => PRODUCED.filter(item => item.dir === dir).length;
const totalDefs = FILES.reduce((sum, file) => sum + Object.keys(schemas[file].$defs ?? {}).length, 0);
const noClassCount = FILES.reduce(
  (sum, file) => sum + Object.keys(schemas[file].$defs ?? {}).filter(name => emittedTypeName(file + "." + name) === null).length,
  0,
);
// 只数真的产出文件的定义：别名会把终点定义的 info 带过来，直接数 DEF_TYPE 会把同一份重复计
const emittedModes = FILES.flatMap(file =>
  Object.keys(schemas[file].$defs ?? {})
    .filter(name => emittedTypeName(file + "." + name) !== null)
    .map(name => DEF_TYPE.get(file + "." + name).mode),
);
const modeCount = mode => emittedModes.filter(item => item === mode).length;
const memberCount = [...IFACE_MEMBERS.values()].reduce((sum, members) => sum + members.length, 0);
const tsNameCount = [...fs.readFileSync(path.join(TS_DIR, "types.ts"), "utf8").matchAll(/^export (?:type|interface) (\w+)/gm)].length;

console.log("gen-java 完成 → " + path.relative(process.cwd(), JAVA_DIR));
for (const item of written) console.log("  " + item.relative.padEnd(56) + String(item.text.length).padStart(8) + " 字符");
console.log(
  "  Schema $defs " +
    totalDefs +
    " 个 → 产出文件 " +
    written.length +
    " 个（DTO " +
    filesIn(DTO_DIR) +
    " / 枚举 " +
    filesIn(ENUM_DIR) +
    " / 注册表 " +
    filesIn(REGISTRY_OUT_DIR) +
    " / 文档根 " +
    filesIn(DOCUMENT_DIR) +
    " / 支撑 " +
    filesIn(SUPPORT_OUT_DIR) +
    " / package-info + 资源 " +
    RESOURCES.length +
    " / pom + README + 清单），其中 " +
    noClassCount +
    " 个定义（别名与标量）不生成类，属性级内联类 " +
    NESTED_CLASSES.length +
    " 个",
);
console.log(
  "  联合：判别 " +
    modeCount("iface") +
    " 个（成员 " +
    memberCount +
    " 个），扁平 " +
    modeCount("flat") +
    " 个，透传 " +
    modeCount("passthrough") +
    " 个；枚举 " +
    modeCount("enum") +
    " 个 + 属性级内联 " +
    NESTED_ENUMS.length +
    " 个",
);
console.log(
  "  注册表：字段类型 " +
    Object.keys(typeMapping.types).length +
    " 条，表达式函数 " +
    expressionRegistry.functions.length +
    " 个，取值根 " +
    expressionRegistry.valueRoots.length +
    " 个，查询算子 " +
    expressionRegistry.queryOperators.length +
    " 个，内置组件 " +
    builtinComponents.components.length +
    " 个",
);
console.log("  自检通过：括号配平、引用完整性、名字唯一、与 ts/types.ts 的 " + tsNameCount + " 个导出逐名对齐");

if (removed.length > 0) {
  console.log("  清理过期产物 " + removed.length + " 个：");
  for (const relative of removed) console.log("    - " + relative);
}
