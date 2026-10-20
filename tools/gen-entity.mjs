#!/usr/bin/env node
/**
 * LCP 出码引擎 · 第一步：数据模型 → PostgreSQL DDL + TypeScript / Java 实体
 *
 *   node tools/gen-entity.mjs [bundle.json ...]
 *
 * 不传参数时读取 examples/ 下所有 *.bundle.json。
 * 输入：Bundle.artifacts.dataSchemas[]（DataSchema 文档）
 * 输出：codegen/<appKey>/{sql,ts,java}/…
 *
 * 与 gen-ts / gen-java 的分工：那两个生成**元数据**的类型绑定，
 * 本文件生成**业务数据平面**的落地代码，所以它读 bundle（含 app / tenant），
 * 而不是读 schema/*.json 的 $defs。
 *
 * 类型规则唯一来源：registry/type-mapping.json。本文件不允许发明类型。
 * 关键约定（来自该注册表的 conventions，务必遵守）：
 *   - required=true 不生成 NOT NULL，由应用层校验（灰度期新旧 Schema 共存）
 *   - 所有列默认 NULL；只有平台注入列（主键 / 租户 / 时间戳 / 乐观锁版本）非空
 *   - tenant_id 由平台注入并配合 RLS 兜底
 *   - created_at / updated_at / created_by / updated_by / deleted_at 由平台注入，业务 Schema 不得重复声明
 * 本文件的两处显式取舍：
 *   - enum 落 varchar，不建 PG enum 类型、不建 CHECK 约束：否则新增枚举值要 DDL，违背零 DDL 演进
 *   - 唯一约束一律带租户列；开启软删除时改为「部分唯一索引 WHERE deleted_at IS NULL」
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWriteStats, writeStatsText, writeTextIfChanged } from "./codegen-fs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_ROOT = process.env.LCP_CODEGEN_OUT
  ? path.resolve(process.env.LCP_CODEGEN_OUT)
  : path.join(ROOT, "codegen");
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, "registry", "type-mapping.json"), "utf8"));
const TYPES = REG.types;

export const PROBLEMS = [];
export const NOTES = [];
const bad = (where, msg) => PROBLEMS.push({ where, msg });
const note = (where, msg) => NOTES.push({ level: "info", where, msg });
const warn = (where, msg) => NOTES.push({ level: "warn", where, msg });

// ============================================================ 命名与转义
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const pascal = (s) => String(s).split(/[^A-Za-z0-9]+/).filter(Boolean).map(upperFirst).join("");
export const camel = (s) => {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
};
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const isPlainLiteral = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const litSql = (v) =>
  v === null ? "null" : typeof v === "string" ? sq(v) : typeof v === "boolean" ? String(v) : String(v);
/** common.Text 允许裸字符串 */
export const textOf = (t) => (t == null ? "" : typeof t === "string" ? t : (t.default ?? Object.values(t)[0] ?? ""));
export const indent = (s, pad) => String(s).split("\n").map((l) => (l ? pad + l : l)).join("\n");

// ============================================================ 实体访问器
export const tableOf = (entity) => entity.tableName ?? entity.key;
export const primaryKeyOf = (entity) => entity.storage?.primaryKey ?? "id";
/** tenantColumn 显式为 null 表示全局共享表 */
export const tenantColumnOf = (entity) => (entity.storage?.tenantColumn === undefined ? "tenant_id" : entity.storage.tenantColumn);
export const jsonbColumnOf = (entity) => entity.storage?.jsonbColumn ?? "ext";
export const softDeleteOf = (entity) => {
  const sd = entity.storage?.softDelete;
  if (!sd || sd.enabled === false) return null;
  return { column: sd.column ?? "deleted_at", type: sd.type ?? "timestamp" };
};
export const timestampsOf = (entity) => entity.storage?.timestamps ?? null;
export const isFormula = (f) => f.type === "formula";
export const storageOf = (f) => f.storage ?? "jsonb";

function enumValuesOf(field, ds) {
  if (field.enumValues) return field.enumValues;
  const ref = field.enumRef;
  if (!ref || !ref.key) return null;
  const def = (ds.enums || []).find((e) => e.key === ref.key);
  return def ? def.values : null;
}

/** ref 列类型：能解析到目标实体就随它，否则退回注册表的 ref 默认 */
function refColumnType(field, ds) {
  const target = (ds.entities || []).find((e) => e.key === field.refEntity?.key);
  if (!target) {
    warn(`ref 字段 ${field.key}`, `无法在本文档内解析 refEntity=${field.refEntity?.key ?? "(空)"}，按注册表默认 varchar(${TYPES.ref.pg.length}) 落列`);
    return `varchar(${TYPES.ref.pg.length})`;
  }
  const idField = (target.fields || []).find((f) => f.key === primaryKeyOf(target));
  if (idField?.columnType) return idField.columnType;
  const idType = target.storage?.idType ?? "ulid";
  return idType === "uuid" ? "uuid" : idType === "bigint" || idType === "snowflake" ? "bigint" : "varchar(26)";
}

// ============================================================ 列推导
/**
 * 把 entity.fields 拆成「真实列」与「进 jsonb 的字段」。
 * 返回 { columns, jsonbFields, omitted }，columns 顺序即建表顺序。
 */
function columnsOf(entity, ds) {
  const pk = primaryKeyOf(entity);
  const tenant = tenantColumnOf(entity);
  const jsonbColumn = jsonbColumnOf(entity);
  const softDelete = softDeleteOf(entity);
  const stamps = timestampsOf(entity);
  const business = [];
  const jsonbFields = [];
  const omitted = [];

  for (const f of entity.fields || []) {
    const t = TYPES[f.type];
    if (!t) {
      bad(`${entity.key}.${f.key}`, `未知 FieldType "${f.type}"：注册表 registry/type-mapping.json 里没有这个类型`);
      continue;
    }
    if (isFormula(f)) {
      omitted.push(f);
      note(`${entity.key}.${f.key}`, "formula 字段不落库，由运行时按 Field.formula 派生");
      continue;
    }
    if (storageOf(f) === "jsonb") {
      jsonbFields.push(f);
      continue;
    }
    let sqlType = f.columnType ?? null;
    let enumValues = null;
    if (!sqlType) {
      if (f.type === "ref") sqlType = refColumnType(f, ds);
      else if (f.type === "enum") enumValues = enumValuesOf(f, ds);
      if (!sqlType && t.pg.base === "varchar") sqlType = `varchar(${f.length ?? t.pg.length ?? 255})`;
      else if (!sqlType && t.pg.base === "numeric") {
        const p = f.precision ?? t.pg.precision;
        const s = f.scale ?? t.pg.scale;
        sqlType = `numeric(${p},${s})`;
      } else if (!sqlType && t.pg.base) sqlType = t.pg.base;
    }
    if (!sqlType) {
      bad(`${entity.key}.${f.key}`, `FieldType "${f.type}" 映射不到列类型（pg.base=${JSON.stringify(t.pg.base)}），且字段未声明 columnType`);
      continue;
    }
    const col = {
      name: f.key,
      sqlType,
      notNull: false,
      default: null,
      enumValues,
      field: f,
      overridden: !!f.columnType,
      pk: f.key === pk
    };
    if (f.defaultValue !== undefined && isPlainLiteral(f.defaultValue)) col.default = litSql(f.defaultValue);
    else if (f.defaultValue !== undefined) note(`${entity.key}.${f.key}`, "defaultValue 是表达式，不落 DDL 默认值，由应用层求值");
    business.push(col);
  }

  const byPk = business.find((c) => c.pk);
  if (!byPk) bad(entity.key, `主键列 "${pk}" 不在 fields 中，无法建主键约束`);
  else byPk.notNull = true;

  const rest = business.filter((c) => !c.pk);
  const columns = [];
  if (byPk) columns.push(byPk);
  const platform = [];
  if (tenant) platform.push({ name: tenant, sqlType: "varchar(64)", notNull: true, platform: "租户列，平台注入", reason: "tenant" });
  columns.push(...platform);
  columns.push(...rest);
  if (jsonbFields.length) {
    columns.push({
      name: jsonbColumn,
      sqlType: "jsonb",
      notNull: true,
      default: "'{}'::jsonb",
      platform: `承载 storage=jsonb 的字段：${jsonbFields.map((f) => f.key).join(", ") || "（无）"}`,
      reason: "jsonb",
      jsonbFields
    });
  }
  if (stamps) {
    const pairs = [
      ["createdAt", "created_at"],
      ["updatedAt", "updated_at"],
      ["createdBy", "created_by"],
      ["updatedBy", "updated_by"]
    ];
    for (const [k, fallback] of pairs) {
      const name = stamps[k] ?? fallback;
      const isTime = k === "createdAt" || k === "updatedAt";
      columns.push({
        name,
        sqlType: isTime ? "timestamptz" : "varchar(64)",
        notNull: isTime,
        default: isTime ? "now()" : null,
        platform: isTime ? "时间戳，平台注入" : "操作人，平台注入",
        reason: "timestamp"
      });
    }
  }
  if (softDelete) {
    columns.push({ name: softDelete.column, sqlType: "timestamptz", notNull: false, platform: "软删除标记，平台注入", reason: "softDelete" });
  }
  if (entity.storage?.optimisticLock) {
    columns.push({ name: "version", sqlType: "integer", notNull: true, default: "0", platform: "乐观锁版本，BFF 更新时带版本条件", reason: "version" });
  }
  return { columns, jsonbFields, omitted };
}

// ============================================================ DDL：建表
function columnComment(col) {
  const bits = [];
  if (col.platform) bits.push(col.platform);
  if (col.field) {
    bits.push(textOf(col.field.label));
    if (col.field.required) bits.push("必填（应用层校验）");
    if (col.field.unique) bits.push("唯一");
    if (col.field.immutable) bits.push("创建后不可改");
    if (col.field.sensitive) bits.push("敏感：默认脱敏与审计");
    if (col.field.searchable) bits.push("参与全局搜索");
    if (col.overridden) bits.push(`列类型被 columnType 覆盖（默认 ${defaultSqlType(col.field) ?? "?"}）`);
  }
  if (col.enumValues) bits.push("枚举值：" + col.enumValues.map((v) => String(v.value)).join(" / "));
  return bits.filter(Boolean).join("；");
}

function defaultSqlType(f) {
  const t = TYPES[f.type];
  if (!t || !t.pg.base) return null;
  if (t.pg.base === "varchar") return `varchar(${f.length ?? t.pg.length ?? 255})`;
  if (t.pg.base === "numeric") return `numeric(${f.precision ?? t.pg.precision},${f.scale ?? t.pg.scale})`;
  return t.pg.base;
}

function renderTables(app, ds) {
  const out = [];
  for (const entity of ds.entities || []) {
    if (entity.enabled === false) {
      note(entity.key, "enabled=false，跳过建表");
      continue;
    }
    const table = tableOf(entity);
    const pk = primaryKeyOf(entity);
    const { columns, jsonbFields } = columnsOf(entity, ds);
    const parts = columns.map((c) => {
      let s = `${ident(c.name)} ${c.sqlType}`;
      if (c.notNull) s += " not null";
      if (c.default) s += ` default ${c.default}`;
      return s;
    });
    parts.push(`constraint ${ident("pk_" + table)} primary key (${ident(pk)})`);
    const softDelete = softDeleteOf(entity);
    if (softDelete) {
      parts.push(`constraint ${ident("ck_" + table + "_soft_delete")} check (${ident(softDelete.column)} is null or ${ident(softDelete.column)} >= ${ident(stampsName(entity, "createdAt", "created_at"))})`);
    }
    const header = [
      `-- ----------------------------------------------------------------`,
      `-- ${textOf(entity.name) || entity.key} · ${entity.key}  →  ${table}`,
      `-- ${textOf(entity.semantic?.intent) || "（无 semantic.intent）"}`,
      `-- 字段 ${(entity.fields || []).length} 个（列 ${columns.length} 个，其中 JSONB 文档内 ${jsonbFields.length} 个）`
    ].join("\n");
    out.push(header);
    out.push(`create table if not exists ${ident(table)} (\n  ${parts.join(",\n  ")}\n);`);
    const td = [textOf(entity.name), textOf(entity.semantic?.intent)].filter(Boolean).join(" — ");
    if (td) out.push(`comment on table ${ident(table)} is ${sq(td)};`);
    for (const c of columns) {
      const cm = columnComment(c);
      if (cm) out.push(`comment on column ${ident(table)}.${ident(c.name)} is ${sq(cm)};`);
    }
    out.push("");
  }
  return out.join("\n");
}

function stampsName(entity, key, fallback) {
  const stamps = timestampsOf(entity);
  return (stamps && stamps[key]) || fallback;
}
// ============================================================ DDL：索引
const PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 索引字段项：纯标识符加引号；ext->>'status' 这类表达式原样透出（gin 常用） */
function indexFieldSql(raw) {
  const s = String(raw).trim();
  return PLAIN_IDENT.test(s) ? ident(s) : s;
}

/** 唯一索引去重键：字段组归一化，免得 field.unique 与显式索引各建一份 */
const uniqueKeyOf = (fields) => fields.map((f) => String(f).trim().toLowerCase()).join("|");

/**
 * 索引来源三处，按优先级：entity.indexes（显式） → field.unique → validators[uniqueIn]。
 * 后两处是「字段级声明」，若与显式索引字段组重合会在渲染时被去重跳过。
 */
function indexSpecsOf(entity) {
  const table = tableOf(entity);
  const specs = [];
  for (const ix of entity.indexes || []) {
    specs.push({
      name: ix.name,
      fields: (ix.fields || []).map((f) => String(f)),
      unique: ix.unique === true,
      method: ix.method ?? "btree",
      orders: ix.orders ?? null,
      where: ix.where ?? null,
      concurrently: ix.concurrently !== false,
      from: "entity.indexes",
      note: ix.note ?? ""
    });
  }
  for (const f of entity.fields || []) {
    if (f.unique) {
      specs.push({
        name: `uk_${table}_${f.key}`, fields: [f.key], unique: true, method: "btree",
        orders: null, where: null, concurrently: true, from: `${f.key}.unique`, note: ""
      });
    }
    for (const v of f.validators || []) {
      if (v.type !== "uniqueIn" || !Array.isArray(v.fields) || v.fields.length === 0) continue;
      const fields = v.fields.map((x) => String(x));
      specs.push({
        name: `uk_${table}_${fields.join("_")}`, fields, unique: true, method: "btree",
        orders: null, where: null, concurrently: true, from: `${f.key}.validators[uniqueIn]`, note: ""
      });
    }
  }
  return specs;
}

function renderIndexes(entity, ds) {
  const table = tableOf(entity);
  const tenant = tenantColumnOf(entity);
  const softDelete = softDeleteOf(entity);
  const out = [];
  const seen = new Map();

  for (const ix of indexSpecsOf(entity)) {
    if (ix.fields.length === 0) {
      bad(`${entity.key}.indexes.${ix.name}`, "索引 fields 为空，无法建索引");
      continue;
    }
    if (ix.unique) {
      const key = uniqueKeyOf(ix.fields);
      if (seen.has(key)) {
        note(`${entity.key}.${ix.name}`, `唯一性与已生成的 ${seen.get(key)} 完全重合，跳过（来源 ${ix.from}）`);
        continue;
      }
      seen.set(key, ix.name);
    }
    if (ix.unique && ix.method === "gin") {
      bad(`${entity.key}.${ix.name}`, "gin 索引不支持唯一性，改回 btree 或去掉 unique");
      continue;
    }
    if (ix.orders && ix.orders.length !== ix.fields.length) {
      warn(`${entity.key}.${ix.name}`, `orders 有 ${ix.orders.length} 项、fields 有 ${ix.fields.length} 项，按位置就近对齐`);
    }
    if (ix.orders && ix.method === "gin") {
      warn(`${entity.key}.${ix.name}`, "gin 索引不支持排序方向，已忽略 orders");
      ix.orders = null;
    }
    if (ix.where) {
      note(`${entity.key}.${ix.name}`, "where 是表达式（Expr），本步骤不编译部分索引条件，索引按全量建立；编译器接入后回填");
    }

    const cols = [];
    if (ix.unique && tenant) cols.push(ident(tenant));
    for (let i = 0; i < ix.fields.length; i++) {
      let piece = indexFieldSql(ix.fields[i]);
      const dir = ix.orders ? ix.orders[i] : null;
      if (dir === "asc" || dir === "desc") piece += " " + dir;
      cols.push(piece);
    }
    const method = ix.method && ix.method !== "btree" ? ` using ${ix.method}` : "";
    const partial = ix.unique && softDelete ? `${ident(softDelete.column)} is null` : null;

    if (ix.note) out.push(`-- ${ix.note}`);
    if (ix.unique && tenant && !ix.fields.includes(tenant)) {
      out.push(`-- 唯一性作用域收敛到租户内：前导列补 ${tenant}（协议约定 Field.unique / Index.unique 均为租户内唯一）`);
    }
    if (partial) out.push("-- 软删除表：唯一性只约束未删除行，故用部分唯一索引");
    if (ix.unique && ix.concurrently) {
      out.push("-- 注意：唯一索引并发创建若失败会留下 INVALID 索引（IF NOT EXISTS 之后不再重建），需人工 drop 后重跑");
    }
    out.push(
      `create ${ix.unique ? "unique " : ""}index ${ix.concurrently ? "concurrently " : ""}if not exists ` +
        `${ident(ix.name)} on ${ident(table)}${method} (${cols.join(", ")})` +
        (partial ? `\n  where ${partial}` : "") +
        ";"
    );
    out.push("");
    STAT.indexes += 1;
  }
  return out.join("\n");
}
// ============================================================ 统计与 SQL 文件装配
const STAT = {
  tables: 0, columns: 0, indexes: 0, policies: 0, skippedTables: 0,
  tsInterfaces: 0, tsAliases: 0, javaClasses: 0, jsonbFields: 0, formulas: 0
};
function resetStat() {
  for (const k of Object.keys(STAT)) STAT[k] = 0;
}

function renderSqlExtensions(bundle) {
  const app = bundle.app || {};
  const tenantId = bundle.tenantId ?? null;
  const schemas = (bundle.artifacts?.dataSchemas || []).map((d) => d.key).join(", ") || "（无）";
  return `-- 由 tools/gen-entity.mjs 生成，勿手改。
-- 应用 ${app.key ?? "?"} · 协议版本 ${bundle.protocolVersion ?? "?"} · 租户 ${tenantId ?? "（bundle 未指定）"}
-- 数据模型：${schemas}
--
-- 执行顺序（用 psql -f 逐个执行，或让迁移框架按文件名排序）：
--   00_extensions.sql   本文件：扩展与运行时约定
--   10_<table>.sql      逐表：建表 + 列注释 + 索引
--   90_rls.sql          行级安全策略（租户隔离兜底）
--
-- 幂等：全部 create ... if not exists / drop ... if exists，可重复执行。
-- 事务：create index concurrently 不能出现在事务块内 —— 不要用 BEGIN/COMMIT 包裹本目录脚本，
--      也不要用「每条迁移自动开事务」的框架执行 10_*.sql；必要时把并发建索引单独拆出。
-- 灰度：业务列一律可空（required 由应用层校验），只有平台注入列非空，便于新旧 Schema 共存。
create extension if not exists pgcrypto;
-- 租户上下文由连接池在借出连接时注入，RLS 策略依赖它：
--   set local lcp.tenant_id = '<tenantId>';
-- 策略里 current_setting('lcp.tenant_id', true) 的 true 表示 missing_ok：
-- 未设置时返回 NULL，任何行都不匹配 —— 失败即关闭，不会退化成全租户可见。
`;
}

/** 行级安全：每张带租户列的表一份策略。tenantColumn=null 的全局共享表跳过。 */
function renderRls(plans) {
  const lines = [
    "-- 由 tools/gen-entity.mjs 生成，勿手改。",
    "-- 行级安全（RLS）：租户隔离的最后一道兜底，防止 BFF 漏加 tenant_id 条件。",
    "--",
    "-- 注意：RLS 默认对表 owner 不生效。若应用连接用户就是这些表的 owner（平台自建自用库），",
    "--      需要额外执行 alter table ... force row level security，或让应用改用非 owner 角色。",
    "--      为免误伤迁移账号，这里逐表给出注释版本，按部署形态自行启用。",
    "-- 策略条件读会话变量 lcp.tenant_id：未设置时值为 NULL，条件恒不成立，即「看不到任何行」。",
    ""
  ];
  let count = 0;
  for (const plan of plans) {
    const { entity, table } = plan;
    const tenant = tenantColumnOf(entity);
    if (!tenant) {
      note(`${entity.key}`, `storage.tenantColumn=null：全局共享表（仅 system scope 允许），不建租户列与 RLS 策略`);
      continue;
    }
    const policy = ident(`${table}_tenant_isolation`);
    lines.push(`-- ${textOf(entity.name) || entity.key}（${entity.key} → ${table}）`);
    lines.push(`alter table ${ident(table)} enable row level security;`);
    lines.push(`-- alter table ${ident(table)} force row level security;   -- 应用角色即表 owner 时打开`);
    lines.push(`drop policy if exists ${policy} on ${ident(table)};`);
    lines.push(`create policy ${policy} on ${ident(table)}`);
    lines.push(`  using (${ident(tenant)} = current_setting('lcp.tenant_id', true))`);
    lines.push(`  with check (${ident(tenant)} = current_setting('lcp.tenant_id', true));`);
    lines.push("");
    count += 1;
    STAT.policies += 1;
  }
  if (count === 0) lines.push("-- 本次没有任何带租户列的表，未生成策略。");
  return lines.join("\n") + "\n";
}

/** 单表文件：表头 + 建表 + 列注释（复用 renderTables）+ 索引 + 平台说明 */
function renderTableFile(entity, ds) {
  const table = tableOf(entity);
  const lines = [
    `-- 由 tools/gen-entity.mjs 生成，勿手改。`,
    `-- 单表文件：${textOf(entity.name) || entity.key}（${entity.key}）→ ${table}`,
    "-- 幂等：create table if not exists / create index if not exists，可重复执行。",
    "-- 本文件不含事务控制：并发建索引必须在事务块外执行。",
    ""
  ];
  lines.push(renderTables(null, { ...ds, entities: [entity] }).replace(/\n+$/, ""));
  const indexes = renderIndexes(entity, ds).replace(/\n+$/, "");
  if (indexes) {
    lines.push("");
    lines.push("-- ---------------------------------------------------------------- 索引");
    lines.push(indexes);
  }
  const extra = [];
  if (entity.storage?.partitionBy) {
    extra.push(`-- 未生成：storage.partitionBy=${entity.storage.partitionBy}；分区表需带分区键建表，待 DDL 编译器接入后生成`);
  }
  if (entity.storage?.auditLog) {
    extra.push("-- auditLog=true：写入审计由平台侧 lcp_audit_log 统一记录，不在本表生成触发器");
  }
  if (entity.storage?.comment) extra.push(`-- storage.comment：${textOf(entity.storage.comment)}`);
  if (extra.length) {
    lines.push("");
    lines.push(...extra);
  }
  lines.push("");
  return lines.join("\n");
}
// ============================================================ 类型投影（TS / Java 共用）
const ARRAY_DEPTH_LIMIT = 3; // DataSchema.Field.itemType 声明的递归深度上限（与 L2 口径一致）

const ENUM_REG = { aliases: new Map(), owners: new Map(), defs: new Map() };
function resetEnums() {
  ENUM_REG.aliases.clear();
  ENUM_REG.owners.clear();
  ENUM_REG.defs.clear();
}

/** 先把所有共享枚举登记好别名，字段渲染时才能直接引用 */
function registerEnums(schemas) {
  for (const ds of schemas) {
    for (const def of ds.enums || []) {
      if (!def.key) continue;
      if (ENUM_REG.defs.has(def.key)) {
        if (ENUM_REG.defs.get(def.key) !== def) warn(def.key, "同名共享枚举在多份 DataSchema 中重复定义，TS 别名沿用第一次登记的定义");
        continue;
      }
      let alias = pascal(def.key);
      if (ENUM_REG.owners.has(alias) && ENUM_REG.owners.get(alias) !== def.key) {
        const alt = alias + "Enum";
        warn(def.key, `枚举别名 ${alias} 已被枚举 ${ENUM_REG.owners.get(alias)} 占用，改用 ${alt}`);
        alias = alt;
      }
      ENUM_REG.defs.set(def.key, def);
      ENUM_REG.aliases.set(def.key, alias);
      ENUM_REG.owners.set(alias, def.key);
    }
  }
}

const safeDoc = (s) => String(s).replace(/\*\//g, "*\\/").replace(/\r?\n/g, " ").trim();

function tsTypeOf(field, ds, owner, depth) {
  const t = TYPES[field.type];
  if (!t) return "unknown";
  if (field.type === "formula") return "unknown";
  if (field.type === "array") {
    if (depth >= ARRAY_DEPTH_LIMIT) {
      warn(owner, `array 嵌套超过 ${ARRAY_DEPTH_LIMIT} 层，深层按 unknown[] 生成`);
      return "unknown[]";
    }
    const item = field.itemType;
    if (!item || !item.type) {
      warn(owner, "array 未声明 itemType，按 unknown[] 生成");
      return "unknown[]";
    }
    return `${tsTypeOf({ ...item, key: field.key }, ds, owner, depth + 1)}[]`;
  }
  if (field.type !== "enum") return t.ts.type;
  const refKey = field.enumRef?.key;
  const def = refKey ? ENUM_REG.defs.get(refKey) : null;
  if (refKey && def) {
    const inline = (field.enumValues || []).map((v) => String(v.value)).sort().join(",");
    const shared = (def.values || []).map((v) => String(v.value)).sort().join(",");
    if (inline && inline !== shared) {
      warn(owner, `内联 enumValues 与共享枚举 ${refKey} 取值不一致，联合类型以 enumRef 为准（共享枚举为 ${shared}）`);
    }
    return ENUM_REG.aliases.get(refKey);
  }
  if (field.enumValues?.length) return field.enumValues.map((v) => JSON.stringify(String(v.value))).join(" | ");
  warn(owner, refKey ? `enumRef=${refKey} 解析不到共享枚举，退回 string` : "enum 既无 enumRef 也无 enumValues，退回 string");
  return "string";
}

function javaTypeOf(field, owner, depth) {
  const t = TYPES[field.type];
  if (!t) return { type: "Object", imports: [] };
  if (field.type === "array") {
    if (depth >= ARRAY_DEPTH_LIMIT) {
      warn(owner, `array 嵌套超过 ${ARRAY_DEPTH_LIMIT} 层，深层按 List<Object> 生成`);
      return { type: "List<Object>", imports: ["java.util.List"] };
    }
    const item = field.itemType;
    if (!item || !item.type) {
      warn(owner, "array 未声明 itemType，按 List<Object> 生成");
      return { type: "List<Object>", imports: ["java.util.List"] };
    }
    const inner = javaTypeOf({ ...item, key: field.key }, owner, depth + 1);
    return { type: `List<${inner.type}>`, imports: ["java.util.List", ...inner.imports] };
  }
  return { type: t.java.type, imports: [...(t.java.imports || [])] };
}

/** 平台注入列：Schema 里不得声明，这里统一补进 TS / Java 形态 */
function platformEntries(entity) {
  const out = [];
  const tenant = tenantColumnOf(entity);
  const stamps = timestampsOf(entity);
  const softDelete = softDeleteOf(entity);
  if (tenant) out.push({ name: tenant, tsType: "string", javaType: "String", javaImports: [], doc: "租户列，平台注入，配合 RLS 隔离", required: true });
  if (stamps) {
    const pairs = [
      ["createdAt", "created_at"], ["updatedAt", "updated_at"],
      ["createdBy", "created_by"], ["updatedBy", "updated_by"]
    ];
    for (const [k, fallback] of pairs) {
      const name = stamps[k] ?? fallback;
      const isTime = k === "createdAt" || k === "updatedAt";
      out.push({
        name, tsType: "string", javaType: "String", javaImports: [],
        doc: isTime ? "平台注入，ISO8601 带时区" : "平台注入，操作人标识",
        required: isTime
      });
    }
  }
  if (softDelete) {
    out.push({ name: softDelete.column, tsType: "string", javaType: "String", javaImports: [], doc: "软删除标记，平台注入；非空即视为已删除（查询默认过滤）", required: false });
  }
  if (entity.storage?.optimisticLock) {
    out.push({ name: "version", tsType: "number", javaType: "Integer", javaImports: [], doc: "乐观锁版本，平台注入；BFF 更新时带版本条件", required: true });
  }
  return out;
}

/**
 * 实体形态（TS / Java 共用）：业务字段按 Schema 声明顺序，平台注入列追加在后。
 * jsonb 字段是一等属性（BFF 负责与 ext 列互转），formula 只进 TS 不进 Java。
 */
function shapeOf(entity, ds) {
  const items = [];
  const claimed = new Set();
  for (const f of entity.fields || []) {
    const owner = `${entity.key}.${f.key}`;
    if (!TYPES[f.type]) {
      bad(owner, `未知 FieldType "${f.type}"：注册表 registry/type-mapping.json 里没有这个类型`);
      continue;
    }
    claimed.add(f.key);
    const java = javaTypeOf(f, owner, 0);
    const base = {
      name: f.key,
      field: f,
      tsType: tsTypeOf(f, ds, owner, 0),
      javaType: java.type,
      javaImports: java.imports,
      required: f.required === true,
      readonly: f.immutable === true,
      doc: [textOf(f.label), [f.unique ? "唯一" : "", f.sensitive ? "敏感" : "", f.searchable ? "可搜索" : ""].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")
    };
    if (isFormula(f)) {
      items.push({ ...base, kind: "formula", readonly: true, doc: [base.doc, "派生字段：不落库，由运行时按 Field.formula 计算"].filter(Boolean).join(" · ") });
      STAT.formulas += 1;
      continue;
    }
    const kind = storageOf(f) === "jsonb" ? "jsonb" : "column";
    if (kind === "jsonb") {
      items.push({ ...base, kind, doc: [base.doc, "落 " + jsonbColumnOf(entity) + " JSONB 文档（BFF 负责与 ext 列互转）"].filter(Boolean).join(" · ") });
      STAT.jsonbFields += 1;
    } else {
      items.push({ ...base, kind });
    }
  }
  for (const p of platformEntries(entity)) {
    if (claimed.has(p.name)) {
      note(`${entity.key}.${p.name}`, "Schema 里已声明同名列，平台注入被跳过（Schema 不应声明平台列）");
      continue;
    }
    items.push({ ...p, kind: "platform" });
  }
  return items;
}
// ============================================================ 实体类名（TS / Java 共用）
const CLASS_REG = { names: new Map(), owners: new Map() };
function resetClasses() {
  CLASS_REG.names.clear();
  CLASS_REG.owners.clear();
}
function entityClassOf(key) {
  if (CLASS_REG.names.has(key)) return CLASS_REG.names.get(key);
  let name = pascal(key);
  if (CLASS_REG.owners.has(name) && CLASS_REG.owners.get(name) !== key) {
    const alt = name + "Entity";
    warn(key, `实体类名 ${name} 已被实体 ${CLASS_REG.owners.get(name)} 占用，改用 ${alt}`);
    name = alt;
  }
  CLASS_REG.names.set(key, name);
  CLASS_REG.owners.set(name, key);
  return name;
}

// ============================================================ TypeScript 实体
function renderTsEntities(bundle, plans) {
  const out = [];
  out.push("/**");
  out.push(" * 本文件由 tools/gen-entity.mjs 生成，勿手改。");
  out.push(` * 应用 ${bundle.app?.key ?? "?"} · 协议 ${bundle.protocolVersion ?? "?"} · 租户模板 ${bundle.tenantId ?? "（bundle 未指定）"}`);
  out.push(" *");
  out.push(" * 本文件描述的是 **API / BFF 返回形态**，不是库表形态：");
  out.push(" *   - 含平台注入列（租户列 / 时间戳 / 软删除 / 乐观锁版本）");
  out.push(" *   - 含 formula 派生字段，标注 readonly 且不落库");
  out.push(" *   - storage=jsonb 的字段同样是一等属性，由 BFF 与 jsonb 列互转");
  out.push(" *   - required 只表示应用层必须校验；库里一律可空，故非必填属性标为可选且可为 null");
  out.push(" */");

  for (const [key, alias] of ENUM_REG.aliases) {
    const def = ENUM_REG.defs.get(key);
    const values = (def.values || []).map((v) => JSON.stringify(String(v.value)));
    if (values.length === 0) {
      warn(key, "共享枚举没有任何取值，跳过 TS 别名生成");
      continue;
    }
    out.push("");
    out.push(`/** ${safeDoc(`${textOf(def.name) || key} · 共享枚举 ${key}（${values.length} 个取值）`)} */`);
    out.push(`export type ${alias} = ${values.join(" | ")};`);
    STAT.tsAliases += 1;
  }

  for (const plan of plans) {
    const { entity } = plan;
    out.push("");
    out.push(
      `/** ${safeDoc(
        [
          textOf(entity.name) || entity.key,
          `${entity.key} → ${plan.table}`,
          `${plan.shape.length} 个属性（其中 JSONB 内 ${plan.shape.filter((i) => i.kind === "jsonb").length} 个）`
        ].join(" · ")
      )} */`
    );
    out.push(`export interface ${plan.className} {`);
    for (const item of plan.shape) {
      if (item.doc) out.push(`  /** ${safeDoc(item.doc)} */`);
      const opt = item.required ? "" : "?";
      const nullable = item.required || item.tsType === "unknown" ? "" : " | null";
      out.push(`  ${item.readonly ? "readonly " : ""}${item.name}${opt}: ${item.tsType}${nullable};`);
    }
    out.push("}");
    STAT.tsInterfaces += 1;
  }

  out.push("");
  out.push("/** 实体 key → 行类型。BFF 泛型读写用这个索引。 */");
  out.push("export interface EntityTableMap {");
  for (const plan of plans) out.push(`  ${plan.entity.key}: ${plan.className};`);
  out.push("}");
  out.push("");
  out.push("export type EntityKey = keyof EntityTableMap;");
  out.push("export type RowOf<K extends EntityKey> = EntityTableMap[K];");
  out.push("");
  out.push("/** 实体 key → 物理落库信息。BFF 拼 SQL、加租户条件时读这里，避免字符串硬编码。 */");
  out.push("export const ENTITY_META: Record<EntityKey, {");
  out.push("  table: string;");
  out.push("  primaryKey: string;");
  out.push("  tenantColumn: string | null;");
  out.push("  jsonbColumn: string;");
  out.push("  softDeleteColumn: string | null;");
  out.push("}> = {");
  for (const plan of plans) {
    const { entity } = plan;
    const tenant = tenantColumnOf(entity);
    const sd = softDeleteOf(entity);
    out.push(`  ${entity.key}: {`);
    out.push(`    table: ${JSON.stringify(plan.table)},`);
    out.push(`    primaryKey: ${JSON.stringify(primaryKeyOf(entity))},`);
    out.push(`    tenantColumn: ${tenant ? JSON.stringify(tenant) : "null"},`);
    out.push(`    jsonbColumn: ${JSON.stringify(jsonbColumnOf(entity))},`);
    out.push(`    softDeleteColumn: ${sd ? JSON.stringify(sd.column) : "null"},`);
    out.push("  },");
  }
  out.push("};");
  out.push("");
  return out.join("\n");
}

function renderTsIndex() {
  return `/**\n * 本文件由 tools/gen-entity.mjs 生成，勿手改。\n */\nexport * from "./entities";\n`;
}
// ============================================================ Java 实体
const javaStr = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

/** 包名段：小写字母数字下划线，首字符不能是数字 */
function appPackageOf(appKey) {
  const raw = String(appKey);
  let pkg = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (/^[0-9]/.test(pkg)) pkg = "a_" + pkg;
  if (pkg !== raw) warn(raw, `应用 key 不是合法 Java 包名段，产物包名改用 "${pkg}"`);
  return pkg;
}

/** 字段级校验器 → Bean Validation 注解。落不到注解上的（文件大小、跨字段表达式）交给应用层。 */
function javaValidationOf(item, imports, supportAnnotation) {
  const out = [];
  const f = item.field;
  if (item.required) {
    imports.add("jakarta.validation.constraints.NotNull");
    out.push("@NotNull");
  }
  if (!f) return out;
  const validators = f.validators || [];
  const pick = (type) => validators.find((v) => v.type === type);
  const minLength = pick("minLength")?.value;
  const maxLength = pick("maxLength")?.value;
  const maxes = [f.length, maxLength].filter((x) => typeof x === "number");
  const lenMax = maxes.length ? Math.min(...maxes) : null;
  const lenMin = typeof minLength === "number" && minLength > 0 ? minLength : null;
  if (lenMin !== null || lenMax !== null) {
    imports.add("jakarta.validation.constraints.Size");
    const parts = [];
    if (lenMin !== null) parts.push(`min = ${lenMin}`);
    if (lenMax !== null) parts.push(`max = ${lenMax}`);
    out.push(`@Size(${parts.join(", ")})`);
  }
  const pattern = pick("pattern");
  if (pattern && typeof pattern.value === "string") {
    imports.add("jakarta.validation.constraints.Pattern");
    out.push(`@Pattern(regexp = ${javaStr(pattern.value)})`);
  }
  const bounds = [];
  const range = pick("range");
  if (range) {
    if (typeof range.min === "number") bounds.push(["min", range.min]);
    if (typeof range.max === "number") bounds.push(["max", range.max]);
  }
  const lower = pick("min");
  if (lower && typeof lower.value === "number") bounds.push(["min", lower.value]);
  const upper = pick("max");
  if (upper && typeof upper.value === "number") bounds.push(["max", upper.value]);
  for (const [kind, value] of bounds) {
    const isMin = kind === "min";
    if (item.javaType === "BigDecimal") {
      imports.add(`jakarta.validation.constraints.${isMin ? "DecimalMin" : "DecimalMax"}`);
      out.push(`@${isMin ? "DecimalMin" : "DecimalMax"}(${javaStr(String(value))})`);
    } else if (item.javaType === "Integer") {
      imports.add(`jakarta.validation.constraints.${isMin ? "Min" : "Max"}`);
      out.push(`@${isMin ? "Min" : "Max"}(${value}L)`);
    } else {
      warn(`${item.name}`, `${kind} 校验器落在 Java 类型 ${item.javaType} 上，没有对应注解，已跳过（应用层校验）`);
    }
  }
  if (f.type === "enum" && f.enumRef?.key) {
    imports.add(supportAnnotation);
    const def = ENUM_REG.defs.get(f.enumRef.key);
    const values = (def?.values || f.enumValues || []).map((v) => javaStr(String(v.value)));
    const tail = values.length ? `, values = { ${values.join(", ")} }` : "";
    out.push(`@LcpEnumRef(value = ${javaStr(f.enumRef.key)}${tail})`);
  }
  return out;
}

function renderJavaEntity(plan, bundle) {
  const { entity } = plan;
  const support = `dev.lcp.generated.${plan.appPkg}.support.LcpEnumRef`;
  const imports = new Set();
  const components = [];
  const used = new Map();
  let needJsonProperty = false;
  let usedEnum = false;

  for (const item of plan.shape) {
    if (item.kind === "formula") continue; // 派生字段不落库，Java 行形态不承载
    const owner = `${entity.key}.${item.name}`;
    let name = camel(item.name);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      bad(owner, `字段名 "${item.name}" 转不出合法 Java 标识符，已跳过`);
      continue;
    }
    if (used.has(name) && used.get(name) !== item.name) {
      const alt = name + "Value";
      warn(owner, `驼峰化后与字段 ${used.get(name)} 撞名（都是 ${name}），改名 ${alt}`);
      name = alt;
    }
    used.set(name, item.name);

    for (const imp of item.javaImports) imports.add(imp);
    const annos = [];
    if (item.name !== name) {
      needJsonProperty = true;
      annos.push(`@JsonProperty(${javaStr(item.name)})`);
    }
    const validation = javaValidationOf(item, imports, support);
    if (validation.some((a) => a.startsWith("@LcpEnumRef"))) usedEnum = true;
    annos.push(...validation);

    const block = [];
    if (item.doc) block.push(`    /** ${safeDoc(item.doc)} */`);
    for (const a of annos) block.push(`    ${a}`);
    block.push(`    ${item.javaType} ${name}`);
    components.push(block.join("\n"));
  }

  if (needJsonProperty) imports.add("com.fasterxml.jackson.annotation.JsonProperty");
  const importLines = [...imports].sort();

  const doc = [];
  doc.push("/**");
  doc.push(` * ${safeDoc(textOf(entity.name) || entity.key)} · ${entity.key} → ${plan.table}`);
  if (textOf(entity.semantic?.intent)) doc.push(` * ${safeDoc(textOf(entity.semantic.intent))}`);
  doc.push(" *");
  doc.push(" * 本类描述 **数据平面行形态**（不是 API 视图）：含平台注入列，不含 formula 派生字段。");
  doc.push(" * storage=jsonb 的字段是 record 的一等属性，由 BffJsonbMapper 与 jsonb 列互转，业务代码无感。");
  doc.push(" * 列在库里一律可空：required 只映射为 @NotNull 作应用层强校验，不是数据库 NOT NULL。");
  const shape = plan.shape.length;
  doc.push(` * 属性 ${shape} 个（JSONB 内 ${plan.shape.filter((i) => i.kind === "jsonb").length} 个，派生 ${plan.shape.filter((i) => i.kind === "formula").length} 个未生成）`);
  doc.push(" */");

  return [
    `package dev.lcp.generated.${plan.appPkg}.entity;`,
    "",
    ...importLines.map((i) => `import ${i};`),
    ...(importLines.length ? [""] : []),
    ...doc,
    components.length
      ? `public record ${plan.className}(\n${components.join(",\n\n")}\n) {\n}`
      : `public record ${plan.className}() {\n}`,
    ""
  ].join("\n");
}

function renderJavaEnumRefSupport(appPkg) {
  return `package dev.lcp.generated.${appPkg}.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记枚举字段对应的共享枚举 key 与允许取值。
 *
 * 平台运行时的等价注解尚未落地，出码引擎先自带一份占位实现，保证产物可独立编译；
 * 接入平台 runtime 后把各实体的 import 换成平台版本即可，注解本身是同一个契约。
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.TYPE_USE, ElementType.ANNOTATION_TYPE })
public @interface LcpEnumRef {
    /** 共享枚举 key，对应 DataSchema.enums[].key */
    String value();
    /** 允许的取值，供运行时校验与前端下拉共用 */
    String[] values() default {};
}
`;
}
// ============================================================ 产出装配
const APPS = new Map();
const MANIFEST_NAME = "GENERATED.txt";
const MANIFEST_MARK = "# tools/gen-entity.mjs 的产物清单";

function defaultBundles() {
  const dir = path.join(ROOT, "examples");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".bundle.json")).sort().map((f) => path.join(dir, f));
}

function renderSqlReadme(bundle, plans) {
  const lines = [
    `# ${bundle.app?.key ?? "?"} · 数据库脚本`,
    "",
    "由 `tools/gen-entity.mjs` 生成，勿手改。执行顺序：",
    "",
    "1. `00_extensions.sql` —— 扩展与运行时约定",
    "2. `10_*.sql` —— 逐表建表 + 列注释 + 索引（顺序无所谓，无跨表外键）",
    "3. `90_rls.sql` —— 行级安全策略",
    "",
    "## 幂等与事务",
    "",
    "- 全部 `create ... if not exists` / `drop ... if exists`，可重复执行。",
    "- `create index concurrently` 不能在事务块内执行：不要用 `BEGIN/COMMIT` 包裹，",
    "  也不要让迁移框架为每个文件自动开事务。",
    "",
    "## 表清单",
    "",
    "| 表 | 实体 | 项 | 列 | 索引 | 租户列 | 软删除 | 乐观锁 |",
    "|---|---|---:|---:|---:|---|---|---|",
  ];
  for (const plan of plans) {
    const { entity } = plan;
    const sd = softDeleteOf(entity);
    lines.push(
      `| \`${plan.table}\` | ${entity.key} | ${plan.cols.length} | ${
        plan.cols.filter((c) => c.field).length
      } | ${(entity.indexes || []).length} | ${tenantColumnOf(entity) ?? "（全局共享）"} | ${
        sd ? sd.column : "否"
      } | ${entity.storage?.optimisticLock ? "是" : "否"} |`
    );
  }
  lines.push("");
  lines.push("## 两条与直觉相反的设计");
  lines.push("");
  lines.push("- 业务列一律可空：`required=true` 由应用层校验，不生成 `NOT NULL`，方便灰度期新旧 Schema 共存。");
  lines.push("- `enum` 落 `varchar` 而非 PG enum 类型、也不加 CHECK 约束：新增枚举值不该要 DDL。");
  lines.push("");
  return lines.join("\n");
}

function renderAppReadme(entry) {
  const { bundle, plans, files, appPkg } = entry;
  const lines = [
    `# ${entry.key} · 出码产物`,
    "",
    `应用 **${bundle.app?.key ?? "?"}** · 协议版本 ${bundle.protocolVersion ?? "?"} · 租户模板 ${bundle.tenantId ?? "（bundle 未指定）"}`,
    "",
    "由 `tools/gen-entity.mjs` 依据 Bundle 里的 DataSchema 生成，勿手改；改 Schema 后重跑生成器。",
    "",
    "## 目录",
    "",
    "- `sql/` —— PostgreSQL DDL：扩展、逐表建表与索引、RLS 策略",
    "- `ts/entities.ts` —— API / BFF 返回形态的 TypeScript 类型（含平台列与派生字段）",
    `- \`java/src/main/java/dev/lcp/generated/${appPkg}/\` —— 数据平面行形态的 Java record（含平台列与 Bean Validation）`,
    "",
    "## 生成范围的边界",
    "",
    "本步骤只做「数据模型 → 落库代码」，以下是**有意不生成**的部分：",
    "",
    "- 业务列不加 `NOT NULL`：由应用层按 `required` 校验（灰度期新旧 Schema 共存）。",
    "- `enum` 不建 PG 类型、不加 CHECK：加枚举值不该要 DDL。",
    "- `formula` 字段不落库，只进 TS 形态（`readonly`），Java 行形态不承载。",
    "- `Index.where` 是表达式（Expr），本步骤不编译部分索引条件，索引按全量建立。",
    "- `storage.partitionBy` 分区表未生成，待 DDL 编译器接入。",
    "- `auditLog=true` 的审计写入在平台侧 `lcp_audit_log`，不在业务表建触发器。",
    "- 跨实体外键、`Field.refConstraint` 未生成真实 FK：协议默认软关联。",
    "- `LcpEnumRef` 是平台 runtime 注解的占位实现，接入平台后换 import 即可。",
    "",
    "## 表与实体",
    "",
    "| 表 | 实体 | TS 类型 | Java 类 |",
    "|---|---|---|---|",
  ];
  for (const plan of plans) {
    lines.push(
      `| \`${plan.table}\` | ${plan.entity.key} | \`${plan.className}\` | \`${plan.className}\` |`
    );
  }
  lines.push("");
  lines.push(`## 文件清单（${files.size} 个产物 + 本文件；另有 GENERATED.txt 清单）`);
  lines.push("");
  for (const rel of [...files.keys()].sort()) lines.push(`- \`${rel}\``);
  lines.push("");
  lines.push("## 统计");
  lines.push("");
  lines.push(`- 表 ${plans.length} 个，列 ${plans.reduce((n, p) => n + p.cols.length, 0)} 个`);
  lines.push(`- JSONB 内字段 ${plans.reduce((n, p) => n + p.shape.filter((i) => i.kind === "jsonb").length, 0)} 个，派生字段 ${plans.reduce((n, p) => n + p.shape.filter((i) => i.kind === "formula").length, 0)} 个`);
  lines.push("");
  return lines.join("\n");
}

export function renderApp(bundle, source) {
  const appKey = bundle.app?.key;
  if (!appKey) {
    bad(source, "bundle.app.key 缺失，无法定位产物目录");
    return null;
  }
  if (APPS.has(appKey)) {
    bad(source, `应用 key "${appKey}" 重复（前一个来自 ${APPS.get(appKey).source}）`);
    return null;
  }
  resetStat();
  resetEnums();
  resetClasses();
  const schemas = bundle.artifacts?.dataSchemas || [];
  if (schemas.length === 0) warn(appKey, "bundle.artifacts.dataSchemas 为空，本应用不产出任何文件");
  registerEnums(schemas);
  const appPkg = appPackageOf(appKey);

  const plans = [];
  for (const ds of schemas) {
    for (const entity of ds.entities || []) {
      if (entity.enabled === false) {
        note(`${appKey}.${entity.key}`, "enabled=false，跳过全部产物");
        STAT.skippedTables += 1;
        continue;
      }
      const plan = { entity, ds, appKey, appPkg, table: tableOf(entity), className: entityClassOf(entity.key), cols: [], shape: [] };
      plan.cols = columnsOf(entity, ds).columns;
      plan.shape = shapeOf(entity, ds);
      plans.push(plan);
    }
  }

  const files = new Map();
  files.set("sql/00_extensions.sql", renderSqlExtensions(bundle));
  let seq = 10;
  for (const plan of plans) {
    let rel = `sql/${seq}_${plan.table}.sql`;
    if (files.has(rel)) {
      const alt = `sql/${seq}_${plan.table}__${plan.entity.key}.sql`;
      warn(`${appKey}.${plan.entity.key}`, `表名 ${plan.table} 与同目录文件重名，改用 ${alt}`);
      rel = alt;
    }
    files.set(rel, renderTableFile(plan.entity, plan.ds));
    seq += 1;
    STAT.tables += 1;
    STAT.columns += plan.cols.length;
  }
  files.set("sql/90_rls.sql", renderRls(plans));
  files.set("sql/README.md", renderSqlReadme(bundle, plans));
  files.set("ts/entities.ts", renderTsEntities(bundle, plans));
  files.set("ts/index.ts", renderTsIndex());

  let needsEnumRef = false;
  for (const plan of plans) {
    const text = renderJavaEntity(plan, bundle);
    if (text.includes("@LcpEnumRef")) needsEnumRef = true;
    files.set(`java/src/main/java/dev/lcp/generated/${appPkg}/entity/${plan.className}.java`, text);
    STAT.javaClasses += 1;
  }
  if (needsEnumRef) {
    files.set(`java/src/main/java/dev/lcp/generated/${appPkg}/support/LcpEnumRef.java`, renderJavaEnumRefSupport(appPkg));
  }

  const entry = { key: appKey, source, bundle, plans, files, appPkg };
  files.set("README.md", renderAppReadme(entry));
  APPS.set(appKey, entry);
  return entry;
}
// ============================================================ 写盘
/** 递归列出 root 下的所有文件；root 不存在时返回空数组 */
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
 * 本生成器只拥有这几个子树。codegen/<app>/api/ 归 gen-api.mjs 所有 ——
 * 两个生成器各扫各的目录，谁也不许顺手删掉对方的产物。
 */
export const OWNED_SUBDIRS = ["sql", "ts", "java"];
export const OWNED_ROOT_FILES = new Set(["README.md"]);
/** gen-project 写在 sql/ 下的组装产物，本生成器只共享目录、不拥有文件。 */
const FOREIGN_OWNED = new Set(["sql/95_force_rls.sql"]);
export function ownsPath(rel) {
  return OWNED_ROOT_FILES.has(rel) || OWNED_SUBDIRS.some((dir) => rel.startsWith(dir + "/"));
}

/**
 * 删掉上一轮留下、这一轮不再产出的文件（实体改名、枚举删值都会留下孤儿）。
 * 只认本生成器产出的后缀与自己的子树，且显式跳过清单自身 —— 删了它下一轮就判断不出谁过期。
 */
function removeStale(appDir, keep) {
  const removed = [];
  for (const existing of listFiles(appDir)) {
    const rel = path.relative(appDir, existing).replace(/\\/g, "/");
    if (keep.has(rel) || rel === MANIFEST_NAME) continue;
    if (FOREIGN_OWNED.has(rel)) continue;
    if (!ownsPath(rel)) continue;
    if (!/\.(sql|ts|java|md)$/.test(rel)) continue;
    fs.rmSync(existing, { force: true });
    removed.push(rel);
  }
  return removed;
}

/** 收掉空目录：上一轮独占某个包、这一轮不再产出时留下的空壳 */
function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  const dirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      dirs.push(full);
      walk(full);
    }
  };
  walk(root);
  for (const dir of dirs.sort((left, right) => right.length - left.length)) {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}

function manifestText(written, removed) {
  const lines = [
    MANIFEST_MARK + "。每行一个文件路径（相对本目录）。",
    "# 下一轮生成时，sql/ ts/ java/ 下不在本清单里的 .sql/.ts/.java/.md 会被删掉；api/ 归 gen-api.mjs 所有，本生成器不动。",
    `# 文件数：${written.length + 1}（含本清单）`,
  ];
  for (const item of written) lines.push(item.rel);
  lines.push(MANIFEST_NAME);
  if (removed.length > 0) {
    lines.push("");
    lines.push(`# 本轮清理掉的过期产物 ${removed.length} 个：`);
    for (const rel of removed) lines.push("# - " + rel);
  }
  return lines.join("\n") + "\n";
}

function topManifestText(apps) {
  const lines = [
    MANIFEST_MARK + "（顶层）。本目录下每个子目录对应一个应用。",
    "# 子目录里没有本清单的，视为手工目录，生成器不动它。",
    `# 应用数：${apps.length}`,
  ];
  for (const app of apps) lines.push(app.key);
  return lines.join("\n") + "\n";
}

function writeAll() {
  const summary = { apps: [], removedDirs: [], stats: createWriteStats() };
  const keepApps = new Set(APPS.keys());
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  for (const entry of APPS.values()) {
    const appDir = path.join(OUT_ROOT, entry.key);
    const written = [...entry.files.keys()].sort().map((rel) => ({ rel, text: entry.files.get(rel) }));
    const removed = removeStale(appDir, new Set(written.map((item) => item.rel)));
    for (const item of written) {
      const target = path.join(appDir, item.rel);
      writeTextIfChanged(target, item.text, summary.stats);
    }
    writeTextIfChanged(path.join(appDir, MANIFEST_NAME), manifestText(written, removed), summary.stats);
    for (const sub of OWNED_SUBDIRS) pruneEmptyDirs(path.join(appDir, sub));
    summary.apps.push({ key: entry.key, dir: appDir, files: written.length + 1, removed });
  }

  // 顶层：清理已下线应用的产物目录。只删「直接位于 codegen/ 下、且带我们清单」的目录。
  const outResolved = path.resolve(OUT_ROOT);
  for (const entry of fs.readdirSync(OUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || keepApps.has(entry.name)) continue;
    const dir = path.resolve(path.join(OUT_ROOT, entry.name));
    if (path.dirname(dir) !== outResolved) {
      warn(entry.name, "不在 codegen/ 直属子目录下，未清理");
      continue;
    }
    const manifest = path.join(dir, MANIFEST_NAME);
    if (!fs.existsSync(manifest) || !fs.readFileSync(manifest, "utf8").startsWith(MANIFEST_MARK)) {
      warn(entry.name, "目录里没有本生成器的清单，判定为手工目录，未清理");
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    summary.removedDirs.push(entry.name);
  }

  writeTextIfChanged(path.join(OUT_ROOT, MANIFEST_NAME), topManifestText([...APPS.values()]), summary.stats);
  return summary;
}
// ============================================================ 自检
function stripCommentsAndLiterals(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function countChar(s, ch) {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}

/** 产物级自检：编码、占位符残留、括号配平 */
function selfCheckProducts() {
  for (const entry of APPS.values()) {
    for (const [rel, text] of entry.files) {
      const where = `${entry.key}/${rel}`;
      if (text.includes("\r")) bad(where, "含 CRLF；出码产物统一 LF");
      if (!text.endsWith("\n")) bad(where, "文件末尾缺少换行");
      if (text.includes("[object Object]")) bad(where, "出现 [object Object]：有对象被直接拼进了字符串");
      const bare = stripCommentsAndLiterals(text);
      if (/\bundefined\b/.test(bare)) bad(where, "出现 undefined：拼接时漏了字段");
      if (/\bNaN\b/.test(bare)) bad(where, "出现 NaN：数值拼接出了问题");
      for (const [open, close] of [["(", ")"], ["{", "}"], ["[", "]"]]) {
        const left = countChar(bare, open);
        const right = countChar(bare, close);
        if (left !== right) bad(where, `括号不配平：${open}=${left} ${close}=${right}`);
      }
      if (rel.endsWith(".sql") && /\b(TODO|FIXME|XXX)\b/.test(text)) bad(where, "SQL 里残留 TODO/FIXME");
    }
  }
}

/** 与 validate.mjs 的 L3 口径对齐：FieldType 枚举 ↔ 注册表必须双向一致 */
function selfCheckRegistry() {
  for (const [name, t] of Object.entries(TYPES)) {
    if (!t.ts || typeof t.ts.type !== "string") bad(`registry:${name}`, "type-mapping 缺 ts.type");
    if (!t.java || typeof t.java.type !== "string") bad(`registry:${name}`, "type-mapping 缺 java.type");
    if (name !== "formula" && (t.pg?.base ?? null) === null) bad(`registry:${name}`, "type-mapping 缺 pg.base（formula 是派生字段，可以没有）");
  }
  const file = path.join(ROOT, "schema", "data.schema.json");
  if (!fs.existsSync(file)) {
    warn("schema/data.schema.json", "不存在，跳过 FieldType 双向比对");
    return;
  }
  const values = JSON.parse(fs.readFileSync(file, "utf8")).$defs?.FieldType?.enum;
  if (!Array.isArray(values)) {
    warn("schema/data.schema.json", "$defs.FieldType.enum 读不到，跳过双向比对");
    return;
  }
  const keys = Object.keys(TYPES);
  for (const v of values) if (!keys.includes(v)) bad(`schema:${v}`, "FieldType 枚举值在 registry/type-mapping.json 里没有对应项（L3 校验会拦）");
  for (const k of keys) if (!values.includes(k)) bad(`registry:${k}`, "注册表里的类型不在 DataSchema.FieldType 枚举内（L3 校验会拦）");
  if (values.length !== keys.length) warn("FieldType", `schema 枚举 ${values.length} 个、注册表 ${keys.length} 个，数量不一致`);
}

/** 语义级自检：租户列、RLS 覆盖、唯一索引带租户、形态无重名、列顺序 */
function selfCheckSemantics() {
  for (const entry of APPS.values()) {
    const tables = new Map(entry.plans.map((plan) => [plan.table, plan]));
    const rls = entry.files.get("sql/90_rls.sql") ?? "";
    const tableSql = [...entry.files].filter(([rel]) => /^sql\/\d+_/.test(rel)).map(([, text]) => text).join("\n");

    for (const plan of entry.plans) {
      const where = `${entry.key}.${plan.entity.key}`;
      const tenant = tenantColumnOf(plan.entity);
      if (tenant && !plan.cols.some((col) => col.name === tenant)) {
        bad(where, `表 ${plan.table} 的列里没有租户列 ${tenant}`);
      }
      if (tenant && !(rls.includes("create policy") && rls.includes(`on "${plan.table}"`))) {
        bad(where, `表 ${plan.table} 有租户列，但 90_rls.sql 里没有它的策略`);
      }
      if (!tenant && rls.includes(`on "${plan.table}"`)) {
        bad(where, `表 ${plan.table} 声明为全局共享（tenantColumn=null），却生成了 RLS 策略`);
      }
      if (!tableSql.includes(`create table if not exists "${plan.table}"`)) {
        bad(where, `没有找到表 ${plan.table} 的建表语句`);
      }
      const pk = primaryKeyOf(plan.entity);
      if (plan.cols.length > 0 && plan.cols[0].name !== pk) {
        bad(where, `建表列的第一个不是主键 ${pk}（实际是 ${plan.cols[0].name}）`);
      }
      const seen = new Set();
      for (const item of plan.shape) {
        if (seen.has(item.name)) bad(where, `形态里出现重复属性 ${item.name}`);
        seen.add(item.name);
        if (typeof item.tsType !== "string" || item.tsType.length === 0) bad(`${where}.${item.name}`, "tsType 为空");
        if (typeof item.javaType !== "string" || item.javaType.length === 0) bad(`${where}.${item.name}`, "javaType 为空");
        if (item.field && !TYPES[item.field.type]) bad(`${where}.${item.name}`, `FieldType "${item.field.type}" 不在注册表里`);
      }
    }

    const uniqueIndex = /create unique index(?: concurrently)? if not exists "([^"]+)" on "([^"]+)"[^(]*\(([^)]*)\)/g;
    for (const [, text] of entry.files) {
      uniqueIndex.lastIndex = 0;
      let match;
      while ((match = uniqueIndex.exec(text))) {
        const plan = tables.get(match[2]);
        if (!plan) {
          bad(`${entry.key}/${match[1]}`, `唯一索引指向未生成的表 ${match[2]}`);
          continue;
        }
        const tenant = tenantColumnOf(plan.entity);
        if (tenant && !match[3].trim().startsWith(`"${tenant}"`)) {
          bad(`${entry.key}/${match[1]}`, `唯一索引没有以租户列 ${tenant} 前导，租户间会互相冲突`);
        }
      }
    }
  }
}

// ============================================================ 汇报与入口
function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.level ?? "error"}|${item.where}|${item.msg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const INFO_PRINT_CAP = 60;

function report() {
  const problems = dedupe(PROBLEMS);
  const notes = dedupe(NOTES);
  const warns = notes.filter((n) => n.level === "warn");
  const infos = notes.filter((n) => n.level === "info");
  const out = [""];
  out.push("==================== gen-entity 自检 ====================");
  out.push(problems.length ? `错误 ${problems.length} 条：` : "错误 0 条。");
  for (const p of problems) out.push(`  [error] ${p.where} :: ${p.msg}`);
  if (warns.length) {
    out.push(`告警 ${warns.length} 条：`);
    for (const n of warns) out.push(`  [warn]  ${n.where} :: ${n.msg}`);
  }
  if (infos.length) {
    out.push(`提示 ${infos.length} 条：`);
    for (const n of infos.slice(0, INFO_PRINT_CAP)) out.push(`  [info]  ${n.where} :: ${n.msg}`);
    if (infos.length > INFO_PRINT_CAP) out.push(`  [info]  …… 另有 ${infos.length - INFO_PRINT_CAP} 条，已省略`);
  }
  return { problems, warns, infos, text: out.join("\n") };
}

function printSummary(summary) {
  console.log("");
  console.log("==================== 产出 ====================");
  for (const app of summary.apps) {
    const entry = APPS.get(app.key);
    const s = entry.stats ?? {};
    console.log(`  ${app.key}  →  ${app.dir}`);
    console.log(
      `    表 ${entry.plans.length} · 列 ${s.columns ?? 0} · 索引 ${s.indexes ?? 0} · RLS 策略 ${s.policies ?? 0}` +
        ` · TS 接口 ${s.tsInterfaces ?? 0} · TS 枚举别名 ${s.tsAliases ?? 0} · Java 类 ${s.javaClasses ?? 0}` +
        ` · JSONB 内字段 ${s.jsonbFields ?? 0} · 派生字段 ${s.formulas ?? 0}` +
        (s.skippedTables ? ` · 跳过表 ${s.skippedTables}` : "")
    );
    console.log(`    文件 ${app.files} 个（含 GENERATED.txt）${app.removed.length ? ` · 清理过期产物 ${app.removed.length} 个` : ""}`);
    for (const rel of app.removed) console.log(`      清理 ${rel}`);
  }
  if (summary.removedDirs.length) {
    console.log(`  清理已下线应用目录：${summary.removedDirs.join(", ")}`);
  }
  console.log(`  增量写入：${writeStatsText(summary.stats)}`);
  console.log(`  顶层清单：${path.join(OUT_ROOT, MANIFEST_NAME)}`);
  console.log("");
}

// ============================================================ 负向自测（--self-test）
/**
 * 上面那些断言只有在「出错时」才看得见效果，容易被误当成空跑。
 * --self-test 用内存里的小 Bundle 把每条不变量逼出来验一遍，不写盘。
 */
const PROBE_STORAGE = {
  primaryKey: "id", idType: "ulid", tenantColumn: "tenant_id", jsonbColumn: "ext",
  softDelete: { enabled: true },
  timestamps: { createdAt: "created_at", updatedAt: "updated_at", createdBy: "created_by", updatedBy: "updated_by" }
};
const PROBE_ID = { id: "01SELFTEST000000000F1", key: "id", label: "主键", type: "string", storage: "column", columnType: "varchar(26)", required: true };

function probeBundle(appKey, entity) {
  return {
    protocolVersion: "0.1",
    tenantId: "tenant_selftest",
    app: { key: appKey, name: appKey },
    artifacts: { dataSchemas: [{ key: "selftest_core", scope: "system", version: 1, name: "自测模型", entities: [entity] }] }
  };
}

function probeEntity(storage, fields, indexes) {
  return { id: "01SELFTEST0000000001", key: "probe", tableName: "probe_tbl", name: "自测实体", titleField: "id", storage, fields, indexes };
}

/** 跑一遍 renderApp 但只取诊断，不污染全局状态，也不写盘 */
function probe(bundle) {
  const problemsBefore = PROBLEMS.length;
  const notesBefore = NOTES.length;
  const entry = renderApp(bundle, "(self-test)");
  const result = {
    entry,
    problems: PROBLEMS.slice(problemsBefore),
    notes: NOTES.slice(notesBefore)
  };
  PROBLEMS.length = problemsBefore;
  NOTES.length = notesBefore;
  if (entry) APPS.delete(entry.key);
  return result;
}

const SQL_OF = (r, suffix) => {
  const hit = [...r.entry.files].find(([rel]) => rel.endsWith(suffix));
  return hit ? hit[1] : "";
};

function selfTestCases() {
  return [
    {
      name: "未知 FieldType 必须报错",
      bundle: probeBundle("st_badtype", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTF2", key: "wheel", label: "轮子", type: "wheel", storage: "column" }], [])),
      check: (r) => (r.problems.some((p) => p.msg.includes('未知 FieldType "wheel"')) ? null : "没有拦下未知 FieldType")
    },
    {
      name: "全局共享表不加租户列、不建 RLS",
      bundle: probeBundle("st_global", probeEntity({ ...PROBE_STORAGE, tenantColumn: null }, [PROBE_ID], [])),
      check: (r) => {
        if (r.entry.plans[0].cols.some((c) => c.name === "tenant_id")) return "列里出现了 tenant_id";
        if (SQL_OF(r, "90_rls.sql").includes("create policy")) return "生成了 RLS 策略";
        return r.problems.length ? `有未预期的错误：${r.problems[0].msg}` : null;
      }
    },
    {
      name: "每张有租户列的表都必须有 RLS 策略",
      bundle: probeBundle("st_rls", probeEntity(PROBE_STORAGE, [PROBE_ID], [])),
      check: (r) => {
        const rls = SQL_OF(r, "90_rls.sql");
        if (!rls.includes('alter table "probe_tbl" enable row level security')) return "没有 enable row level security";
        if (!rls.includes('create policy "probe_tbl_tenant_isolation" on "probe_tbl"')) return "没有建租户隔离策略";
        if (!rls.includes("current_setting('lcp.tenant_id', true)")) return "策略条件没读 lcp.tenant_id";
        return null;
      }
    },
    {
      name: "唯一索引必须以租户列前导（软删除表再用部分索引）",
      bundle: probeBundle("st_uk", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTF3", key: "code", label: "编号", type: "string", storage: "column", length: 32, unique: true }], [])),
      check: (r) => {
        const sql = SQL_OF(r, "10_probe_tbl.sql");
        const match = /create unique index[^(]*\(([^)]*)\)([\s\S]*?);/.exec(sql);
        if (!match) return "没有生成唯一索引";
        if (match[1].trim() !== '"tenant_id", "code"') return `唯一索引列不对：${match[1]}`;
        if (!/where\s+"deleted_at" is null/.test(match[2])) return "软删除表没有用部分唯一索引";
        return null;
      }
    },
    {
      name: "enum 落 varchar，不建 PG 枚举类型、不加 CHECK",
      bundle: probeBundle("st_enum", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTF4", key: "status", label: "状态", type: "enum", storage: "column", enumValues: [{ value: "on", label: "开" }, { value: "off", label: "关" }] }], [])),
      check: (r) => {
        const sql = SQL_OF(r, "10_probe_tbl.sql");
        if (!/"status" varchar\(64\)/.test(sql)) return "enum 列不是 varchar(64)";
        if (/check\s*\(\s*"status"/.test(sql)) return "给 enum 加了 CHECK 约束";
        if (/create type/.test(sql)) return "建了 PG 枚举类型";
        return null;
      }
    },
    {
      name: "array 嵌套超 3 层必须告警",
      bundle: probeBundle("st_deep", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTF5", key: "deep", label: "深数组", type: "array", storage: "jsonb", itemType: { type: "array", itemType: { type: "array", itemType: { type: "array", itemType: { type: "string" } } } } }], [])),
      check: (r) => (r.notes.some((n) => n.level === "warn" && n.msg.includes("array 嵌套超过 3 层")) ? null : "没有对超深数组告警")
    },
    {
      name: "产物清单必须是真实路径，不能出现 [object Object]",
      bundle: probeBundle("st_manifest", probeEntity(PROBE_STORAGE, [PROBE_ID], [])),
      check: () => {
        const text = manifestText([{ rel: "sql/10_probe_tbl.sql", text: "x" }], []);
        if (text.includes("[object Object]")) return "清单里出现 [object Object]";
        if (!text.includes("sql/10_probe_tbl.sql")) return "清单没有列出产物路径";
        return null;
      }
    },
    {
      name: "formula 进 TS（readonly）但不进 Java",
      bundle: probeBundle("st_formula", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTF6", key: "label_count", label: "条目数", type: "formula", formula: { "$fn": "len", "$args": [{ "$ref": "$form.items" }] } }], [])),
      check: (r) => {
        if (!/readonly label_count\?: unknown;/.test(SQL_OF(r, "ts/entities.ts"))) return "TS 里没有 readonly 派生字段：应形如 `readonly label_count?: unknown;`";
        if (SQL_OF(r, "entity/Probe.java").includes("labelCount")) return "Java 行形态里出现了派生字段";
        if (/"label_count"/.test(SQL_OF(r, "10_probe_tbl.sql"))) return "派生字段落了库";
        return null;
      }
    }
  ];
}

function runSelfTest() {
  resetStat();
  resetEnums();
  resetClasses();
  let failed = 0;
  console.log("gen-entity --self-test：用内存 Bundle 逐条逼出断言");
  for (const item of selfTestCases()) {
    const result = probe(item.bundle);
    let reason = null;
    try {
      reason = result.entry ? item.check(result) : `没有产出（${result.problems[0]?.msg ?? "未知原因"}）`;
    } catch (err) {
      reason = `断言抛错：${err.message}`;
    }
    if (reason) {
      failed += 1;
      console.log(`  [FAIL] ${item.name}\n         ${reason}`);
    } else {
      console.log(`  [PASS] ${item.name}`);
    }
  }
  console.log(failed === 0 ? `\n全部 ${selfTestCases().length} 条通过。` : `\n${failed} 条失败。`);
  process.exit(failed === 0 ? 0 : 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const files = args.length > 0 ? args : defaultBundles();
  if (files.length === 0) {
    console.error("gen-entity：没有输入。传 bundle 路径，或在 examples/ 下放 *.bundle.json。");
    process.exit(2);
  }
  for (const file of files) {
    if (!fs.existsSync(file)) {
      bad(file, "文件不存在");
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      bad(file, `JSON 解析失败：${err.message}`);
      continue;
    }
    const entry = renderApp(doc.bundle ?? doc, path.basename(file));
    if (entry) entry.stats = { ...STAT };
  }

  selfCheckRegistry();
  selfCheckProducts();
  selfCheckSemantics();

  const result = report();
  console.log(result.text);
  if (result.problems.length > 0) {
    console.error(`gen-entity 失败：${result.problems.length} 条错误，一个文件都没写。`);
    process.exit(1);
  }
  printSummary(writeAll());
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
