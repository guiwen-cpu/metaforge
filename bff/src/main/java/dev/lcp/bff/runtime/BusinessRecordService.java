package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.platform.Ulid;
import dev.lcp.bff.tenant.TenantContext;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** 按 Bundle 的实体元数据读写业务表，不写死 leave_request 之类的表名。 */
@Service
public class BusinessRecordService {

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper json;

  public BusinessRecordService(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public String create(JsonNode entity, Map<String, Object> business, String actor) {
    JsonNode storage = entity.path("storage");
    String table = required(entity, "tableName");
    String idColumn = text(storage, "primaryKey", "id");
    String tenantColumn = text(storage, "tenantColumn", "tenant_id");
    String jsonbColumn = text(storage, "jsonbColumn", "ext");
    String id = value(business.get(idColumn));
    if (id == null || id.isBlank()) {
      id = Ulid.next();
    }

    Map<String, Object> columns = new LinkedHashMap<>();
    ObjectNode doc = json.createObjectNode();
    List<String> missing = new ArrayList<>();
    for (JsonNode field : entity.path("fields")) {
      String key = field.path("key").asText();
      if (key.equals(idColumn) || key.isBlank()) {
        continue;
      }
      Object value = business.get(key);
      if (value == null && field.has("defaultValue")) {
        value = json.convertValue(field.get("defaultValue"), Object.class);
      }
      boolean column = !"jsonb".equals(field.path("storage").asText("column"));
      if (value == null && column && field.path("required").asBoolean(false)) {
        missing.add(field.path("label").asText(key));
      }
      if (value == null) {
        continue;
      }
      if (column) {
        columns.put(key, value);
      } else {
        doc.set(key, json.valueToTree(value));
      }
    }
    if (!missing.isEmpty()) {
      throw PlatformException.badRequest("business_required", "缺少必填字段：" + String.join("、", missing));
    }

    columns.put(idColumn, id);
    columns.put(tenantColumn, tenant());
    putTimestamp(columns, storage, "createdAt", "now()");
    putTimestamp(columns, storage, "updatedAt", "now()");
    putActor(columns, storage, "createdBy", actor);
    putActor(columns, storage, "updatedBy", actor);
    String softDelete = storage.path("softDelete").path("enabled").asBoolean(false)
        ? storage.path("softDelete").path("column").asText(null) : null;
    if (softDelete != null) {
      columns.put(softDelete, null);
    }
    if (storage.path("optimisticLock").asBoolean(false)) {
      columns.put("version", 0);
    }

    MapSqlParameterSource params = new MapSqlParameterSource();
    List<String> names = new ArrayList<>();
    List<String> marks = new ArrayList<>();
    int index = 0;
    for (Map.Entry<String, Object> entry : columns.entrySet()) {
      if (entry.getValue() instanceof RawSql) {
        names.add(q(entry.getKey()));
        marks.add(((RawSql) entry.getValue()).sql());
      } else {
        String param = "p" + index++;
        names.add(q(entry.getKey()));
        marks.add(casts(field(entity, entry.getKey()), ":" + param));
        params.addValue(param, entry.getValue());
      }
    }
    if (jsonbColumn != null && doc.size() > 0) {
      names.add(q(jsonbColumn));
      marks.add("cast(:doc as jsonb)");
      params.addValue("doc", write(doc));
    }
    jdbc.update("insert into " + q(table) + " (" + String.join(", ", names) + ")"
        + " values (" + String.join(", ", marks) + ")", params);
    return id;
  }

  public void update(JsonNode entity, String id, Map<String, Object> business, String actor) {
    JsonNode storage = entity.path("storage");
    String table = required(entity, "tableName");
    String idColumn = text(storage, "primaryKey", "id");
    String tenantColumn = text(storage, "tenantColumn", "tenant_id");
    String jsonbColumn = text(storage, "jsonbColumn", "ext");
    MapSqlParameterSource params = new MapSqlParameterSource("t", tenant()).addValue("id", id);
    List<String> sets = new ArrayList<>();
    ObjectNode doc = json.createObjectNode();
    int index = 0;
    for (JsonNode field : entity.path("fields")) {
      String key = field.path("key").asText();
      if (key.equals(idColumn) || key.isBlank() || !business.containsKey(key)) {
        continue;
      }
      Object value = business.get(key);
      if ("jsonb".equals(field.path("storage").asText("column"))) {
        doc.set(key, json.valueToTree(value));
      } else {
        String param = "p" + index++;
        sets.add(q(key) + " = " + casts(field, ":" + param));
        params.addValue(param, value);
      }
    }
    if (jsonbColumn != null && doc.size() > 0) {
      sets.add(q(jsonbColumn) + " = coalesce(" + q(jsonbColumn) + ", '{}'::jsonb) || cast(:doc as jsonb)");
      params.addValue("doc", write(doc));
    }
    String updatedAt = storage.path("timestamps").path("updatedAt").asText(null);
    String updatedBy = storage.path("timestamps").path("updatedBy").asText(null);
    if (updatedAt != null) {
      sets.add(q(updatedAt) + " = now()");
    }
    if (updatedBy != null) {
      sets.add(q(updatedBy) + " = :actor");
      params.addValue("actor", actor);
    }
    if (storage.path("optimisticLock").asBoolean(false)) {
      sets.add("version = version + 1");
    }
    if (sets.isEmpty()) {
      return;
    }
    jdbc.update("update " + q(table) + " set " + String.join(", ", sets)
        + " where " + q(tenantColumn) + " = :t and " + q(idColumn) + " = :id", params);
  }

  public Map<String, Object> get(JsonNode entity, String id) {
    if (entity == null || id == null || id.isBlank()) {
      return Map.of();
    }
    JsonNode storage = entity.path("storage");
    String table = required(entity, "tableName");
    String idColumn = text(storage, "primaryKey", "id");
    String tenantColumn = text(storage, "tenantColumn", "tenant_id");
    String jsonbColumn = text(storage, "jsonbColumn", "ext");
    String ext = jsonbColumn == null ? "null" : "t." + q(jsonbColumn) + "::text";
    String sql = "select t.*, " + ext + " as __ext_json from " + q(table) + " t"
        + " where t." + q(tenantColumn) + " = :t and t." + q(idColumn) + " = :id";
    List<Map<String, Object>> rows = jdbc.queryForList(sql,
        new MapSqlParameterSource("t", tenant()).addValue("id", id));
    if (rows.isEmpty()) {
      return Map.of();
    }
    Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
    Object rawExt = row.remove("__ext_json");
    if (jsonbColumn != null) {
      row.remove(jsonbColumn);
    }
    if (rawExt instanceof String text && !text.isBlank()) {
      try {
        JsonNode node = json.readTree(text);
        node.fields().forEachRemaining(entry -> row.putIfAbsent(entry.getKey(), plain(entry.getValue())));
      } catch (Exception ignored) {
        // ext 不是对象时不影响主列读取
      }
    }
    row.replaceAll((key, value) -> normalize(value));
    return row;
  }

  public Map<String, Object> getByFlow(JsonNode bundle, JsonNode flow, String businessId) {
    JsonNode entity = entity(bundle, flow);
    return get(entity, businessId);
  }

  /** 按实体元数据列出业务行；过滤键必须是实体字段，租户与软删除由服务端强制。 */
  public List<Map<String, Object>> list(
      JsonNode entity,
      Map<String, Object> filters,
      String orderColumn,
      boolean descending,
      int limit) {
    if (entity == null) {
      return List.of();
    }
    JsonNode storage = entity.path("storage");
    String table = required(entity, "tableName");
    String idColumn = text(storage, "primaryKey", "id");
    String tenantColumn = text(storage, "tenantColumn", "tenant_id");
    String jsonbColumn = text(storage, "jsonbColumn", "ext");
    MapSqlParameterSource params = new MapSqlParameterSource("t", tenant());
    List<String> where = new ArrayList<>();
    where.add("t." + q(tenantColumn) + " = :t");
    String softDelete = storage.path("softDelete").path("enabled").asBoolean(false)
        ? storage.path("softDelete").path("column").asText("deleted_at") : null;
    if (softDelete != null) {
      where.add("t." + q(softDelete) + " is null");
    }
    int index = 0;
    for (Map.Entry<String, Object> entry : filters.entrySet()) {
      if (entry.getValue() == null) {
        continue;
      }
      JsonNode field = field(entity, entry.getKey());
      if (field == null || "jsonb".equals(field.path("storage").asText("column"))) {
        continue;
      }
      String param = "f" + index++;
      where.add("t." + q(entry.getKey()) + " = " + casts(field, ":" + param));
      params.addValue(param, entry.getValue());
    }
    String order = orderColumn;
    if (order == null || field(entity, order) == null) {
      order = storage.path("timestamps").path("createdAt").asText(idColumn);
    }
    String ext = jsonbColumn == null ? "null" : "t." + q(jsonbColumn) + "::text";
    String sql = "select t.*, " + ext + " as __ext_json from " + q(table) + " t"
        + " where " + String.join(" and ", where)
        + " order by t." + q(order) + (descending ? " desc" : " asc")
        + " limit :limit";
    params.addValue("limit", Math.max(1, Math.min(limit, 500)));
    List<Map<String, Object>> rows = jdbc.queryForList(sql, params);
    List<Map<String, Object>> out = new ArrayList<>(rows.size());
    for (Map<String, Object> raw : rows) {
      Map<String, Object> row = new LinkedHashMap<>(raw);
      Object rawExt = row.remove("__ext_json");
      if (jsonbColumn != null) {
        row.remove(jsonbColumn);
      }
      if (rawExt instanceof String text && !text.isBlank()) {
        try {
          JsonNode node = json.readTree(text);
          node.fields().forEachRemaining(entry -> row.putIfAbsent(entry.getKey(), plain(entry.getValue())));
        } catch (Exception ignored) {
          // ext 不是对象时不影响主列读取
        }
      }
      row.replaceAll((key, value) -> normalize(value));
      out.add(row);
    }
    return out;
  }

  /** 软删除由实体元数据决定列名；没有配置软删除时拒绝调用。 */
  public void softDelete(JsonNode entity, String id, String actor) {
    JsonNode storage = entity.path("storage");
    String table = required(entity, "tableName");
    String idColumn = text(storage, "primaryKey", "id");
    String tenantColumn = text(storage, "tenantColumn", "tenant_id");
    String column = storage.path("softDelete").path("enabled").asBoolean(false)
        ? storage.path("softDelete").path("column").asText("deleted_at") : null;
    if (column == null) {
      throw new IllegalStateException("实体未启用软删除");
    }
    MapSqlParameterSource params = new MapSqlParameterSource("t", tenant())
        .addValue("id", id).addValue("actor", actor);
    List<String> sets = new ArrayList<>();
    sets.add(q(column) + " = now()");
    String updatedAt = storage.path("timestamps").path("updatedAt").asText(null);
    if (updatedAt != null) {
      sets.add(q(updatedAt) + " = now()");
    }
    String updatedBy = storage.path("timestamps").path("updatedBy").asText(null);
    if (updatedBy != null) {
      sets.add(q(updatedBy) + " = :actor");
    }
    jdbc.update("update " + q(table) + " set " + String.join(", ", sets)
        + " where " + q(tenantColumn) + " = :t and " + q(idColumn) + " = :id", params);
  }
  public JsonNode entity(JsonNode bundle, JsonNode flow) {
    String key = flow.path("entityRef").path("key").asText(null);
    if (key == null) {
      return null;
    }
    for (JsonNode schema : bundle.path("artifacts").path("dataSchemas")) {
      for (JsonNode entity : schema.path("entities")) {
        if (key.equals(entity.path("key").asText())) {
          return entity;
        }
      }
    }
    return null;
  }

  public String title(JsonNode entity, Map<String, Object> business, String fallback) {
    String field = entity == null ? null : entity.path("titleField").asText(null);
    if (field != null && business.get(field) != null) {
      return String.valueOf(business.get(field));
    }
    return fallback;
  }

  private static JsonNode field(JsonNode entity, String key) {
    for (JsonNode field : entity.path("fields")) {
      if (key.equals(field.path("key").asText())) {
        return field;
      }
    }
    return null;
  }

  private static String casts(JsonNode field, String param) {
    if (field == null) {
      return param;
    }
    return switch (field.path("type").asText()) {
      case "datetime" -> "cast(" + param + " as timestamptz)";
      case "date" -> "cast(" + param + " as date)";
      case "decimal", "number" -> "cast(" + param + " as numeric)";
      case "integer" -> "cast(" + param + " as integer)";
      case "boolean" -> "cast(" + param + " as boolean)";
      default -> param;
    };
  }

  private static void putTimestamp(Map<String, Object> columns, JsonNode storage, String key, String sql) {
    String column = storage.path("timestamps").path(key).asText(null);
    if (column != null) {
      columns.put(column, new RawSql(sql));
    }
  }

  private static void putActor(Map<String, Object> columns, JsonNode storage, String key, String actor) {
    String column = storage.path("timestamps").path(key).asText(null);
    if (column != null) {
      columns.put(column, actor);
    }
  }

  private static Object plain(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    return node.isNumber() ? node.numberValue() : node.isBoolean() ? node.booleanValue() : node.asText();
  }

  private String write(ObjectNode doc) {
    try {
      return json.writeValueAsString(doc);
    } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
      throw new IllegalStateException("JSONB 文档序列化失败", ex);
    }
  }

  private static Object normalize(Object value) {
    if (value instanceof Timestamp ts) {
      return ts.toInstant().atZone(ZONE).toOffsetDateTime();
    }
    if (value instanceof java.sql.Date date) {
      return date.toLocalDate().toString();
    }
    if (value instanceof BigDecimal decimal) {
      return decimal.stripTrailingZeros();
    }
    if (value instanceof String text) {
      return text.stripTrailing();
    }
    return value;
  }

  private static String required(JsonNode node, String field) {
    String value = node.path(field).asText(null);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("实体元数据缺少 " + field);
    }
    return value;
  }

  private static String text(JsonNode node, String field, String fallback) {
    String value = node.path(field).asText(null);
    return value == null || value.isBlank() ? fallback : value;
  }

  private static String value(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static String q(String identifier) {
    if (identifier == null || !identifier.matches("[A-Za-z_][A-Za-z0-9_]*")) {
      throw new IllegalStateException("非法标识符：" + identifier);
    }
    return identifier;
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return tenant;
  }

  private record RawSql(String sql) {
  }
}
