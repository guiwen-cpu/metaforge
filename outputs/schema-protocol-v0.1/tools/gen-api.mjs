#!/usr/bin/env node
/**
 * LCP 出码引擎 · 第二步：数据模型 → BFF CRUD 接口（Spring Boot + 元数据驱动 runtime）
 *
 *   node tools/gen-api.mjs [bundle.json ...]
 *
 * 不传参数时读取 examples/ 下所有 *.bundle.json。
 * 输出：codegen/<appKey>/api/…
 *
 * 与 gen-entity 的分工：
 *   gen-entity 把 Schema 编译成**物理形态**（DDL / 实体类型）——「数据长什么样」；
 *   本文件把同一份 Schema 编译成**接口形态**（路由 / 查询条件 / 写入校验）——「数据怎么进出」。
 *   两者共用同一个规划器（本文件 import gen-entity 的 renderApp），所以列名、类型、平台列
 *   不可能出现第二套口径。codegen/<app>/api/ 归本文件所有，gen-entity 不碰。
 *
 * 三条安全边界（生成的 runtime 里逐条落实，自检逐条断言）：
 *   1. 表名 / 列名只来自生成的 LcpTableSpec，绝不来自请求；
 *   2. 所有值走命名参数，不拼 SQL 字符串；
 *   3. 排序键必须在 spec.sortableColumns() 白名单内，否则 400。
 *
 * 类型与校验的唯一来源仍是 registry/type-mapping.json 与 Schema 里的 validators —— 本文件不发明字段类型。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  renderApp,
  PROBLEMS,
  NOTES,
  pascal,
  camel,
  textOf,
  tableOf,
  primaryKeyOf,
  tenantColumnOf,
  jsonbColumnOf,
  softDeleteOf,
  timestampsOf
} from "./gen-entity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_ROOT = path.join(ROOT, "codegen");
const MANIFEST_NAME = "GENERATED.txt";
const MANIFEST_MARK = "# tools/gen-api.mjs 的产物清单";
const API_VERSION = "v1";
const MAX_PAGE_SIZE = 200;

const APPS = new Map();
const STAT = { apps: 0, entities: 0, files: 0, routes: 0, filters: 0, dtoFields: 0 };

// ============================================================ 基础工具
const bad = (where, msg) => PROBLEMS.push({ where, msg });
const note = (where, msg) => NOTES.push({ level: "info", where, msg });
const warn = (where, msg) => NOTES.push({ level: "warn", where, msg });

/** Java 字符串字面量 */
const J = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** TS 属性名：合法标识符就不加引号 */
const tsKey = (name) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name));
const uniq = (list) => [...new Set(list)];

const STORAGE_JSONB = "jsonb";
const storageOfField = (field) => field.storage ?? STORAGE_JSONB;
const isPlatformStored = (field) => field.type === "formula";

const pathOf = (appKey, entityKey) => `/api/${API_VERSION}/${appKey}/${entityKey}`;
const javaPkgOf = (appPkg, sub) => `dev.lcp.generated.${appPkg}.api.${sub}`;
const javaDirOf = (appPkg, sub) => `api/src/main/java/dev/lcp/generated/${appPkg}/api/${sub}`;

// ============================================================ 规划：从 gen-entity 的 plan 取业务字段
/**
 * 只保留真正落库的业务字段（column / jsonb）。平台注入列与 formula 派生字段都不属于「接口契约」：
 * 平台列由服务端自己写，formula 目前的运行时还没做求值 —— 都不该出现在请求体里。
 */
function businessItems(plan) {
  return plan.shape.filter((item) => item.kind === "column" || item.kind === "jsonb");
}

const pkItemOf = (plan) => businessItems(plan).find((item) => item.name === primaryKeyOf(plan.entity)) ?? null;
const jsonbItemsOf = (plan) => businessItems(plan).filter((item) => item.kind === "jsonb");
const columnItemsOf = (plan) => businessItems(plan).filter((item) => item.kind === "column");

/** 写入体能触达的字段：去掉主键（平台生成）与 formula */
const writableItemsOf = (plan) => businessItems(plan).filter((item) => item.name !== primaryKeyOf(plan.entity));
const creatableItemsOf = (plan) => writableItemsOf(plan);
const updatableItemsOf = (plan) => writableItemsOf(plan).filter((item) => item.field?.immutable !== true);

/** LcpColumn 的紧凑标记。顺序固定，便于人工扫读，也便于自检断言。 */
function flagsOf(item) {
  const f = item.field ?? {};
  const flags = [];
  if (item.kind === "jsonb") flags.push("jsonb");
  if (f.required) flags.push("req");
  if (f.immutable) flags.push("imm");
  if (f.sensitive) flags.push("sens");
  if (f.searchable) flags.push("search");
  if (f.sortable) flags.push("sort");
  return flags.join(",");
}

/** 查询条件：列存 + enum/ref/boolean 出等值，date/datetime/integer/decimal 出区间 */
const EQ_KINDS = new Set(["enum", "ref", "boolean"]);
const RANGE_KINDS = new Set(["date", "datetime", "integer", "decimal"]);
function filtersOf(plan) {
  const out = [];
  for (const item of columnItemsOf(plan)) {
    if (item.name === primaryKeyOf(plan.entity)) continue;
    const type = item.field?.type;
    if (EQ_KINDS.has(type)) out.push({ item, name: item.name, java: camel(item.name), type, mode: "eq" });
    else if (RANGE_KINDS.has(type)) {
      out.push({ item, name: item.name + "_from", java: camel(item.name) + "From", type, mode: "range" });
      out.push({ item, name: item.name + "_to", java: camel(item.name) + "To", type, mode: "range" });
    }
  }
  return out;
}

/** 排序白名单：只有列存且声明 sortable 的字段 */
const sortableItemsOf = (plan) => columnItemsOf(plan).filter((item) => item.field?.sortable === true);

/** 敏感列（读接口默认不返回；接入平台后换 LcpFieldPolicy 实现） */
const sensitiveItemsOf = (plan) => businessItems(plan).filter((item) => item.field?.sensitive === true);

/** 由 validators 推出 Jakarta Bean Validation 注解；推不出来的显式告警，不静默丢。 */
function annotationsOf(plan, item, imports, where) {
  const out = [];
  const field = item.field ?? {};
  if (field.required === true) {
    out.push("@NotNull");
    imports.add("jakarta.validation.constraints.NotNull");
  }
  let sizeMin = null;
  let sizeMax = null;
  for (const v of field.validators ?? []) {
    if (v.type === "pattern") {
      out.push(`@Pattern(regexp = ${J(v.value)}, message = ${J(oneLine(textOf(v.message)) || "格式不正确")})`);
      imports.add("jakarta.validation.constraints.Pattern");
    } else if (v.type === "minLength") {
      sizeMin = Number(v.value);
    } else if (v.type === "maxLength") {
      sizeMax = Number(v.value);
    } else if (v.type === "range" && (field.type === "integer" || field.type === "decimal")) {
      if (v.min !== undefined) {
        out.push(`@DecimalMin(value = ${J(String(v.min))}, message = ${J(oneLine(textOf(v.message)) || "小于下限")})`);
        imports.add("jakarta.validation.constraints.DecimalMin");
      }
      if (v.max !== undefined) {
        out.push(`@DecimalMax(value = ${J(String(v.max))}, message = ${J(oneLine(textOf(v.message)) || "超过上限")})`);
        imports.add("jakarta.validation.constraints.DecimalMax");
      }
    } else if (v.type === "expr") {
      warn(where, `validator=expr 无法映射为 Bean Validation（表达式 ${JSON.stringify(v.value).slice(0, 60)}…），已跳过；由 BFF 规则引擎校验`);
    } else if (["fileMaxSize", "fileAccept", "uniqueIn"].includes(v.type)) {
      note(where, `validator=${v.type} 属于存储 / 平台层约束，请求体校验不生成`);
    } else {
      warn(where, `未知 validator 类型 "${v.type}"，已跳过`);
    }
  }
  if (sizeMin !== null && sizeMax !== null) {
    out.push(`@Size(min = ${sizeMin}, max = ${sizeMax})`);
    imports.add("jakarta.validation.constraints.Size");
  } else if (sizeMin !== null) {
    out.push(`@Size(min = ${sizeMin})`);
    imports.add("jakarta.validation.constraints.Size");
  } else if (sizeMax !== null) {
    out.push(`@Size(max = ${sizeMax})`);
    imports.add("jakarta.validation.constraints.Size");
  }
  return out;
}

/** 渲染 DTO 记录体：每字段一段注释 + 注解 + 类型 + 名字 */
function renderDtoFields(plan, items, imports, where) {
  const blocks = [];
  for (const item of items) {
    const field = item.field ?? {};
    const anns = annotationsOf(plan, item, imports, `${where}.${item.name}`);
    for (const imp of item.javaImports ?? []) imports.add(imp);
    const notes = [];
    if (field.label) notes.push(oneLine(textOf(field.label)));
    if (field.immutable) notes.push("创建后不可改");
    if (field.sensitive) notes.push("敏感");
    if (item.kind === "jsonb") notes.push("落 JSONB");
    const lines = [];
    if (notes.length) lines.push(`    /** ${notes.join(" · ")} */`);
    for (const ann of anns) lines.push(`    ${ann}`);
    lines.push(`    ${item.javaType} ${camel(item.name)},`);
    blocks.push(lines.join("\n"));
    STAT.dtoFields += 1;
  }
  return blocks.join("\n");
}
// ============================================================ Java 支撑类（runtime 契约）
function supportFiles(appPkg) {
  const pkg = javaPkgOf(appPkg, "support");
  const dir = javaDirOf(appPkg, "support");
  const files = new Map();
  const add = (name, body) => files.set(`${dir}/${name}`, `package ${pkg};\n\n${body.trim()}\n`);

  add("LcpPrincipal.java", `
/**
 * 当前请求主体。平台侧实现（从会话 / JWT 解析后注入），出码侧只依赖这个接口。
 *
 * 租户与操作人永远来自服务端上下文：请求体或查询参数里即使带了 tenant_id / created_by，
 * runtime 也一律忽略，并用这里返回的值覆盖。
 */
public interface LcpPrincipal {

  String tenantId();

  String userId();
}
`);

  add("LcpPageResult.java", `
import java.util.List;

/** 分页结果。items 里每个对象的键就是 Schema 的字段 key（snake_case），前端可直接套 entities.ts 的类型。 */
public record LcpPageResult<T>(List<T> items, long total, int page, int size) {

  public LcpPageResult {
    items = List.copyOf(items);
    page = Math.max(1, page);
    size = Math.max(1, size);
  }

  /** 总页数。Jackson 会把这个访问器序列化成 pages 字段。 */
  public int pages() {
    return (int) ((total + size - 1) / size);
  }
}
`);

  add("LcpApiError.java", `
import java.util.List;

/**
 * 统一错误体。前端只认 code：
 * not_found / conflict / version_conflict / version_required / bad_request / validation_failed / principal_missing
 */
public record LcpApiError(String code, String message, List<Detail> details) {

  /** 字段级错误明细。 */
  public record Detail(String field, String message) {
  }

  public static LcpApiError of(String code, String message) {
    return new LcpApiError(code, message, List.of());
  }
}
`);

  add("LcpApiException.java", `
import org.springframework.http.HttpStatus;

/** 由 runtime 抛出的业务异常，统一由 LcpExceptionHandler 收敛成 LcpApiError。 */
public class LcpApiException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public LcpApiException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public static LcpApiException notFound(String message) {
    return new LcpApiException(HttpStatus.NOT_FOUND, "not_found", message);
  }

  public static LcpApiException conflict(String message) {
    return new LcpApiException(HttpStatus.CONFLICT, "conflict", message);
  }

  public static LcpApiException versionConflict(String message) {
    return new LcpApiException(HttpStatus.CONFLICT, "version_conflict", message);
  }

  public static LcpApiException versionRequired(String message) {
    return new LcpApiException(HttpStatus.PRECONDITION_REQUIRED, "version_required", message);
  }

  public static LcpApiException badRequest(String message) {
    return new LcpApiException(HttpStatus.BAD_REQUEST, "bad_request", message);
  }

  public static LcpApiException principalMissing(String message) {
    return new LcpApiException(HttpStatus.INTERNAL_SERVER_ERROR, "principal_missing", message);
  }
}
`);

  add("LcpExceptionHandler.java", `
import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 把 runtime 异常与请求体校验失败收敛成同一份错误体，前端只需认 code。 */
@RestControllerAdvice
public class LcpExceptionHandler {

  @ExceptionHandler(LcpApiException.class)
  public ResponseEntity<LcpApiError> handleApi(LcpApiException ex) {
    return ResponseEntity.status(ex.status()).body(LcpApiError.of(ex.code(), ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<LcpApiError> handleValidation(MethodArgumentNotValidException ex) {
    List<LcpApiError.Detail> details = new ArrayList<>();
    ex.getBindingResult().getFieldErrors().forEach((error) ->
        details.add(new LcpApiError.Detail(error.getField(), error.getDefaultMessage())));
    return ResponseEntity.badRequest().body(new LcpApiError("validation_failed", "请求参数校验未通过", details));
  }

  @ExceptionHandler(DuplicateKeyException.class)
  public ResponseEntity<LcpApiError> handleDuplicate(DuplicateKeyException ex) {
    return ResponseEntity.status(409)
        .body(LcpApiError.of("conflict", "唯一约束冲突：" + ex.getMostSpecificCause().getMessage()));
  }
}
`);

  add("LcpFieldPolicy.java", `
import java.util.Collection;

/**
 * 字段级读策略。默认实现对 sensitive 列一律拒绝 —— 失败时宁可少返回，也不泄露。
 * 接入平台后换成「按 permissions.json 的 fields 白名单」的实现即可，调用方不用改。
 */
public interface LcpFieldPolicy {

  boolean canRead(String column);

  static LcpFieldPolicy denySensitive(Collection<String> sensitiveColumns) {
    return (column) -> !sensitiveColumns.contains(column);
  }

  static LcpFieldPolicy allowAll() {
    return (column) -> true;
  }
}
`);

  add("LcpColumn.java", `
/**
 * 一个业务字段的运行期描述。runtime 只认这份描述：运行期零反射、零 Schema 解析。
 *
 * flags 为逗号分隔标记：jsonb / req / imm / sens / search / sort
 */
public record LcpColumn(
    String key,
    String kind,
    boolean jsonb,
    boolean required,
    boolean immutable,
    boolean sensitive,
    boolean searchable,
    boolean sortable) {

  public static LcpColumn of(String key, String kind, String flags) {
    java.util.List<String> set = java.util.Arrays.asList(flags.split(","));
    return new LcpColumn(
        key,
        kind,
        set.contains("jsonb"),
        set.contains("req"),
        set.contains("imm"),
        set.contains("sens"),
        set.contains("search"),
        set.contains("sort"));
  }
}
`);

  add("LcpTableSpec.java", `
import java.util.ArrayList;
import java.util.List;

/**
 * 一张表的运行期元数据。所有 SQL 都只从这份描述拼，绝不从请求里取表名 / 列名。
 * platform 里为 null 表示该能力未启用（无租户 / 无软删除 / 无乐观锁 / 无审计戳）。
 */
public record LcpTableSpec(
    String entityKey,
    String table,
    String path,
    String idType,
    PlatformColumns platform,
    List<LcpColumn> columns) {

  /** 平台注入列。null = 该实体没有启用这项能力。 */
  public record PlatformColumns(
      String primaryKey,
      String tenant,
      String jsonb,
      String softDelete,
      String version,
      String createdAt,
      String updatedAt,
      String createdBy,
      String updatedBy) {
  }

  public LcpTableSpec {
    columns = List.copyOf(columns);
  }

  public String primaryKey() {
    return platform.primaryKey();
  }

  public String tenant() {
    return platform.tenant();
  }

  public String jsonb() {
    return platform.jsonb();
  }

  public String softDeleteColumn() {
    return platform.softDelete();
  }

  public String versionColumn() {
    return platform.version();
  }

  public String createdAt() {
    return platform.createdAt();
  }

  public String updatedAt() {
    return platform.updatedAt();
  }

  public String createdBy() {
    return platform.createdBy();
  }

  public String updatedBy() {
    return platform.updatedBy();
  }

  /** 按字段 key 查列；查不到返回 null。 */
  public LcpColumn column(String key) {
    for (LcpColumn column : columns) {
      if (column.key().equals(key)) {
        return column;
      }
    }
    return null;
  }

  /** 真正建了列的字段（storage=column）。 */
  public List<LcpColumn> stored() {
    return pick(false);
  }

  /** 落在 JSONB 文档里的字段（storage=jsonb）。 */
  public List<LcpColumn> documents() {
    return pick(true);
  }

  /** 参与 q 全局搜索的列（只有列存 + searchable）。 */
  public List<String> searchColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.searchable() && !column.jsonb()) {
        out.add(column.key());
      }
    }
    return out;
  }

  /** ORDER BY 白名单（只有列存 + sortable）。 */
  public List<String> sortableColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.sortable() && !column.jsonb()) {
        out.add(column.key());
      }
    }
    return out;
  }

  public List<String> sensitiveColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.sensitive()) {
        out.add(column.key());
      }
    }
    return out;
  }

  private List<LcpColumn> pick(boolean jsonb) {
    List<LcpColumn> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.jsonb() == jsonb) {
        out.add(column);
      }
    }
    return out;
  }
}
`);

  add("LcpPageQuery.java", `
/** 列表查询的公共部分。各实体的类型化筛选条件放在 <Entity>Query 里，不进 runtime。 */
public record LcpPageQuery(int page, int size, String sort, String order, String q, boolean includeDeleted) {
}
`);

  add("LcpFilter.java", `
/**
 * 一个已白名单化的过滤条件。列名只能由生成代码给出（LcpFilter.eq("status", value)），
 * 前端传的只是值；runtime 还会再校验列存在于 spec 且为列存。
 */
public record LcpFilter(String column, Op op, Object value) {

  /** 允许出现在 SQL 里的比较运算。字符串是写死的，不来自请求。 */
  public enum Op {
    EQ("="),
    NE("<>"),
    GT(">"),
    GTE(">="),
    LT("<"),
    LTE("<="),
    ILIKE("ilike");

    private final String sql;

    Op(String sql) {
      this.sql = sql;
    }

    public String sql() {
      return sql;
    }
  }

  public static LcpFilter eq(String column, Object value) {
    return new LcpFilter(column, Op.EQ, value);
  }

  public static LcpFilter ne(String column, Object value) {
    return new LcpFilter(column, Op.NE, value);
  }

  public static LcpFilter gt(String column, Object value) {
    return new LcpFilter(column, Op.GT, value);
  }

  public static LcpFilter gte(String column, Object value) {
    return new LcpFilter(column, Op.GTE, value);
  }

  public static LcpFilter lt(String column, Object value) {
    return new LcpFilter(column, Op.LT, value);
  }

  public static LcpFilter lte(String column, Object value) {
    return new LcpFilter(column, Op.LTE, value);
  }

  public static LcpFilter ilike(String column, Object value) {
    return new LcpFilter(column, Op.ILIKE, value);
  }
}
`);

  add("LcpIds.java", `
import java.security.SecureRandom;
import java.util.UUID;

/**
 * 主键生成。ULID = 48 位毫秒时间戳 + 80 位随机数，Crockford Base32，天然按时间有序。
 * idType=bigint / snowflake 需要平台侧发号器 —— 出码侧不臆造，明确抛错。
 */
public final class LcpIds {

  private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
  private static final SecureRandom RANDOM = new SecureRandom();

  private LcpIds() {
  }

  public static String next(String idType) {
    if ("ulid".equals(idType)) {
      return ulid();
    }
    if ("uuid".equals(idType)) {
      return UUID.randomUUID().toString();
    }
    throw new IllegalStateException("idType=" + idType + " 需要平台侧发号器，出码产物不生成该实现");
  }

  public static String ulid() {
    long time = System.currentTimeMillis();
    byte[] random = new byte[10];
    RANDOM.nextBytes(random);
    char[] out = new char[26];
    for (int i = 9; i >= 0; i--) {
      out[i] = CROCKFORD[(int) (time & 0x1F)];
      time >>>= 5;
    }
    for (int i = 0; i < 16; i++) {
      int offset = i * 5;
      int value = 0;
      for (int bit = 0; bit < 5; bit++) {
        int index = offset + bit;
        int byteIndex = index / 8;
        int bitInByte = 7 - (index % 8);
        value = (value << 1) | ((random[byteIndex] >> bitInByte) & 1);
      }
      out[10 + i] = CROCKFORD[value];
    }
    return new String(out);
  }
}
`);

  return files;
}

// ============================================================ Java runtime 核心
function runtimeFile(appPkg) {
  const pkg = javaPkgOf(appPkg, "support");
  const dir = javaDirOf(appPkg, "support");
  const body = `
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * 元数据驱动的 CRUD 内核。生成代码里没有一句 SQL，SQL 全部从这里出。
 *
 * 三条安全边界：
 * 1. 表名 / 列名只来自 LcpTableSpec（生成期写死），绝不来自请求；
 * 2. 所有值走命名参数，不拼字符串；
 * 3. 排序键必须在 spec.sortableColumns() 白名单里，否则 400。
 *
 * 语义约定：
 * - 写入（create / update）是**整体替换**：更新时 JSONB 文档整份重写，没给的键就是 null；
 * - immutable 字段在 update 时被忽略（不是报错），与「创建后不可改」的语义一致；
 * - 软删除实体的读 / 改 / 删默认只作用于未删除行；includeDeleted 仅影响列表查询。
 */
public final class LcpCrudRuntime {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final int MAX_PAGE_SIZE = ${MAX_PAGE_SIZE};

  private final NamedParameterJdbcTemplate jdbc;
  private final LcpPrincipal principal;
  private final LcpFieldPolicy policy;

  public LcpCrudRuntime(NamedParameterJdbcTemplate jdbc, LcpPrincipal principal, LcpFieldPolicy policy) {
    this.jdbc = jdbc;
    this.principal = principal;
    this.policy = policy;
  }

  // ---------------------------------------------------------------- 读

  public LcpPageResult<Map<String, Object>> page(LcpTableSpec spec, LcpPageQuery query, List<LcpFilter> filters) {
    int page = Math.max(1, query.page());
    int size = Math.min(MAX_PAGE_SIZE, Math.max(1, query.size()));
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> where = new ArrayList<>();
    applyScope(spec, query.includeDeleted(), params, where);
    applySearch(spec, query.q(), params, where);
    applyFilters(spec, filters, params, where);
    String whereSql = where.isEmpty() ? "" : " where " + String.join(" and ", where);
    Long total = jdbc.queryForObject("select count(*) from " + q(spec.table()) + whereSql, params, Long.class);
    params.addValue("_limit", size);
    params.addValue("_offset", (long) (page - 1) * size);
    String sql = "select * from " + q(spec.table()) + whereSql + orderBy(spec, query)
        + " limit :_limit offset :_offset";
    List<Map<String, Object>> rows = jdbc.queryForList(sql, params);
    List<Map<String, Object>> items = new ArrayList<>(rows.size());
    for (Map<String, Object> row : rows) {
      items.add(project(spec, row));
    }
    return new LcpPageResult<>(items, total == null ? 0L : total, page, size);
  }

  public Map<String, Object> get(LcpTableSpec spec, String id) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> where = new ArrayList<>();
    where.add(q(spec.primaryKey()) + " = :_id");
    params.addValue("_id", id);
    applyScope(spec, false, params, where);
    List<Map<String, Object>> rows = jdbc.queryForList(
        "select * from " + q(spec.table()) + " where " + String.join(" and ", where), params);
    if (rows.isEmpty()) {
      throw LcpApiException.notFound(spec.entityKey() + " " + id + " 不存在");
    }
    return project(spec, rows.get(0));
  }

  // ---------------------------------------------------------------- 写

  public Map<String, Object> create(LcpTableSpec spec, Map<String, Object> values) {
    WriteSet split = split(spec, values, false);
    String id = LcpIds.next(spec.idType());
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> names = new ArrayList<>();
    List<String> marks = new ArrayList<>();

    names.add(q(spec.primaryKey()));
    marks.add(":_id");
    params.addValue("_id", id);

    for (Map.Entry<String, Object> entry : split.stored().entrySet()) {
      names.add(q(entry.getKey()));
      marks.add(":_v_" + entry.getKey());
      params.addValue("_v_" + entry.getKey(), entry.getValue());
    }
    if (spec.jsonb() != null) {
      names.add(q(spec.jsonb()));
      marks.add("cast(:_doc as jsonb)");
      params.addValue("_doc", toJson(document(spec, split)));
    }
    if (spec.tenant() != null) {
      names.add(q(spec.tenant()));
      marks.add(":_tenant");
      params.addValue("_tenant", tenantId());
    }
    String actor = actorId();
    if (spec.createdAt() != null) {
      names.add(q(spec.createdAt()));
      marks.add("now()");
    }
    if (spec.updatedAt() != null) {
      names.add(q(spec.updatedAt()));
      marks.add("now()");
    }
    if (spec.createdBy() != null) {
      names.add(q(spec.createdBy()));
      marks.add(":_actor");
      params.addValue("_actor", actor);
    }
    if (spec.updatedBy() != null) {
      names.add(q(spec.updatedBy()));
      marks.add(":_actor");
      params.addValue("_actor", actor);
    }
    if (spec.softDeleteColumn() != null) {
      names.add(q(spec.softDeleteColumn()));
      marks.add("null");
    }
    if (spec.versionColumn() != null) {
      names.add(q(spec.versionColumn()));
      marks.add("0");
    }

    String sql = "insert into " + q(spec.table()) + " (" + String.join(", ", names) + ")"
        + " values (" + String.join(", ", marks) + ")";
    try {
      jdbc.update(sql, params);
    } catch (DuplicateKeyException ex) {
      throw LcpApiException.conflict("唯一约束冲突：" + ex.getMostSpecificCause().getMessage());
    }
    return get(spec, id);
  }

  public Map<String, Object> update(LcpTableSpec spec, String id, Map<String, Object> values, Integer version) {
    WriteSet split = split(spec, values, true);
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> sets = new ArrayList<>();

    for (Map.Entry<String, Object> entry : split.stored().entrySet()) {
      sets.add(q(entry.getKey()) + " = :_v_" + entry.getKey());
      params.addValue("_v_" + entry.getKey(), entry.getValue());
    }
    if (spec.jsonb() != null) {
      sets.add(q(spec.jsonb()) + " = cast(:_doc as jsonb)");
      params.addValue("_doc", toJson(document(spec, split)));
    }
    if (spec.updatedAt() != null) {
      sets.add(q(spec.updatedAt()) + " = now()");
    }
    if (spec.updatedBy() != null) {
      sets.add(q(spec.updatedBy()) + " = :_actor");
      params.addValue("_actor", actorId());
    }
    if (spec.versionColumn() != null) {
      if (version == null) {
        throw LcpApiException.versionRequired("更新 " + spec.entityKey() + " 必须带 version（乐观锁）");
      }
      sets.add(q(spec.versionColumn()) + " = " + q(spec.versionColumn()) + " + 1");
    }
    if (sets.isEmpty()) {
      throw LcpApiException.badRequest("没有可更新的字段");
    }

    List<String> where = new ArrayList<>();
    where.add(q(spec.primaryKey()) + " = :_id");
    params.addValue("_id", id);
    applyScope(spec, false, params, where);
    if (spec.versionColumn() != null) {
      where.add(q(spec.versionColumn()) + " = :_version");
      params.addValue("_version", version);
    }

    String sql = "update " + q(spec.table()) + " set " + String.join(", ", sets)
        + " where " + String.join(" and ", where);
    if (jdbc.update(sql, params) == 0) {
      throw triage(spec, id, version);
    }
    return get(spec, id);
  }

  public void delete(LcpTableSpec spec, String id) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> where = new ArrayList<>();
    where.add(q(spec.primaryKey()) + " = :_id");
    params.addValue("_id", id);
    applyScope(spec, false, params, where);

    String sql;
    if (spec.softDeleteColumn() != null) {
      List<String> sets = new ArrayList<>();
      sets.add(q(spec.softDeleteColumn()) + " = now()");
      if (spec.updatedAt() != null) {
        sets.add(q(spec.updatedAt()) + " = now()");
      }
      if (spec.updatedBy() != null) {
        sets.add(q(spec.updatedBy()) + " = :_actor");
        params.addValue("_actor", actorId());
      }
      sql = "update " + q(spec.table()) + " set " + String.join(", ", sets)
          + " where " + String.join(" and ", where);
    } else {
      sql = "delete from " + q(spec.table()) + " where " + String.join(" and ", where);
    }
    if (jdbc.update(sql, params) == 0) {
      throw LcpApiException.notFound(spec.entityKey() + " " + id + " 不存在或已删除");
    }
  }

  // ---------------------------------------------------------------- 条件

  private void applyScope(LcpTableSpec spec, boolean includeDeleted, MapSqlParameterSource params, List<String> where) {
    if (spec.tenant() != null) {
      where.add(q(spec.tenant()) + " = :_tenant");
      params.addValue("_tenant", tenantId());
    }
    if (spec.softDeleteColumn() != null && !includeDeleted) {
      where.add(q(spec.softDeleteColumn()) + " is null");
    }
  }

  private void applySearch(LcpTableSpec spec, String term, MapSqlParameterSource params, List<String> where) {
    if (term == null || term.isBlank()) {
      return;
    }
    List<String> columns = spec.searchColumns();
    if (columns.isEmpty()) {
      return;
    }
    params.addValue("_q", "%" + term.trim() + "%");
    List<String> parts = new ArrayList<>();
    for (String column : columns) {
      parts.add(q(column) + " ilike :_q");
    }
    where.add("(" + String.join(" or ", parts) + ")");
  }

  private void applyFilters(LcpTableSpec spec, List<LcpFilter> filters, MapSqlParameterSource params, List<String> where) {
    if (filters == null) {
      return;
    }
    int index = 0;
    for (LcpFilter filter : filters) {
      if (filter.value() == null) {
        continue;
      }
      LcpColumn column = spec.column(filter.column());
      if (column == null || column.jsonb()) {
        throw LcpApiException.badRequest("不支持的筛选字段：" + filter.column());
      }
      Object value = filter.value();
      if (filter.op() == LcpFilter.Op.ILIKE) {
        value = "%" + value + "%";
      }
      String name = "_f" + index;
      index += 1;
      params.addValue(name, value);
      where.add(q(column.key()) + " " + filter.op().sql() + " :" + name);
    }
  }

  private String orderBy(LcpTableSpec spec, LcpPageQuery query) {
    String direction = "asc".equalsIgnoreCase(query.order()) ? "asc" : "desc";
    String sort = query.sort();
    if (sort == null || sort.isBlank()) {
      return " order by " + q(spec.primaryKey()) + " " + direction;
    }
    if (!spec.sortableColumns().contains(sort)) {
      throw LcpApiException.badRequest("不支持的排序字段：" + sort);
    }
    return " order by " + q(sort) + " " + direction + ", " + q(spec.primaryKey()) + " " + direction;
  }

  // ---------------------------------------------------------------- 投影与转换

  /** 把库行投影成接口形态：业务字段按 Schema 顺序 + JSONB 展平 + 平台列。 */
  private Map<String, Object> project(LcpTableSpec spec, Map<String, Object> row) {
    Map<String, Object> ext = jsonMap(spec.jsonb() == null ? null : row.get(spec.jsonb()));
    Map<String, Object> out = new LinkedHashMap<>();
    for (LcpColumn column : spec.columns()) {
      if (column.sensitive() && !policy.canRead(column.key())) {
        continue;
      }
      out.put(column.key(), column.jsonb() ? ext.get(column.key()) : row.get(column.key()));
    }
    putIfPresent(out, row, spec.tenant());
    putIfPresent(out, row, spec.createdAt());
    putIfPresent(out, row, spec.updatedAt());
    putIfPresent(out, row, spec.createdBy());
    putIfPresent(out, row, spec.updatedBy());
    putIfPresent(out, row, spec.softDeleteColumn());
    putIfPresent(out, row, spec.versionColumn());
    return out;
  }

  private static void putIfPresent(Map<String, Object> out, Map<String, Object> row, String column) {
    if (column != null && row.containsKey(column)) {
      out.put(column, row.get(column));
    }
  }

  /** 写集合：列存字段进 SET，JSONB 字段进文档。 */
  private static WriteSet split(LcpTableSpec spec, Map<String, Object> values, boolean update) {
    Map<String, Object> stored = new LinkedHashMap<>();
    Map<String, Object> document = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : values.entrySet()) {
      LcpColumn column = spec.column(entry.getKey());
      if (column == null) {
        throw LcpApiException.badRequest("未知字段：" + entry.getKey());
      }
      if (column.key().equals(spec.primaryKey())) {
        continue;
      }
      if (update && column.immutable()) {
        continue;
      }
      if (column.jsonb()) {
        document.put(column.key(), entry.getValue());
      } else {
        stored.put(column.key(), entry.getValue());
      }
    }
    return new WriteSet(stored, document);
  }

  /** 整体替换语义：文档里必须带全所有 JSONB 字段，没给的就是 null。 */
  private static Map<String, Object> document(LcpTableSpec spec, WriteSet split) {
    Map<String, Object> document = new LinkedHashMap<>();
    for (LcpColumn column : spec.documents()) {
      document.put(column.key(), split.document().get(column.key()));
    }
    return document;
  }

  private static Map<String, Object> jsonMap(Object raw) {
    if (raw == null) {
      return Map.of();
    }
    String text = String.valueOf(raw);
    if (text.isBlank() || "null".equals(text)) {
      return Map.of();
    }
    try {
      return JSON.readValue(text, new TypeReference<Map<String, Object>>() {
      });
    } catch (Exception ex) {
      throw new IllegalStateException("JSONB 列内容不是对象：" + text, ex);
    }
  }

  private static String toJson(Map<String, Object> document) {
    try {
      return JSON.writeValueAsString(document);
    } catch (Exception ex) {
      throw new IllegalStateException("JSONB 序列化失败", ex);
    }
  }

  private LcpApiException triage(LcpTableSpec spec, String id, Integer version) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> where = new ArrayList<>();
    where.add(q(spec.primaryKey()) + " = :_id");
    params.addValue("_id", id);
    applyScope(spec, true, params, where);
    Long exists = jdbc.queryForObject(
        "select count(*) from " + q(spec.table()) + " where " + String.join(" and ", where), params, Long.class);
    if (exists == null || exists == 0L) {
      return LcpApiException.notFound(spec.entityKey() + " " + id + " 不存在");
    }
    return LcpApiException.versionConflict(
        "版本不一致：" + spec.entityKey() + " " + id + " 已被他人修改，请刷新后重试（提交 version=" + version + "）");
  }

  // ---------------------------------------------------------------- 主体与标识符

  private String tenantId() {
    String tenant = principal == null ? null : principal.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw LcpApiException.principalMissing("LcpPrincipal.tenantId() 为空：租户必须由平台上下文提供");
    }
    return tenant;
  }

  private String actorId() {
    return principal == null ? null : principal.userId();
  }

  /** 标识符一律带引号并且只允许小写字母 / 数字 / 下划线，防御性再校验一次。 */
  private static String q(String ident) {
    if (ident == null || !ident.matches("[a-z_][a-z0-9_]*")) {
      throw new IllegalStateException("非法标识符：" + ident);
    }
    return "\\"" + ident + "\\"";
  }

  private record WriteSet(Map<String, Object> stored, Map<String, Object> document) {
  }
}
`;
  return new Map([[`${dir}/LcpCrudRuntime.java`, `package ${pkg};\n\n${body.trim()}\n`]]);
}

// ============================================================ 表元数据
const constNameOf = (key) => String(key).toUpperCase().replace(/[^A-Z0-9]+/g, "_");

function platformOf(plan) {
  const entity = plan.entity;
  const soft = softDeleteOf(entity);
  const stamps = timestampsOf(entity);
  const hasJsonb = jsonbItemsOf(plan).length > 0;
  return {
    primaryKey: primaryKeyOf(entity),
    tenant: tenantColumnOf(entity),
    jsonb: hasJsonb ? jsonbColumnOf(entity) : null,
    softDelete: soft ? soft.column : null,
    version: entity.storage?.optimisticLock ? "version" : null,
    createdAt: stamps ? stamps.createdAt ?? "created_at" : null,
    updatedAt: stamps ? stamps.updatedAt ?? "updated_at" : null,
    createdBy: stamps ? stamps.createdBy ?? "created_by" : null,
    updatedBy: stamps ? stamps.updatedBy ?? "updated_by" : null
  };
}

const nullableJ = (value) => (value === null || value === undefined ? "null" : J(value));

function renderTables(appPkg, appKey, plans) {
  const pkg = javaPkgOf(appPkg, "table");
  const dir = javaDirOf(appPkg, "table");
  const cls = `${pascal(appKey)}Tables`;
  const lines = [];
  lines.push(`package ${pkg};`);
  lines.push("");
  lines.push(`import ${javaPkgOf(appPkg, "support")}.LcpColumn;`);
  lines.push(`import ${javaPkgOf(appPkg, "support")}.LcpTableSpec;`);
  lines.push("import java.util.List;");
  lines.push("");
  lines.push("/**");
  lines.push(" * 运行期表元数据。列名、平台列、可搜索 / 可排序 / 敏感字段全部从 Schema 编译而来，");
  lines.push(" * 与 sql/ 下的 DDL、ts/entities.ts 同源 —— 改 Schema 后重跑生成器，不要手改本文件。");
  lines.push(" */");
  lines.push(`public final class ${cls} {`);
  lines.push("");
  lines.push(`  private ${cls}() {`);
  lines.push("  }");

  const usedNames = new Map();
  for (const plan of plans) {
    let name = constNameOf(plan.entity.key);
    if (usedNames.has(name)) {
      const alt = `${name}_${usedNames.get(name) + 1}`;
      warn(`${appKey}.${plan.entity.key}`, `常量名 ${name} 与实体 ${usedNames.get(name)} 冲突，改用 ${alt}`);
      name = alt;
      usedNames.set(constNameOf(plan.entity.key), usedNames.get(constNameOf(plan.entity.key)) + 1);
    } else {
      usedNames.set(name, 1);
    }
    const p = platformOf(plan);
    lines.push("");
    lines.push(`  /** ${oneLine(textOf(plan.entity.name) || plan.entity.key)} · ${plan.table} · ${pathOf(appKey, plan.entity.key)} */`);
    lines.push(`  public static final LcpTableSpec ${name} = new LcpTableSpec(`);
    lines.push(`      ${J(plan.entity.key)},`);
    lines.push(`      ${J(plan.table)},`);
    lines.push(`      ${J(pathOf(appKey, plan.entity.key))},`);
    lines.push(`      ${J(plan.entity.storage?.idType ?? "ulid")},`);
    lines.push("      new LcpTableSpec.PlatformColumns(");
    lines.push(`          ${nullableJ(p.primaryKey)}, ${nullableJ(p.tenant)}, ${nullableJ(p.jsonb)}, ${nullableJ(p.softDelete)}, ${nullableJ(p.version)},`);
    lines.push(`          ${nullableJ(p.createdAt)}, ${nullableJ(p.updatedAt)}, ${nullableJ(p.createdBy)}, ${nullableJ(p.updatedBy)}),`);
    lines.push("      List.of(");
    const cols = businessItems(plan);
    if (cols.length === 0) {
      bad(`${appKey}.${plan.entity.key}`, "实体没有任何字段，无法生成 DDL");
    }
    if (creatableItemsOf(plan).length === 0) {
      bad(`${appKey}.${plan.entity.key}`, "实体没有可写字段（只有主键），无法生成 CRUD");
    }
    cols.forEach((item, index) => {
      const comma = index === cols.length - 1 ? "" : ",";
      lines.push(`          LcpColumn.of(${J(item.name)}, ${J(item.field?.type ?? "string")}, ${J(flagsOf(item))})${comma}`);
    });
    lines.push("      ));");
    STAT.entities += 1;
  }
  lines.push("}");
  lines.push("");
  return new Map([[`${dir}/${cls}.java`, lines.join("\n")]]);
}

// ============================================================ DTO
function recordFile(pkg, imports, name, doc, body) {
  const lines = [];
  lines.push(`package ${pkg};`);
  if (imports.size > 0) {
    lines.push("");
    for (const imp of [...imports].sort()) lines.push(`import ${imp};`);
  }
  lines.push("");
  lines.push("/**");
  for (const line of doc) lines.push(` * ${line}`);
  lines.push(" */");
  lines.push(`public record ${name}(`);
  lines.push(body);
  lines.push(") {");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function renderQuery(appPkg, appKey, plan) {
  const pkg = javaPkgOf(appPkg, "dto");
  const imports = new Set([
    `${javaPkgOf(appPkg, "support")}.LcpFilter`,
    `${javaPkgOf(appPkg, "support")}.LcpPageQuery`,
    "java.util.ArrayList",
    "java.util.List"
  ]);
  const fields = [
    "    /** 页码，从 1 开始 */",
    "    int page,",
    "    /** 每页条数，上限 " + MAX_PAGE_SIZE + " */",
    "    int size,",
    "    /** 排序字段，必须在 sortable 白名单内 */",
    "    String sort,",
    "    /** asc / desc */",
    "    String order,",
    "    /** 全局搜索词，命中 searchable 列 */",
    "    String q,",
    "    /** 是否包含已软删除的行（需要平台侧授权） */",
    "    boolean includeDeleted,"
  ];
  const filters = filtersOf(plan);
  for (const f of filters) {
    for (const imp of f.item.javaImports ?? []) imports.add(imp);
    const label = oneLine(textOf(f.item.field?.label) || f.item.name);
    const suffix = f.mode === "eq" ? "等值筛选" : f.name.endsWith("_from") ? "区间下限" : "区间上限";
    fields.push(`    /** ${label} · ${suffix} */`);
    fields.push(`    ${f.item.javaType} ${f.java},`);
    STAT.filters += 1;
  }
  const methods = [];
  methods.push("  /** 公共分页参数。 */");
  methods.push("  public LcpPageQuery toPageQuery() {");
  methods.push("    return new LcpPageQuery(page, size, sort, order, q, includeDeleted);");
  methods.push("  }");
  methods.push("");
  methods.push("  /** 类型化筛选 → runtime 的白名单过滤条件。列名写死在这里，前端只传值。 */");
  methods.push("  public List<LcpFilter> toFilters() {");
  methods.push("    List<LcpFilter> filters = new ArrayList<>();");
  for (const f of filters) {
    const op = f.mode === "eq" ? "eq" : f.name.endsWith("_from") ? "gte" : "lte";
    methods.push(`    if (${f.java} != null) {`);
    methods.push(`      filters.add(LcpFilter.${op}(${J(f.item.name)}, ${f.java}));`);
    methods.push("    }");
  }
  methods.push("    return filters;");
  methods.push("  }");

  const doc = [
    `${plan.entity.key} 的列表查询条件。`,
    "page / size / sort / order / q / includeDeleted 是公共部分；其余由 dataSchema 推出：",
    "列存的 enum / ref / boolean 出等值过滤，date / datetime / integer / decimal 出区间过滤。",
    "toFilters() 里的列名是生成期写死的白名单 —— 请求只能决定值。"
  ];
  const out = [];
  out.push(`package ${pkg};`);
  if (imports.size > 0) {
    out.push("");
    for (const imp of [...imports].sort()) out.push(`import ${imp};`);
  }
  out.push("");
  out.push("/**");
  for (const line of doc) out.push(` * ${line}`);
  out.push(" */");
  out.push(`public record ${plan.className}Query(`);
  out.push(fields.join("\n").replace(/,\s*$/, ""));
  out.push(") {");
  out.push("");
  out.push(methods.join("\n"));
  out.push("}");
  out.push("");
  return new Map([[`${javaDirOf(appPkg, "dto")}/${plan.className}Query.java`, out.join("\n")]]);
}
function renderCreateRequest(appPkg, plan) {
  const pkg = javaPkgOf(appPkg, "dto");
  const imports = new Set();
  const items = creatableItemsOf(plan);
  const body = renderDtoFields(plan, items, imports, `${plan.entity.key}.create`).replace(/,\s*$/, "");
  const doc = [
    `${plan.entity.key} 的创建请求体。`,
    "只含业务字段：主键由平台生成，租户 / 时间戳 / 操作人 / 版本 / 删除标记一律由服务端注入。",
    "required 映射为 @NotNull；validators 能映射的映射为 Bean Validation，不能映射的见生成告警。"
  ];
  return new Map([[`${javaDirOf(appPkg, "dto")}/${plan.className}CreateRequest.java`, recordFile(pkg, imports, `${plan.className}CreateRequest`, doc, body)]]);
}

function renderUpdateRequest(appPkg, plan) {
  const pkg = javaPkgOf(appPkg, "dto");
  const imports = new Set();
  const items = updatableItemsOf(plan);
  const parts = [];
  const fields = renderDtoFields(plan, items, imports, `${plan.entity.key}.update`);
  if (fields) parts.push(fields);
  if (plan.entity.storage?.optimisticLock) {
    parts.push("    /** 乐观锁版本，从上次读取的实体里原样带回；不带则返回 428 */\n    Integer version,");
    STAT.dtoFields += 1;
  }
  const body = parts.join("\n").replace(/,\s*$/, "");
  const doc = [
    `${plan.entity.key} 的更新请求体（PUT = 整体替换）。`,
    "immutable 字段不在其中：服务端会忽略对它们的修改。",
    plan.entity.storage?.optimisticLock ? "带 version，更新时以 version 作并发条件。" : "本实体未开启乐观锁，不带 version。"
  ];
  return new Map([[`${javaDirOf(appPkg, "dto")}/${plan.className}UpdateRequest.java`, recordFile(pkg, imports, `${plan.className}UpdateRequest`, doc, body)]]);
}

// ============================================================ Controller
function renderController(appPkg, appKey, plan, plans) {
  const pkg = javaPkgOf(appPkg, "crud");
  const dir = javaDirOf(appPkg, "crud");
  const tablesCls = `${pascal(appKey)}Tables`;
  const specConst = `${tablesCls}.${constNameOf(plan.entity.key)}`;
  const imports = new Set([
    `${javaPkgOf(appPkg, "dto")}.${plan.className}CreateRequest`,
    `${javaPkgOf(appPkg, "dto")}.${plan.className}Query`,
    `${javaPkgOf(appPkg, "dto")}.${plan.className}UpdateRequest`,
    `${javaPkgOf(appPkg, "support")}.LcpCrudRuntime`,
    `${javaPkgOf(appPkg, "support")}.LcpFieldPolicy`,
    `${javaPkgOf(appPkg, "support")}.LcpPageResult`,
    `${javaPkgOf(appPkg, "support")}.LcpPrincipal`,
    `${javaPkgOf(appPkg, "table")}.${tablesCls}`,
    "jakarta.validation.Valid",
    "java.net.URI",
    "java.util.LinkedHashMap",
    "java.util.Map",
    "org.springframework.http.HttpStatus",
    "org.springframework.http.ResponseEntity",
    "org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate",
    "org.springframework.web.bind.annotation.DeleteMapping",
    "org.springframework.web.bind.annotation.GetMapping",
    "org.springframework.web.bind.annotation.PathVariable",
    "org.springframework.web.bind.annotation.PostMapping",
    "org.springframework.web.bind.annotation.PutMapping",
    "org.springframework.web.bind.annotation.RequestBody",
    "org.springframework.web.bind.annotation.RequestMapping",
    "org.springframework.web.bind.annotation.RequestParam",
    "org.springframework.web.bind.annotation.ResponseStatus",
    "org.springframework.web.bind.annotation.RestController"
  ]);

  const filters = filtersOf(plan);
  for (const f of filters) {
    for (const imp of f.item.javaImports ?? []) imports.add(imp);
    if (f.item.javaType === "LocalDate" || f.item.javaType === "OffsetDateTime") {
      imports.add("org.springframework.format.annotation.DateTimeFormat");
    }
  }

  const lines = [];
  lines.push(`package ${pkg};`);
  lines.push("");
  for (const imp of [...imports].sort()) lines.push(`import ${imp};`);
  lines.push("");
  lines.push("/**");
  lines.push(` * ${plan.entity.key} 的 CRUD 路由。HTTP 绑定在这里，SQL 与业务语义全在 LcpCrudRuntime。`);
  lines.push(" * 租户与操作人来自 LcpPrincipal，请求体里带了也不采信。");
  lines.push(" */");
  lines.push("@RestController");
  lines.push(`@RequestMapping(${J(pathOf(appKey, plan.entity.key))})`);
  lines.push(`public class ${plan.className}Controller {`);
  lines.push("");
  lines.push("  private final LcpCrudRuntime runtime;");
  lines.push("");
  lines.push(`  public ${plan.className}Controller(NamedParameterJdbcTemplate jdbc, LcpPrincipal principal) {`);
  lines.push("    this.runtime = new LcpCrudRuntime(jdbc, principal,");
  lines.push(`        LcpFieldPolicy.denySensitive(${specConst}.sensitiveColumns()));`);
  lines.push("  }");

  const pageParams = [
    "      @RequestParam(name = \"page\", defaultValue = \"1\") int page",
    "      @RequestParam(name = \"size\", defaultValue = \"20\") int size",
    "      @RequestParam(name = \"sort\", required = false) String sort",
    "      @RequestParam(name = \"order\", defaultValue = \"desc\") String order",
    "      @RequestParam(name = \"q\", required = false) String q",
    "      @RequestParam(name = \"include_deleted\", defaultValue = \"false\") boolean includeDeleted"
  ];
  const ctorArgs = ["page", "size", "sort", "order", "q", "includeDeleted"];
  for (const f of filters) {
    let ann = `@RequestParam(name = ${J(f.name)}, required = false)`;
    if (f.item.javaType === "LocalDate") ann += " @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)";
    if (f.item.javaType === "OffsetDateTime") ann += " @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)";
    pageParams.push(`      ${ann} ${f.item.javaType} ${f.java}`);
    ctorArgs.push(f.java);
  }

  lines.push("");
  lines.push("  /** 分页查询。q 走 searchable 列，其余筛选条件见 Query 记录。 */");
  lines.push("  @GetMapping");
  lines.push("  public LcpPageResult<Map<String, Object>> page(");
  lines.push(pageParams.join(",\n"));
  lines.push("  ) {");
  lines.push(`    ${plan.className}Query query = new ${plan.className}Query(${ctorArgs.join(", ")});`);
  lines.push(`    return runtime.page(${specConst}, query.toPageQuery(), query.toFilters());`);
  lines.push("  }");
  lines.push("");
  lines.push("  /** 按主键取一行；不存在返回 404。 */");
  lines.push("  @GetMapping(\"/{id}\")");
  lines.push("  public Map<String, Object> get(@PathVariable(\"id\") String id) {");
  lines.push(`    return runtime.get(${specConst}, id);`);
  lines.push("  }");
  lines.push("");
  lines.push("  /** 创建。主键由平台生成，返回 201 + Location。 */");
  lines.push("  @PostMapping");
  lines.push(`  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody ${plan.className}CreateRequest body) {`);
  lines.push("    Map<String, Object> values = new LinkedHashMap<>();");
  for (const item of creatableItemsOf(plan)) {
    lines.push(`    values.put(${J(item.name)}, body.${camel(item.name)}());`);
  }
  lines.push(`    Map<String, Object> created = runtime.create(${specConst}, values);`);
  lines.push(`    String id = String.valueOf(created.get(${J(primaryKeyOf(plan.entity))}));`);
  lines.push(`    return ResponseEntity.created(URI.create(${specConst}.path() + "/" + id)).body(created);`);
  lines.push("  }");
  lines.push("");
  lines.push("  /** 更新（整体替换）。immutable 字段被忽略。 */");
  lines.push("  @PutMapping(\"/{id}\")");
  lines.push(`  public Map<String, Object> update(@PathVariable("id") String id, @Valid @RequestBody ${plan.className}UpdateRequest body) {`);
  lines.push("    Map<String, Object> values = new LinkedHashMap<>();");
  for (const item of updatableItemsOf(plan)) {
    lines.push(`    values.put(${J(item.name)}, body.${camel(item.name)}());`);
  }
  const versionArg = plan.entity.storage?.optimisticLock ? "body.version()" : "null";
  lines.push(`    return runtime.update(${specConst}, id, values, ${versionArg});`);
  lines.push("  }");
  lines.push("");
  lines.push("  /** 删除。开启软删除时是置 deleted_at，否则物理删除。 */");
  lines.push("  @DeleteMapping(\"/{id}\")");
  lines.push("  @ResponseStatus(HttpStatus.NO_CONTENT)");
  lines.push("  public void delete(@PathVariable(\"id\") String id) {");
  lines.push(`    runtime.delete(${specConst}, id);`);
  lines.push("  }");
  lines.push("}");
  lines.push("");
  STAT.routes += 5;
  return new Map([[`${dir}/${plan.className}Controller.java`, lines.join("\n")]]);
}

// ============================================================ TypeScript 客户端
function renderTsClient(appKey, plans) {
  const lines = [];
  lines.push("/**");
  lines.push(" * 本文件由 tools/gen-api.mjs 生成，勿手改。");
  lines.push(` * 应用 ${appKey} · 与 java/ 下的 Controller 一一对应：路由、查询参数、请求体字段全部同源。`);
  lines.push(" *");
  lines.push(" * 返回类型直接用 ts/entities.ts 的行类型：服务端投影的键就是 Schema 的字段 key（snake_case），");
  lines.push(" * 所以这里不需要再做一层字段名映射。");
  lines.push(" */");
  const typeNames = uniq(plans.map((plan) => plan.className));
  lines.push(`import type { ${typeNames.join(", ")} } from "../../ts/entities";`);
  lines.push("");
  lines.push("/** 分页结果。pages 由服务端算好。 */");
  lines.push("export interface PageResult<T> {");
  lines.push("  items: T[];");
  lines.push("  total: number;");
  lines.push("  page: number;");
  lines.push("  size: number;");
  lines.push("  pages: number;");
  lines.push("}");
  lines.push("");
  lines.push("/** 只依赖这一个接口：axios / fetch / uni.request 都能在上面加 10 行适配。 */");
  lines.push("export interface HttpClient {");
  lines.push("  request<T>(config: {");
  lines.push("    url: string;");
  lines.push('    method: "GET" | "POST" | "PUT" | "DELETE";');
  lines.push("    data?: unknown;");
  lines.push("    signal?: AbortSignal;");
  lines.push("  }): Promise<T>;");
  lines.push("}");
  lines.push("");
  lines.push("export interface RequestOptions {");
  lines.push("  signal?: AbortSignal;");
  lines.push("}");
  lines.push("");
  lines.push("/** 默认挂在同域 BFF 下；跨域部署时给 createApi 传 baseUrl。 */");
  lines.push(`export const DEFAULT_BASE_URL = "/api/${API_VERSION}";`);
  lines.push("");
  lines.push("/** 跳过 undefined / null / 空串 —— 空筛选条件不该出现在 URL 里。 */");
  lines.push("function queryString(params: Record<string, unknown> | undefined): string {");
  lines.push("  if (!params) return \"\";");
  lines.push("  const search = new URLSearchParams();");
  lines.push("  for (const [key, value] of Object.entries(params)) {");
  lines.push("    if (value === undefined || value === null || value === \"\") continue;");
  lines.push("    search.append(key, String(value));");
  lines.push("  }");
  lines.push("  const text = search.toString();");
  lines.push("  return text ? `?${text}` : \"\";");
  lines.push("}");
  lines.push("");

  for (const plan of plans) {
    const sortable = sortableItemsOf(plan);
    const filters = filtersOf(plan);
    lines.push(`/** ${oneLine(textOf(plan.entity.name) || plan.entity.key)} · ${pathOf(appKey, plan.entity.key)} */`);
    lines.push(`export interface ${plan.className}Query {`);
    lines.push("  page?: number;");
    lines.push("  size?: number;");
    if (sortable.length > 0) {
      lines.push(`  sort?: ${sortable.map((item) => JSON.stringify(item.name)).join(" | ")};`);
    } else {
      lines.push("  sort?: never;");
    }
    lines.push('  order?: "asc" | "desc";');
    lines.push("  q?: string;");
    lines.push("  include_deleted?: boolean;");
    for (const f of filters) {
      const wire = tsKey(f.name);
      lines.push(`  ${wire}?: ${plan.className}[${JSON.stringify(f.item.name)}];`);
    }
    lines.push("}");
    lines.push("");
    const createKeys = creatableItemsOf(plan).map((item) => JSON.stringify(item.name));
    lines.push(`export type ${plan.className}Create = ${createKeys.length ? `Pick<${plan.className}, ${createKeys.join(" | ")}>` : "Record<string, never>"};`);
    const updateKeys = updatableItemsOf(plan).map((item) => JSON.stringify(item.name));
    const versionBit = plan.entity.storage?.optimisticLock ? " & { version?: number }" : "";
    lines.push(`export type ${plan.className}Update = ${updateKeys.length ? `Pick<${plan.className}, ${updateKeys.join(" | ")}>` : "Record<string, never>"}${versionBit};`);
    lines.push("");
  }

  lines.push(`export interface ${pascal(appKey)}Api {`);
  for (const plan of plans) {
    const n = plan.className;
    lines.push(`  ${plan.entity.key}: {`);
    lines.push(`    list(query?: ${n}Query, options?: RequestOptions): Promise<PageResult<${n}>>;`);
    lines.push(`    get(id: string, options?: RequestOptions): Promise<${n}>;`);
    lines.push(`    create(body: ${n}Create, options?: RequestOptions): Promise<${n}>;`);
    lines.push(`    update(id: string, body: ${n}Update, options?: RequestOptions): Promise<${n}>;`);
    lines.push("    remove(id: string, options?: RequestOptions): Promise<void>;");
    lines.push("  };");
  }
  lines.push("}");
  lines.push("");
  lines.push(`export function create${pascal(appKey)}Api(http: HttpClient, baseUrl: string = DEFAULT_BASE_URL): ${pascal(appKey)}Api {`);
  lines.push(`  const base = (key: string) => \`\${baseUrl}/${appKey}/\${key}\`;`);
  lines.push("  const itemUrl = (key: string, id: string) => `${base(key)}/${encodeURIComponent(id)}`;");
  lines.push("  return {");
  for (const plan of plans) {
    const n = plan.className;
    const key = plan.entity.key;
    lines.push(`    ${key}: {`);
    lines.push(`      list: (query, options) =>`);
    lines.push(`        http.request<PageResult<${n}>>({ url: base(${JSON.stringify(key)}) + queryString(query as Record<string, unknown> | undefined), method: "GET", signal: options?.signal }),`);
    lines.push(`      get: (id, options) =>`);
    lines.push(`        http.request<${n}>({ url: itemUrl(${JSON.stringify(key)}, id), method: "GET", signal: options?.signal }),`);
    lines.push(`      create: (body, options) =>`);
    lines.push(`        http.request<${n}>({ url: base(${JSON.stringify(key)}), method: "POST", data: body, signal: options?.signal }),`);
    lines.push(`      update: (id, body, options) =>`);
    lines.push(`        http.request<${n}>({ url: itemUrl(${JSON.stringify(key)}, id), method: "PUT", data: body, signal: options?.signal }),`);
    lines.push(`      remove: (id, options) =>`);
    lines.push(`        http.request<void>({ url: itemUrl(${JSON.stringify(key)}, id), method: "DELETE", signal: options?.signal }),`);
    lines.push("    },");
  }
  lines.push("  };");
  lines.push("}");
  lines.push("");
  return new Map([["api/client/api.ts", lines.join("\n")]]);
}

// ============================================================ 权限清单
function renderPermissions(bundle) {
  const roles = bundle.artifacts?.roles ?? [];
  const permissions = bundle.artifacts?.permissions ?? [];
  const matrix = {};
  for (const grant of permissions) {
    if (grant.resourceType !== "entity") continue;
    const entity = matrix[grant.resource] ?? (matrix[grant.resource] = {});
    for (const action of grant.actions ?? []) {
      const roleList = entity[action] ?? (entity[action] = []);
      if (!roleList.includes(grant.roleKey)) roleList.push(grant.roleKey);
    }
  }
  for (const entity of Object.values(matrix)) {
    for (const action of Object.keys(entity)) entity[action].sort();
  }
  const sortedMatrix = {};
  for (const key of Object.keys(matrix).sort()) sortedMatrix[key] = matrix[key];
  const doc = {
    appKey: bundle.app?.key ?? null,
    protocolVersion: bundle.protocolVersion ?? null,
    generatedBy: "tools/gen-api.mjs",
    note: "服务端授权的事实来源。BFF 的鉴权层按 roles / permissions 判定动作与字段白名单；condition 是协议表达式，由 BFF 表达式引擎翻译成行级过滤，出码侧不解释。",
    roles,
    permissions,
    entities: sortedMatrix
  };
  return new Map([["api/permissions.json", JSON.stringify(doc, null, 2) + "\n"]]);
}

// ============================================================ README
function renderReadme(entry, files) {
  const appKey = entry.key;
  const appPkg = entry.appPkg;
  const pkgRoot = `dev.lcp.generated.${appPkg}.api`;
  const rows = [];
  for (const plan of entry.plans) {
    const path = pathOf(appKey, plan.entity.key);
    rows.push(`| \`${plan.entity.key}\` | \`${path}\` | ${oneLine(textOf(plan.entity.name) || plan.entity.key)} | ${plan.className}Controller |`);
  }
  const docs = [];
  docs.push(`# ${appKey} · BFF CRUD 接口`);
  docs.push("");
  docs.push("本目录由 `tools/gen-api.mjs` 生成，勿手改。它是 DataSchema 的**接口形态**，与 `../sql/`（物理形态）、");
  docs.push("`../ts/entities.ts`（行形态）同源；改 Schema 后重跑生成器。");
  docs.push("");
  docs.push("## 约定");
  docs.push("");
  docs.push("- 租户与操作人来自 `LcpPrincipal`（平台实现），请求体里带了 `tenant_id` / `created_by` 也不采信。");
  docs.push("- 所有值走命名参数；表名 / 列名只来自 `LcpTableSpec`；排序键必须在 `sortableColumns()` 白名单内。");
  docs.push("- `PUT` 是整体替换：JSONB 文档整份重写，没给的键就是 `null`；`immutable` 字段被忽略。");
  docs.push("- 开启乐观锁的表，`PUT` 必须带 `version`，否则 428；版本不匹配返回 409 `version_conflict`。");
  docs.push("- 开启软删除的表，`DELETE` 是置 `deleted_at`；读 / 改 / 删默认只看未删除行，列表可用 `include_deleted=true` 放宽（需平台授权）。");
  docs.push("- 读接口默认**不返回** sensitive 字段（`LcpFieldPolicy.denySensitive`）。接入平台后换成按 `permissions.json` 的 fields 白名单实现。");
  docs.push("");
  docs.push("## 路由");
  docs.push("");
  docs.push("| 实体 | 基址 | 名称 | Controller |");
  docs.push("| --- | --- | --- | --- |");
  docs.push(...rows);
  docs.push("");
  docs.push("每个实体 5 条路由：");
  docs.push("");
  docs.push("```");
  docs.push("GET    {base}            分页查询 → LcpPageResult");
  docs.push("GET    {base}/{id}       取一行");
  docs.push("POST   {base}            创建 → 201 + Location");
  docs.push("PUT    {base}/{id}       更新（整体替换）");
  docs.push("DELETE {base}/{id}       软删除 / 物理删除 → 204");
  docs.push("```");
  docs.push("");
  docs.push("## 错误码");
  docs.push("");
  docs.push("| code | HTTP | 含义 |");
  docs.push("| --- | --- | --- |");
  docs.push("| `not_found` | 404 | 行不存在或已软删除 |");
  docs.push("| `conflict` | 409 | 唯一约束冲突 |");
  docs.push("| `version_conflict` | 409 | 乐观锁版本不一致 |");
  docs.push("| `version_required` | 428 | 乐观锁表更新未带 version |");
  docs.push("| `bad_request` | 400 | 未知字段 / 不支持的排序或筛选字段 |");
  docs.push("| `validation_failed` | 400 | 请求体 Bean Validation 未通过（details 带字段级原因） |");
  docs.push("| `principal_missing` | 500 | 平台没注入租户 |");
  docs.push("");
  docs.push("## 接入清单");
  docs.push("");
  docs.push("1. 依赖：`spring-boot-starter-web`、`spring-boot-starter-jdbc`、`spring-boot-starter-validation`、`com.fasterxml.jackson.core:jackson-databind`。");
  docs.push(`2. 组件扫描要覆盖 \`${pkgRoot}\`（\`LcpExceptionHandler\` 是 \`@RestControllerAdvice\`）。`);
  docs.push("3. 提供一个 `NamedParameterJdbcTemplate`。");
  docs.push("4. 实现 `LcpPrincipal`（从会话 / JWT 取 `tenantId` 与 `userId`）。");
  docs.push("5. 数据库连接要设置 `lcp.tenant_id`（RLS 兜底），见 `../sql/90_rls.sql`。");
  docs.push("");
  docs.push("## 有意不做");
  docs.push("");
  docs.push("- **行级数据权限**：`permissions.json` 里的 `condition` 表达式由 BFF 表达式引擎翻译，出码侧不解释；本层只做租户隔离。");
  docs.push("- **字段脱敏实现**：只提供 `LcpFieldPolicy` 钩子与 sensitive 列清单，掩码规则属于平台。");
  docs.push("- **JSONB 字段筛选**：只对列存字段生成筛选条件；JSONB 的包含查询走 GIN 索引，属于平台查询引擎。");
  docs.push("- **formula 派生字段**：需要表达式运行时求值，当前 CRUD 投影不含。");
  docs.push("- **批量、导入导出、审批动作**：属于后续出码步骤，不在通用 CRUD 里硬塞。");
  docs.push("");
  docs.push("## 目录");
  docs.push("");
  docs.push("```");
  docs.push("api/");
  docs.push("  README.md");
  docs.push("  permissions.json                角色 / 权限清单（服务端授权的事实来源）");
  docs.push("  client/api.ts                   TS 客户端（依赖 ts/entities.ts 的行类型）");
  docs.push(`  src/main/java/${pkgRoot.replace(/\./g, "/")}/`);
  docs.push("    support/                      runtime 契约 + 通用 CRUD 内核");
  docs.push("    table/                        LcpTableSpec 常量（表名 / 列 / 平台列）");
  docs.push("    dto/                          Query / CreateRequest / UpdateRequest");
  docs.push("    crud/                         Controller（5 条路由 / 实体）");
  docs.push("```");
  docs.push("");
  docs.push("## 已知边界");
  docs.push("");
  docs.push("生成环境没有 JDK —— 这些 Java 源**没有编译过**。自检只覆盖结构性不变量（路由、参数覆盖、");
  docs.push("SQL 只在 runtime、排序白名单、平台列不进请求体……），不等于可编译。首次 `mvn -q compile` 前不要假定能过；");
  docs.push("报错请改生成器，不要改产物。");
  docs.push("");
  return docs.join("\n");
}

// ============================================================ 写盘
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

/** api/ 整个子树都归本生成器所有，不在本轮清单里的产物一律清掉。 */
function removeStale(apiDir, keep) {
  const removed = [];
  for (const existing of listFiles(apiDir)) {
    const rel = path.relative(apiDir, existing).replace(/\\/g, "/");
    if (keep.has(rel) || rel === MANIFEST_NAME) continue;
    if (!/\.(java|ts|json|md)$/.test(rel)) continue;
    fs.rmSync(existing, { force: true });
    removed.push(rel);
  }
  return removed;
}

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

function manifestText(rels, removed) {
  const lines = [
    MANIFEST_MARK + "。每行一个文件路径（相对 api/）。",
    "# 下一轮生成时，api/ 下不在本清单里的 .java/.ts/.json/.md 都会被删掉 —— 本目录归本生成器所有。",
    `# 文件数：${rels.length + 1}（含本清单）`
  ];
  for (const rel of rels) lines.push(rel);
  lines.push(MANIFEST_NAME);
  if (removed.length > 0) {
    lines.push("");
    lines.push(`# 本轮清理掉的过期产物 ${removed.length} 个：`);
    for (const rel of removed) lines.push("# - " + rel);
  }
  return lines.join("\n") + "\n";
}

function writeAll(results) {
  const summary = { apps: [] };
  for (const { entry, files } of results) {
    const apiDir = path.join(OUT_ROOT, entry.key, "api");
    const written = [...files.keys()]
      .sort()
      .map((rel) => ({ rel: rel.startsWith("api/") ? rel.slice(4) : rel, text: files.get(rel) }));
    const keep = new Set(written.map((item) => item.rel));
    const removed = fs.existsSync(apiDir) ? removeStale(apiDir, keep) : [];
    for (const item of written) {
      const target = path.join(apiDir, item.rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, item.text, "utf8");
    }
    fs.writeFileSync(path.join(apiDir, MANIFEST_NAME), manifestText(written.map((item) => item.rel), removed), "utf8");
    pruneEmptyDirs(apiDir);
    summary.apps.push({ key: entry.key, dir: apiDir, files: written.length + 1, removed });
  }
  return summary;
}

// ============================================================ 组装
function buildFiles(entry, bundle) {
  const appKey = entry.key;
  const appPkg = entry.appPkg;
  const files = new Map();
  for (const map of [supportFiles(appPkg), runtimeFile(appPkg), renderTables(appPkg, appKey, entry.plans)]) {
    for (const [rel, text] of map) files.set(rel, text);
  }
  for (const plan of entry.plans) {
    for (const map of [
      renderQuery(appPkg, appKey, plan),
      renderCreateRequest(appPkg, plan),
      renderUpdateRequest(appPkg, plan),
      renderController(appPkg, appKey, plan, entry.plans)
    ]) {
      for (const [rel, text] of map) files.set(rel, text);
    }
  }
  for (const [rel, text] of renderTsClient(appKey, entry.plans)) files.set(rel, text);
  for (const [rel, text] of renderPermissions(bundle)) files.set(rel, text);
  files.set("api/README.md", renderReadme(entry, files));
  return files;
}

function buildApi(bundle, source) {
  const before = PROBLEMS.length;
  const entry = renderApp(bundle, source);
  if (!entry) return null;
  const files = buildFiles(entry, bundle);
  return { entry, files, problems: PROBLEMS.slice(before) };
}

// ============================================================ 自检
function stripCommentsAndLiterals(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function countChar(text, ch) {
  let count = 0;
  for (const current of text) if (current === ch) count += 1;
  return count;
}

function selfCheckProducts(results) {
  /** 记录组件可能是最后一个（没有尾随逗号），两种形态都算命中（见 hasFieldLine） */
  const hasField = hasFieldLine;
  for (const { entry, files } of results) {
    const appKey = entry.key;
    const manifest = manifestText([...files.keys()].map((rel) => (rel.startsWith("api/") ? rel.slice(4) : rel)).sort(), []);
    if (manifest.includes("[object Object]")) bad(`${appKey}/api/GENERATED.txt`, "清单里出现 [object Object]");
    if (!manifest.includes("README.md")) bad(`${appKey}/api/GENERATED.txt`, "清单缺少 README.md");
    for (const [rel, text] of files) {
      const where = `${appKey}/${rel}`;
      if (rel.endsWith(".java") || rel.endsWith(".ts")) {
        const naked = stripCommentsAndLiterals(text);
        for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
          if (countChar(naked, open) !== countChar(naked, close)) {
            bad(where, `括号不配平：${open} ${countChar(naked, open)} 个 / ${close} ${countChar(naked, close)} 个`);
          }
        }
      }
      if (rel.endsWith(".java") && /,\s*\n\s*\)\s*\{/.test(text)) {
        bad(where, "Java 记录头里有尾随逗号（Java 不允许）");
      }
      if (text.includes("[object Object]")) bad(where, "产物里出现 [object Object]：模板插值写错了");
      if (text.includes("NaN")) bad(where, "产物里出现 NaN");
      if (rel.endsWith(".java") && text.includes("undefined")) bad(where, "Java 产物里出现 undefined");
      if (text.includes("\r")) bad(where, "产物含 CRLF，必须统一 LF");
      if (!text.endsWith("\n")) bad(where, "产物末尾缺换行");
    }

    for (const plan of entry.plans) {
      const entityKey = plan.entity.key;
      const controller = files.get(`api/src/main/java/${javaPkgOf(entry.appPkg, "crud").replace(/\./g, "/")}/${plan.className}Controller.java`);
      const createReq = files.get(`api/src/main/java/${javaPkgOf(entry.appPkg, "dto").replace(/\./g, "/")}/${plan.className}CreateRequest.java`);
      const updateReq = files.get(`api/src/main/java/${javaPkgOf(entry.appPkg, "dto").replace(/\./g, "/")}/${plan.className}UpdateRequest.java`);
      const where = `${appKey}.${entityKey}`;

      if (!controller || !createReq || !updateReq) {
        bad(where, "Controller 或请求体缺失");
        continue;
      }
      const mappings = (controller.match(/@(Get|Post|Put|Delete)Mapping/g) ?? []).length;
      if (mappings !== 5) bad(where, `Controller 路由注解 ${mappings} 个（应为 5：2 GET + POST + PUT + DELETE）`);
      if (!controller.includes(`@RequestMapping(${J(pathOf(appKey, entityKey))})`)) {
        bad(where, "Controller 的 @RequestMapping 与 spec 路径不一致");
      }
      if (!controller.includes(`${pascal(appKey)}Tables.${constNameOf(entityKey)}`)) {
        bad(where, "Controller 没有引用本实体的 LcpTableSpec 常量");
      }
      for (const item of creatableItemsOf(plan)) {
        if (!hasField(createReq, camel(item.name))) {
          bad(where, `CreateRequest 缺少字段 ${item.name}`);
        }
      }
      for (const item of updatableItemsOf(plan)) {
        if (!hasField(updateReq, camel(item.name))) {
          bad(where, `UpdateRequest 缺少字段 ${item.name}`);
        }
      }
      for (const item of businessItems(plan).filter((i) => i.field?.immutable === true)) {
        if (item.name === primaryKeyOf(plan.entity)) continue;
        if (hasField(updateReq, camel(item.name))) {
          bad(where, `UpdateRequest 含不可变字段 ${item.name}`);
        }
      }
      for (const column of ["tenant_id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"]) {
        if (createReq.includes(`"${column}"`)) bad(where, `CreateRequest 里出现了平台列 ${column}`);
      }
      if (plan.entity.storage?.optimisticLock) {
        if (!updateReq.includes("Integer version")) bad(where, "乐观锁实体 UpdateRequest 缺 version");
        if (!controller.includes("body.version()")) bad(where, "乐观锁实体的 update 没把 version 传给 runtime");
      }
      if (/select\s+|insert\s+into|delete\s+from|update\s+"/i.test(controller)) {
        bad(where, "Controller 里出现了 SQL —— SQL 只允许在 LcpCrudRuntime");
      }
      if (/select\s+|insert\s+into|delete\s+from|update\s+"/i.test(createReq + updateReq)) {
        bad(where, "请求体里出现了 SQL");
      }
      if (sensitiveItemsOf(plan).length > 0 && !controller.includes("LcpFieldPolicy.denySensitive")) {
        bad(where, "有 sensitive 字段但 Controller 没有挂 denySensitive 策略");
      }
    }
  }

  const runtime = [...results[0].files].find(([rel]) => rel.endsWith("LcpCrudRuntime.java"));
  if (!runtime) {
    bad("runtime", "没有生成 LcpCrudRuntime.java");
    return;
  }
  const text = runtime[1];
  if (!text.includes("spec.sortableColumns().contains(sort)")) bad("runtime", "ORDER BY 没有走 sortableColumns 白名单");
  if (!text.includes("if (spec.tenant() != null)")) bad("runtime", "没有租户条件注入");
  if (!text.includes("if (spec.softDeleteColumn() != null && !includeDeleted)")) bad("runtime", "列表查询没有软删除过滤");
  if (!text.includes("column == null || column.jsonb()")) bad("runtime", "筛选字段没有做 spec 白名单校验");
  if (!text.includes("if (update && column.immutable())")) bad("runtime", "更新没有跳过 immutable 字段");

  for (const { entry, files } of results) {
    const client = files.get("api/client/api.ts");
    if (!client) {
      bad(`${entry.key}/api/client/api.ts`, "缺少 TS 客户端");
      continue;
    }
    const expect = (name, times) => {
      const actual = (client.match(new RegExp(`method: "${name}",`, "g")) ?? []).length;
      if (actual !== times) bad(`${entry.key}/api/client/api.ts`, `${name} 路由 ${actual} 条（应为 ${times}）`);
    };
    expect("GET", entry.plans.length * 2);
    expect("POST", entry.plans.length);
    expect("PUT", entry.plans.length);
    expect("DELETE", entry.plans.length);
  }
}

// ============================================================ 汇报
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

const INFO_PRINT_CAP = 40;

function report() {
  const problems = dedupe(PROBLEMS);
  const notes = dedupe(NOTES);
  const warns = notes.filter((n) => n.level === "warn");
  const infos = notes.filter((n) => n.level === "info");
  const out = [""];
  out.push("==================== gen-api 自检 ====================");
  out.push(problems.length ? `错误 ${problems.length} 条：` : "错误 0 条。");
  for (const p of problems) out.push(`  [error] ${p.where} :: ${p.msg}`);
  if (warns.length) {
    out.push(`告警 ${warns.length} 条：`);
    for (const w of warns) out.push(`  [warn]  ${w.where} :: ${w.msg}`);
  }
  if (infos.length) {
    out.push(`提示 ${infos.length} 条：`);
    for (const i of infos.slice(0, INFO_PRINT_CAP)) out.push(`  [info]  ${i.where} :: ${i.msg}`);
    if (infos.length > INFO_PRINT_CAP) out.push(`  [info]  …… 另有 ${infos.length - INFO_PRINT_CAP} 条，已省略`);
  }
  return { problems, text: out.join("\n") };
}

function printSummary(summary, results) {
  console.log("");
  console.log("==================== 产出 ====================");
  for (const app of summary.apps) {
    const hit = results.find((item) => item.entry.key === app.key);
    const plans = hit ? hit.entry.plans : [];
    console.log(`  ${app.key}  →  ${app.dir}`);
    console.log(
      `    实体 ${plans.length} · 路由 ${plans.length * 5} · 筛选条件 ${plans.reduce((n, p) => n + filtersOf(p).length, 0)}` +
        ` · 文件 ${app.files} 个${app.removed.length ? ` · 清理过期产物 ${app.removed.length} 个` : ""}`
    );
    for (const rel of app.removed) console.log(`      清理 ${rel}`);
  }
  console.log("");
}

// ============================================================ 自测（--self-test）
const PROBE_STORAGE = {
  primaryKey: "id",
  idType: "ulid",
  tenantColumn: "tenant_id",
  jsonbColumn: "ext",
  softDelete: { enabled: true },
  timestamps: { createdAt: "created_at", updatedAt: "updated_at", createdBy: "created_by", updatedBy: "updated_by" }
};
const PROBE_ID = { id: "01SELFTEST0000000API1", key: "id", label: "主键", type: "string", storage: "column", columnType: "char(26)", required: true, immutable: true };

function probeBundle(appKey, entity) {
  return {
    protocolVersion: "0.1",
    tenantId: "tenant_selftest",
    app: { key: appKey, name: appKey },
    artifacts: { dataSchemas: [{ key: "selftest_core", scope: "system", version: 1, name: "自测模型", entities: [entity] }] }
  };
}

function probeEntity(storage, fields, indexes) {
  return { id: "01SELFTEST0000000001", key: "probe", tableName: "probe_tbl", name: "自测实体", titleField: "id", storage, fields, indexes: indexes ?? [] };
}

function probeApi(bundle) {
  const problemsBefore = PROBLEMS.length;
  const notesBefore = NOTES.length;
  const entry = renderApp(bundle, "(self-test)");
  const files = entry ? buildFiles(entry, bundle) : new Map();
  const result = {
    entry,
    files,
    problems: PROBLEMS.slice(problemsBefore),
    notes: NOTES.slice(notesBefore)
  };
  PROBLEMS.length = problemsBefore;
  NOTES.length = notesBefore;
  if (entry) APPS.delete(entry.key);
  return result;
}

const FILE_OF = (r, suffix) => {
  const hit = [...r.files].find(([rel]) => rel.endsWith(suffix));
  return hit ? hit[1] : "";
};

/** 记录组件可能是最后一个（没有尾随逗号），两种形态都算命中 */
const hasFieldLine = (text, name) => text.includes(` ${name},`) || new RegExp(` ${name}\\s*\\n`).test(text);

function selfTestCases() {
  return [
    {
      name: "未知 FieldType 必须报错",
      bundle: probeBundle("api_badtype", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTAPI2", key: "wheel", label: "轮子", type: "wheel", storage: "column" }])),
      check: (r) => (r.problems.some((p) => p.msg.includes('未知 FieldType "wheel"')) ? null : "没有拦下未知 FieldType")
    },
    {
      name: "没有业务字段的实体必须报错",
      bundle: probeBundle("api_empty", probeEntity(PROBE_STORAGE, [PROBE_ID])),
      check: (r) => (r.problems.some((p) => p.msg.includes("没有可写字段")) ? null : "没有拦下空实体")
    },
    {
      name: "immutable 字段不进 UpdateRequest",
      bundle: probeBundle("api_imm", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTAPI3", key: "code", label: "编号", type: "string", storage: "column", immutable: true }, { id: "01SELFTESTAPI4", key: "title", label: "标题", type: "string", storage: "column" }])),
      check: (r) => {
        const update = FILE_OF(r, "ProbeUpdateRequest.java");
        if (hasFieldLine(update, "String code")) return "UpdateRequest 里出现了 immutable 字段 code";
        if (!hasFieldLine(update, "String title")) return "UpdateRequest 丢了可改字段 title";
        if (hasFieldLine(update, "String id")) return "UpdateRequest 里出现了主键";
        return null;
      }
    },
    {
      name: "乐观锁实体：UpdateRequest 带 version，Controller 传给 runtime",
      bundle: probeBundle("api_lock", probeEntity({ ...PROBE_STORAGE, optimisticLock: true }, [PROBE_ID, { id: "01SELFTESTAPI5", key: "title", label: "标题", type: "string", storage: "column" }])),
      check: (r) => {
        if (!hasFieldLine(FILE_OF(r, "ProbeUpdateRequest.java"), "Integer version")) return "UpdateRequest 缺 version";
        if (!FILE_OF(r, "ProbeController.java").includes("body.version()")) return "Controller 没把 version 传给 runtime";
        if (!FILE_OF(r, "Tables.java").includes('"version"')) return "Tables 常量里没有 version 列 —— 说明规划器没认出乐观锁";
        return null;
      }
    },
    {
      name: "无租户表（tenantColumn:null）也要能生成 CRUD",
      bundle: probeBundle("api_global", probeEntity({ ...PROBE_STORAGE, tenantColumn: null }, [PROBE_ID, { id: "01SELFTESTAPI6", key: "title", label: "标题", type: "string", storage: "column" }])),
      check: (r) => {
        const tables = FILE_OF(r, "Tables.java");
        if (!tables) return "没有生成 Tables 常量";
        if (!/PlatformColumns\(\s*"id",\s*null,/.test(tables)) return "全局表的 tenant 应该编译成 null";
        return null;
      }
    },
    {
      name: "sensitive 字段进 denySensitive 并标记 sens",
      bundle: probeBundle("api_sens", probeEntity(PROBE_STORAGE, [PROBE_ID, { id: "01SELFTESTAPI7", key: "phone", label: "手机号", type: "string", storage: "column", sensitive: true }])),
      check: (r) => {
        if (!FILE_OF(r, "Tables.java").includes('"sens"')) return "sensitive 没有编译成 sens 标记";
        if (!FILE_OF(r, "ProbeController.java").includes("LcpFieldPolicy.denySensitive")) return "Controller 没有挂 denySensitive";
        return null;
      }
    }
  ];
}

function runSelfTest() {
  console.log("gen-api --self-test：用内存 Bundle 逐条逼出断言");
  let failed = 0;
  for (const item of selfTestCases()) {
    let reason = null;
    try {
      const result = probeApi(item.bundle);
      reason = result.entry || result.problems.length ? item.check(result) : "没有产出（未知原因）";
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
  const total = selfTestCases().length;
  console.log(failed === 0 ? `\n全部 ${total} 条通过。` : `\n${failed} 条失败。`);
  process.exit(failed === 0 ? 0 : 1);
}

// ============================================================ 入口
function defaultBundles() {
  const dir = path.join(ROOT, "examples");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".bundle.json"))
    .sort()
    .map((name) => path.join(dir, name));
}

function loadBundle(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.bundle ?? raw;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const files = args.length > 0 ? args : defaultBundles();
  if (files.length === 0) {
    console.error("gen-api：没有输入。传 bundle 路径，或在 examples/ 下放 *.bundle.json。");
    process.exit(2);
  }

  const results = [];
  for (const file of files) {
    let bundle;
    try {
      bundle = loadBundle(file);
    } catch (err) {
      bad(path.basename(file), `读取或解析失败：${err.message}`);
      continue;
    }
    const built = buildApi(bundle, path.basename(file));
    if (!built) continue;
    const appKey = built.entry.key;
    const entitiesFile = path.join(OUT_ROOT, appKey, "ts", "entities.ts");
    if (!fs.existsSync(entitiesFile)) {
      bad(appKey, `缺少 codegen/${appKey}/ts/entities.ts：先跑 node tools/gen-entity.mjs（本层依赖它的规划器与行类型）`);
    }
    let planned = false;
    for (const existing of results) if (existing.entry.key === appKey) planned = true;
    if (planned) {
      bad(path.basename(file), `应用 key "${appKey}" 重复`);
      continue;
    }
    results.push(built);
  }

  if (results.length > 0) selfCheckProducts(results);

  const result = report();
  console.log(result.text);
  if (result.problems.length > 0) {
    console.error(`gen-api 失败：${result.problems.length} 条错误，一个文件都没写。`);
    process.exit(1);
  }
  printSummary(writeAll(results), results);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();

