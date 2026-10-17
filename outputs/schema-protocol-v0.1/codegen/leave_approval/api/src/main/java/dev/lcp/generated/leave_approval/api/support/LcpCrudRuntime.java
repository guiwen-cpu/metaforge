package dev.lcp.generated.leave_approval.api.support;

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
  private static final int MAX_PAGE_SIZE = 200;

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
    return "\"" + ident + "\"";
  }

  private record WriteSet(Map<String, Object> stored, Map<String, Object> document) {
  }
}
