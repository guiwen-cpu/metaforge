package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.auth.PermissionService;
import dev.lcp.bff.auth.PermissionService.Grant;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.RuntimeNavigationService.PageView;
import dev.lcp.bff.runtime.dto.RuntimeRequests.DataSourceFilter;
import dev.lcp.bff.runtime.dto.RuntimeRequests.DataSourceSort;
import dev.lcp.bff.runtime.dto.RuntimeRequests.DataSourceQueryRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.DataSourceQueryResult;
import dev.lcp.bff.runtime.engine.ExpressionEngine;
import dev.lcp.bff.tenant.TenantContext;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 发布态实体数据源查询。
 *
 * <p>只读取发布件中的页面数据源与实体元数据；表名、字段、排序字段和查询算子全部
 * 走白名单，用户值一律参数绑定。行级权限由 {@link PermissionService} 的授权编译为
 * SQL 条件，编译失败时按拒绝处理，不退回内存过滤。
 */
@Service
public class RuntimeDataSourceService {

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private static final Set<String> OPS = Set.of(
      "eq", "ne", "like", "startsWith", "in", "between",
      "gt", "gte", "lt", "lte", "isNull", "notNull");
  private static final Set<String> OPERATORS = Set.of("$lit", "$ref", "$fn", "$tpl", "$if");

  private final PublishedBundleService bundles;
  private final RuntimeNavigationService navigation;
  private final PermissionService permissions;
  private final ExpressionEngine expressions;
  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper json;

  public RuntimeDataSourceService(
      PublishedBundleService bundles,
      RuntimeNavigationService navigation,
      PermissionService permissions,
      ExpressionEngine expressions,
      NamedParameterJdbcTemplate jdbc,
      ObjectMapper json) {
    this.bundles = bundles;
    this.navigation = navigation;
    this.permissions = permissions;
    this.expressions = expressions;
    this.jdbc = jdbc;
    this.json = json;
  }

  public DataSourceQueryResult query(
      java.util.UUID appId,
      String pageKey,
      String dataSourceId,
      DataSourceQueryRequest request) {
    PageView view = navigation.page(appId, pageKey);
    JsonNode dataSource = findDataSource(view.page(), dataSourceId);
    if (dataSource == null) {
      throw PlatformException.notFound("数据源 " + dataSourceId + " 不在页面 " + pageKey + " 中");
    }
    DataSourceQueryRequest safe = request == null
        ? new DataSourceQueryRequest(null, null, null, null, null, null, null) : request;
    String type = dataSource.path("type").asText("entity");
    if ("static".equals(type)) {
      return staticResult(dataSource, safe);
    }
    if (!"entity".equals(type)) {
      throw PlatformException.badRequest(
          "unsupported_data_source", "运行时暂不支持 " + type + " 数据源，请使用 entity / static");
    }
    return entityResult(appId, view, dataSource, safe);
  }

  private DataSourceQueryResult staticResult(
      JsonNode dataSource, DataSourceQueryRequest request) {
    JsonNode data = dataSource.path("data");
    List<Map<String, Object>> rows = new ArrayList<>();
    if (data.isArray()) {
      for (JsonNode item : data) {
        rows.add(objectMap(item));
      }
    } else if (data.isObject()) {
      rows.add(objectMap(data));
    }
    int page = intValue(query(request, "page"), 1, 1, Integer.MAX_VALUE);
    int size = intValue(query(request, "size"), Math.max(1, rows.size()), 1, 500);
    return new DataSourceQueryResult(List.copyOf(rows), rows.size(), page, size, null);
  }

  private DataSourceQueryResult entityResult(
      java.util.UUID appId, PageView view, JsonNode dataSource, DataSourceQueryRequest request) {
    PublishedBundle published = bundles.load(appId);
    JsonNode entity = findEntity(published.content(), dataSource.path("entityRef").path("key").asText());
    if (entity == null) {
      throw PlatformException.badRequest("unknown_entity", "数据源引用的实体不存在");
    }
    Ctx ctx = context(view, entity, request);
    String mode = dataSource.path("mode").asText("list");
    int page = intValue(query(request, "page"), statePage(request), 1, Integer.MAX_VALUE);
    int size = requestedSize(dataSource, request);

    List<String> fields = selectedFields(dataSource, entity);
    List<String> where = new ArrayList<>();
    where.add(ctx.tenantCondition());
    if (ctx.softDeleteColumn != null) {
      where.add("t." + q(ctx.softDeleteColumn) + " is null");
    }
    if (dataSource.has("filter") && !dataSource.get("filter").isNull()) {
      where.add(compileCondition(dataSource.get("filter"), ctx));
    }
    where.add(permissionCondition(appId, entity.path("key").asText(), dataSource, ctx));

    if ("one".equals(mode)) {
      Object id = constantValue(dataSource.path("pkParam"), ctx);
      if (id == null || String.valueOf(id).isBlank()) {
        return new DataSourceQueryResult(List.of(), 0, 1, size, null);
      }
      where.add("t." + q(ctx.idColumn) + " = :pk");
      ctx.params.addValue("pk", id);
      Map<String, Object> row = queryOne(entity, fields, where, ctx);
      List<Map<String, Object>> rows = row == null ? List.of() : List.of(row);
      return new DataSourceQueryResult(rows, rows.size(), 1, size, row);
    }

    if ("count".equals(mode)) {
      long total = count(entity, where, ctx);
      return new DataSourceQueryResult(List.of(), total, page, size, null);
    }

    for (DataSourceFilter filter : request.filters() == null
        ? List.<DataSourceFilter>of() : request.filters()) {
      String sql = compileFilter(filter, entity, ctx);
      if (sql != null) {
        where.add(sql);
      }
    }

    long total = count(entity, where, ctx);
    if ("page".equals(mode) || "list".equals(mode)) {
      List<Map<String, Object>> rows = queryRows(
          entity, dataSource, fields, where, request.sort(), ctx, page, size, "page".equals(mode));
      return new DataSourceQueryResult(rows, total, page, size, null);
    }
    throw PlatformException.badRequest("unsupported_mode", "未知数据源模式：" + mode);
  }

  // ------------------------------------------------------------- query build

  private Map<String, Object> queryOne(
      JsonNode entity, List<String> fields, List<String> where, Ctx ctx) {
    String sql = "select " + selectList(entity, fields, ctx)
        + " from " + q(ctx.table) + " t where " + String.join(" and ", where)
        + " limit 1";
    List<Map<String, Object>> rows = jdbc.queryForList(sql, ctx.params);
    return rows.isEmpty() ? null : mapRow(entity, fields, rows.get(0));
  }

  private List<Map<String, Object>> queryRows(
      JsonNode entity,
      JsonNode dataSource,
      List<String> fields,
      List<String> where,
      List<DataSourceSort> requestedSort,
      Ctx ctx,
      int page,
      int size,
      boolean paged) {
    StringBuilder sql = new StringBuilder("select ")
        .append(selectList(entity, fields, ctx))
        .append(" from ").append(q(ctx.table)).append(" t where ")
        .append(String.join(" and ", where));
    appendSort(sql, dataSource, entity, ctx, requestedSort);
    if (paged) {
      sql.append(" limit :limit offset :offset");
      ctx.params.addValue("limit", size);
      ctx.params.addValue("offset", (long) (page - 1) * size);
    } else {
      sql.append(" limit :limit");
      ctx.params.addValue("limit", size);
    }
    List<Map<String, Object>> raw = jdbc.queryForList(sql.toString(), ctx.params);
    List<Map<String, Object>> rows = new ArrayList<>(raw.size());
    for (Map<String, Object> item : raw) {
      rows.add(mapRow(entity, fields, item));
    }
    return rows;
  }

  private long count(JsonNode entity, List<String> where, Ctx ctx) {
    Long value = jdbc.queryForObject(
        "select count(*) from " + q(ctx.table) + " t where " + String.join(" and ", where),
        ctx.params,
        Long.class);
    return value == null ? 0 : value;
  }

  private String selectList(JsonNode entity, List<String> fields, Ctx ctx) {
    List<String> out = new ArrayList<>();
    for (String key : fields) {
      JsonNode field = field(entity, key);
      if (field == null) {
        throw PlatformException.badRequest("unknown_field", "实体元数据中不存在字段：" + key);
      }
      out.add(fieldSql(field, ctx) + " as " + q(key));
    }
    if (out.isEmpty()) {
      throw PlatformException.badRequest("empty_select", "数据源没有可查询字段");
    }
    return String.join(", ", out);
  }

  private void appendSort(
      StringBuilder sql,
      JsonNode dataSource,
      JsonNode entity,
      Ctx ctx,
      List<DataSourceSort> requestedSort) {
    List<String> orders = new ArrayList<>();
    Set<String> used = new LinkedHashSet<>();
    for (DataSourceSort item : requestedSort == null ? List.<DataSourceSort>of() : requestedSort) {
      if (item == null) {
        continue;
      }
      appendOrder(orders, used, entity, ctx, item.field(), item.direction(), item.nulls());
    }
    JsonNode sort = dataSource.path("sort");
    if (sort.isArray()) {
      for (JsonNode item : sort) {
        appendOrder(orders, used, entity, ctx,
            item.path("field").asText(null),
            item.path("direction").asText("asc"),
            item.path("nulls").asText(""));
      }
    }
    if (ctx.idColumn != null && used.add(ctx.idColumn)) {
      orders.add("t." + q(ctx.idColumn) + " asc");
    }
    if (!orders.isEmpty()) {
      sql.append(" order by ").append(String.join(", ", orders));
    }
  }

  private void appendOrder(
      List<String> orders,
      Set<String> used,
      JsonNode entity,
      Ctx ctx,
      String key,
      String rawDirection,
      String rawNulls) {
    if (key == null || key.isBlank() || used.contains(key)) {
      return;
    }
    JsonNode field = field(entity, key);
    if (field == null) {
      throw PlatformException.badRequest("unknown_sort", "排序字段不存在：" + key);
    }
    String direction = rawDirection == null || rawDirection.isBlank()
        ? "asc" : rawDirection.toLowerCase(Locale.ROOT);
    if (!"asc".equals(direction) && !"desc".equals(direction)) {
      throw PlatformException.badRequest("bad_sort", "排序方向只能是 asc / desc");
    }
    String nulls = rawNulls == null ? "" : rawNulls.toLowerCase(Locale.ROOT);
    if (!nulls.isEmpty() && !"first".equals(nulls) && !"last".equals(nulls)) {
      throw PlatformException.badRequest("bad_sort", "空值排序只能为 first / last / 空");
    }
    String suffix = "first".equals(nulls) ? " nulls first"
        : "last".equals(nulls) ? " nulls last" : "";
    orders.add(fieldSql(field, ctx) + " " + direction + suffix);
    used.add(key);
  }

  private List<String> selectedFields(JsonNode dataSource, JsonNode entity) {
    List<String> out = new ArrayList<>();
    JsonNode select = dataSource.path("select");
    if (select.isArray() && select.size() > 0) {
      for (JsonNode item : select) {
        if (item.isTextual() && field(entity, item.asText()) != null && !out.contains(item.asText())) {
          out.add(item.asText());
        }
      }
    } else {
      for (JsonNode field : entity.path("fields")) {
        String key = field.path("key").asText();
        if (!key.isBlank()) {
          out.add(key);
        }
      }
    }
    String id = text(entity.path("storage"), "primaryKey", "id");
    if (field(entity, id) != null && !out.contains(id)) {
      out.add(id);
    }
    return out;
  }

  // --------------------------------------------------------- permission push

  private String permissionCondition(
      java.util.UUID appId, String entityKey, JsonNode dataSource, Ctx ctx) {
    List<String> groups = new ArrayList<>();
    for (Grant grant : permissions.access(appId, "entity", entityKey).grants()) {
      if (!grant.actions().contains("*") && !grant.actions().contains("read")) {
        continue;
      }
      try {
        String scope = scopeCondition(grant, dataSource, ctx);
        String condition = grant.condition() == null || grant.condition().isNull()
            ? "true" : compileCondition(grant.condition(), ctx);
        String group = "(" + scope + " and " + condition + ")";
        if (!groups.contains(group)) {
          groups.add(group);
        }
      } catch (RuntimeException ex) {
        // 单个授权无法编译时跳过，而不是放宽成无条件；全部失败则拒绝。
      }
    }
    if (groups.isEmpty()) {
      throw PlatformException.forbidden("没有可用的数据读取权限");
    }
    return "(" + String.join(" or ", groups) + ")";
  }

  private String scopeCondition(Grant grant, JsonNode dataSource, Ctx ctx) {
    return switch (grant.dataScope()) {
      case "all" -> "true";
      case "none" -> "false";
      case "self" -> {
        String owner = ownerField(dataSource, ctx.entity);
        String userId = TenantContext.userId();
        yield owner == null || userId == null
            ? "false" : fieldSql(entityField(ctx.entity, owner), ctx) + " = " + bind(userId, null, ctx);
      }
      case "dept" -> {
        String dept = deptField(dataSource, ctx.entity);
        String value = permissions.userRoot().path("deptId").asText(null);
        yield dept == null || value == null
            ? "false" : fieldSql(entityField(ctx.entity, dept), ctx) + " = " + bind(value, null, ctx);
      }
      case "deptAndChildren" -> {
        String dept = deptField(dataSource, ctx.entity);
        List<Object> values = values(permissions.userRoot().path("deptIds"));
        yield dept == null || values.isEmpty()
            ? "false" : fieldSql(entityField(ctx.entity, dept), ctx)
            + " in (" + bindList(values, ctx) + ")";
      }
      case "custom" -> grant.customRule() == null || grant.customRule().isNull()
          ? "false" : compileCondition(grant.customRule(), ctx);
      default -> "false";
    };
  }

  private static String ownerField(JsonNode dataSource, JsonNode entity) {
    String declared = text(dataSource.path("access"), "ownerField", null);
    if (declared != null && field(entity, declared) != null) {
      return declared;
    }
    for (String key : List.of("applicant_id", "created_by", "user_id", "owner_id")) {
      if (field(entity, key) != null) {
        return key;
      }
    }
    return null;
  }

  private static String deptField(JsonNode dataSource, JsonNode entity) {
    String declared = text(dataSource.path("access"), "deptField", null);
    if (declared != null && field(entity, declared) != null) {
      return declared;
    }
    return field(entity, "dept_id") == null ? null : "dept_id";
  }

  private static JsonNode entityField(JsonNode entity, String key) {
    JsonNode field = field(entity, key);
    if (field == null) {
      throw PlatformException.forbidden("行级权限字段不存在：" + key);
    }
    return field;
  }

  // -------------------------------------------------------- filter compiler

  private String compileFilter(DataSourceFilter filter, JsonNode entity, Ctx ctx) {
    if (filter == null || filter.field() == null) {
      return null;
    }
    String key = filter.field();
    JsonNode field = field(entity, key);
    if (field == null) {
      throw PlatformException.badRequest("unknown_field", "查询字段不存在：" + key);
    }
    String op = filter.op() == null || filter.op().isBlank() ? "eq" : filter.op();
    if (!OPS.contains(op)) {
      throw PlatformException.badRequest("unsupported_operator", "不支持的查询算子：" + op);
    }
    Object value = filter.value();
    if (value == null || (value instanceof String text && text.isBlank())) {
      return null;
    }
    if ("in".equals(op) && values(value).isEmpty()) {
      return null;
    }
    return comparison(op, new Term(field, null), new Term(null, value), ctx);
  }

  private String compileCondition(JsonNode expr, Ctx ctx) {
    if (expr == null || expr.isNull() || expr.isMissingNode()) {
      return "true";
    }
    if (expr.isBoolean()) {
      return expr.asBoolean() ? "true" : "false";
    }
    String op = operator(expr);
    if ("$fn".equals(op)) {
      String name = expr.path("$fn").asText();
      JsonNode args = expr.path("$args");
      return switch (name) {
        case "and" -> join(" and ", args, ctx);
        case "or" -> join(" or ", args, ctx);
        case "not" -> "not (" + compileCondition(first(args), ctx) + ")";
        case "isEmpty" -> emptiness(term(first(args), ctx), true, ctx);
        case "isNotEmpty" -> emptiness(term(first(args), ctx), false, ctx);
        case "eq", "ne", "gt", "gte", "lt", "lte", "like", "startsWith", "in", "between" ->
            comparison(name, term(arg(args, 0), ctx), term(arg(args, 1), ctx), ctx);
        default -> constantCondition(expr, ctx);
      };
    }
    if ("$lit".equals(op) || "$ref".equals(op)) {
      Term term = term(expr, ctx);
      return term.column() ? throwUnsupported("条件缺少比较算子") : constantCondition(expr, ctx);
    }
    return constantCondition(expr, ctx);
  }

  private String join(String glue, JsonNode args, Ctx ctx) {
    List<String> parts = new ArrayList<>();
    if (args.isArray()) {
      for (JsonNode arg : args) {
        parts.add(compileCondition(arg, ctx));
      }
    }
    return parts.isEmpty() ? "true" : "(" + String.join(glue, parts) + ")";
  }

  private String comparison(String op, Term left, Term right, Ctx ctx) {
    if (left.column() && right.column()) {
      String field = fieldSql(left.field(), ctx);
      String other = fieldSql(right.field(), ctx);
      return switch (op) {
        case "eq" -> field + " = " + other;
        case "ne" -> field + " <> " + other;
        case "gt" -> field + " > " + other;
        case "gte" -> field + " >= " + other;
        case "lt" -> field + " < " + other;
        case "lte" -> field + " <= " + other;
        default -> throwUnsupported("该算子不支持列对列比较：" + op);
      };
    }
    if (!left.column() && right.column()) {
      if (Set.of("gt", "gte", "lt", "lte").contains(op)) {
        String flipped = switch (op) {
          case "gt" -> "lt";
          case "gte" -> "lte";
          case "lt" -> "gt";
          default -> "gte";
        };
        return comparison(flipped, right, left, ctx);
      }
      if ("eq".equals(op) || "ne".equals(op)) {
        String column = fieldSql(right.field(), ctx);
        String value = bind(left.value(), right.field(), ctx);
        return column + ("eq".equals(op) ? " = " : " <> ") + value;
      }
    }
    if (left.column()) {
      return columnComparison(op, left.field(), right.value(), ctx);
    }
    return constantCondition(op, left.value(), right.value(), ctx);
  }

  private String columnComparison(String op, JsonNode field, Object value, Ctx ctx) {
    String column = fieldSql(field, ctx);
    if (value == null) {
      return switch (op) {
        case "eq" -> column + " is null";
        case "ne" -> column + " is not null";
        default -> "false";
      };
    }
    return switch (op) {
      case "eq" -> column + " = " + bind(value, field, ctx);
      case "ne" -> column + " <> " + bind(value, field, ctx);
      case "gt" -> column + " > " + bind(value, field, ctx);
      case "gte" -> column + " >= " + bind(value, field, ctx);
      case "lt" -> column + " < " + bind(value, field, ctx);
      case "lte" -> column + " <= " + bind(value, field, ctx);
      case "like" -> column + " ilike " + bind(likePattern(value, false), null, ctx) + " escape '\\'";
      case "startsWith" -> column + " ilike " + bind(likePattern(value, true), null, ctx) + " escape '\\'";
      case "in" -> {
        List<Object> list = values(value);
        yield list.isEmpty() ? "false" : column + " in (" + bindList(list, field, ctx) + ")";
      }
      case "between" -> {
        List<Object> list = betweenValues(value, field.path("type").asText());
        yield list.size() < 2 ? "false"
            : column + " between " + bind(list.get(0), field, ctx)
            + " and " + bind(list.get(1), field, ctx);
      }
      case "isNull" -> column + " is null";
      case "notNull" -> column + " is not null";
      default -> throwUnsupported("不支持的查询算子：" + op);
    };
  }

  private String emptiness(Term term, boolean empty, Ctx ctx) {
    if (!term.column()) {
      boolean value = isEmptyValue(term.value());
      return (empty ? value : !value) ? "true" : "false";
    }
    String column = fieldSql(term.field(), ctx);
    String base = switch (term.field().path("type").asText()) {
      case "string", "text", "richText", "enum", "ref", "json", "array" ->
          "(" + column + " is null or " + column + " = '')";
      default -> column + " is null";
    };
    return empty ? base : "not " + base;
  }

  private Term term(JsonNode expr, Ctx ctx) {
    if (expr == null || expr.isNull()) {
      return new Term(null, null);
    }
    String op = operator(expr);
    if ("$ref".equals(op)) {
      String path = expr.path("$ref").asText("");
      if (path.startsWith("$row.")) {
        String key = path.substring("$row.".length());
        JsonNode field = field(ctx.entity, key);
        if (field == null) {
          throw PlatformException.forbidden("行级表达式引用了未知字段：" + key);
        }
        return new Term(field, null);
      }
      return new Term(null, constantValue(expr, ctx));
    }
    if ("$lit".equals(op)) {
      return new Term(null, plain(expr.get("$lit")));
    }
    if ("$fn".equals(op) && "dateAdd".equals(expr.path("$fn").asText())) {
      return new Term(null, constantValue(expr, ctx));
    }
    return new Term(null, constantValue(expr, ctx));
  }

  private Object constantValue(JsonNode expr, Ctx ctx) {
    if (expr == null || expr.isMissingNode() || expr.isNull()) {
      return null;
    }
    String op = operator(expr);
    if ("$lit".equals(op)) {
      return plain(expr.get("$lit"));
    }
    if ("$ref".equals(op)) {
      String path = expr.path("$ref").asText("");
      if (path.startsWith("$row.")) {
        throwUnsupported("常量位置不能引用 $row：" + path);
      }
      return plain(expressions.reference(path, ctx.scope));
    }
    if ("$fn".equals(op) && "dateAdd".equals(expr.path("$fn").asText())) {
      return dateAdd(expr, ctx);
    }
    return plain(expressions.eval(expr, ctx.scope));
  }

  private OffsetDateTime dateAdd(JsonNode expr, Ctx ctx) {
    JsonNode args = expr.path("$args");
    if (!args.isArray() || args.size() < 3) {
      throwUnsupported("dateAdd 需要 3 个参数");
    }
    Object baseValue = constantValue(args.get(0), ctx);
    OffsetDateTime base = baseValue == null ? OffsetDateTime.now(ZONE)
        : OffsetDateTime.parse(String.valueOf(baseValue));
    long amount = ((Number) plain(expressions.eval(args.get(1), ctx.scope))).longValue();
    String unit = String.valueOf(plain(expressions.eval(args.get(2), ctx.scope)));
    return switch (unit) {
      case "year", "years" -> base.plusYears(amount);
      case "month", "months" -> base.plusMonths(amount);
      case "week", "weeks" -> base.plusWeeks(amount);
      case "day", "days" -> base.plusDays(amount);
      case "hour", "hours" -> base.plusHours(amount);
      case "minute", "minutes" -> base.plusMinutes(amount);
      case "second", "seconds" -> base.plusSeconds(amount);
      default -> throwUnsupported("dateAdd 不支持单位：" + unit);
    };
  }

  private String constantCondition(JsonNode expr, Ctx ctx) {
    try {
      return expressions.truthy(expressions.eval(expr, ctx.scope)) ? "true" : "false";
    } catch (RuntimeException ex) {
      throwUnsupported("无法编译条件表达式：" + ex.getMessage());
      return "false";
    }
  }

  private String constantCondition(String op, Object left, Object right, Ctx ctx) {
    return switch (op) {
      case "eq" -> java.util.Objects.equals(normalizeValue(left), normalizeValue(right))
          ? "true" : "false";
      case "ne" -> !java.util.Objects.equals(normalizeValue(left), normalizeValue(right))
          ? "true" : "false";
      case "in" -> values(right).stream()
          .map(item -> normalizeValue(item))
          .anyMatch(item -> java.util.Objects.equals(item, normalizeValue(left)))
          ? "true" : "false";
      default -> throwUnsupported("常量比较不支持算子：" + op);
    };
  }

  // ---------------------------------------------------------------- helpers

  private Ctx context(PageView view, JsonNode entity, DataSourceQueryRequest request) {
    JsonNode page = view.page();
    ObjectNode state = request.state() == null
        ? initialState(page.path("state")) : json.valueToTree(request.state());
    ObjectNode pageRoot = json.createObjectNode();
    pageRoot.set("state", state);
    pageRoot.set("params", request.params() == null
        ? json.createObjectNode() : json.valueToTree(request.params()));
    ObjectNode route = json.createObjectNode();
    route.put("path", page.path("route").path("path").asText(""));
    route.set("query", request.routeQuery() == null
        ? json.createObjectNode() : json.valueToTree(request.routeQuery()));
    route.set("params", request.params() == null
        ? json.createObjectNode() : json.valueToTree(request.params()));
    ObjectNode ctxRoot = json.createObjectNode();
    ctxRoot.set("params", request.params() == null
        ? json.createObjectNode() : json.valueToTree(request.params()));
    ctxRoot.set("event", json.createObjectNode());
    ctxRoot.set("vars", json.createObjectNode());
    ctxRoot.putNull("result");
    ctxRoot.putNull("error");
    ObjectNode data = request.data() == null
        ? json.createObjectNode() : json.valueToTree(request.data());
    ExpressionEngine.Scope scope = expressions.newScope(Map.of(
        "user", permissions.userRoot(),
        "tenant", permissions.tenantRoot(),
        "page", pageRoot,
        "route", route,
        "data", data,
        "ctx", ctxRoot));
    JsonNode storage = entity.path("storage");
    String softDelete = storage.path("softDelete").path("enabled").asBoolean(false)
        ? storage.path("softDelete").path("column").asText(null) : null;
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", TenantContext.tenantId());
    return new Ctx(
        entity,
        text(entity, "tableName", null),
        text(storage, "primaryKey", "id"),
        text(storage, "tenantColumn", "tenant_id"),
        text(storage, "jsonbColumn", "ext"),
        softDelete,
        scope,
        params);
  }

  private ObjectNode initialState(JsonNode defs) {
    ObjectNode state = json.createObjectNode();
    if (defs.isObject()) {
      defs.fields().forEachRemaining(entry -> {
        if (entry.getValue().has("initial")) {
          state.set(entry.getKey(), entry.getValue().get("initial").deepCopy());
        }
      });
    }
    return state;
  }

  private static int requestedSize(JsonNode dataSource, DataSourceQueryRequest request) {
    int fallback = dataSource.path("page").path("pageSize").asInt(20);
    int max = dataSource.path("page").path("maxPageSize").asInt(200);
    return intValue(query(request, "size"), fallback, 1, Math.min(Math.max(max, 1), 1000));
  }

  private static int statePage(DataSourceQueryRequest request) {
    if (request.state() == null) {
      return 1;
    }
    Object query = request.state().get("query");
    if (query instanceof Map<?, ?> map && map.get("page") != null) {
      return intValue(map.get("page"), 1, 1, Integer.MAX_VALUE);
    }
    return 1;
  }

  private static Object query(DataSourceQueryRequest request, String key) {
    if (request == null || request.query() == null) {
      return null;
    }
    return request.query().get(key);
  }

  private static int intValue(Object value, int fallback, int min, int max) {
    if (value == null) {
      return Math.max(min, Math.min(max, fallback));
    }
    try {
      int parsed = value instanceof Number number
          ? number.intValue() : Integer.parseInt(String.valueOf(value));
      return Math.max(min, Math.min(max, parsed));
    } catch (NumberFormatException ex) {
      return Math.max(min, Math.min(max, fallback));
    }
  }

  private static JsonNode findDataSource(JsonNode page, String id) {
    if (page == null || id == null) {
      return null;
    }
    for (JsonNode dataSource : page.path("dataSources")) {
      if (id.equals(dataSource.path("id").asText())) {
        return dataSource;
      }
    }
    return null;
  }

  private static JsonNode findEntity(JsonNode bundle, String key) {
    if (bundle == null || key == null) {
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

  private static JsonNode field(JsonNode entity, String key) {
    if (entity == null || key == null) {
      return null;
    }
    for (JsonNode field : entity.path("fields")) {
      if (key.equals(field.path("key").asText())) {
        return field;
      }
    }
    JsonNode storage = entity.path("storage");
    JsonNode timestamps = storage.path("timestamps");
    var names = timestamps.fieldNames();
    while (names.hasNext()) {
      String name = names.next();
      if (key.equals(timestamps.path(name).asText())) {
        return systemField(key, switch (name) {
          case "createdAt", "updatedAt" -> "datetime";
          default -> "string";
        });
      }
    }
    JsonNode softDelete = storage.path("softDelete");
    if (softDelete.path("enabled").asBoolean(false)
        && key.equals(softDelete.path("column").asText())) {
      return systemField(key, "datetime");
    }
    return null;
  }

  private static JsonNode systemField(String key, String type) {
    ObjectNode field = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    field.put("key", key);
    field.put("type", type);
    field.put("storage", "column");
    return field;
  }

  private String fieldSql(JsonNode field, Ctx ctx) {
    String key = field.path("key").asText();
    if ("jsonb".equals(field.path("storage").asText("column"))) {
      if (ctx.jsonbColumn == null) {
        throw PlatformException.badRequest("jsonb_not_declared", "字段 " + key + " 使用 jsonb 存储但实体未声明 jsonbColumn");
      }
      String raw = "t." + q(ctx.jsonbColumn) + "->>'" + safeKey(key) + "'";
      return "(" + raw + ")" + castType(field.path("type").asText());
    }
    return "t." + q(key);
  }

  private String bind(Object value, JsonNode field, Ctx ctx) {
    String name = "p" + ctx.params.getValues().size();
    while (ctx.params.hasValue(name)) {
      name = name + "_";
    }
    ctx.params.addValue(name, normalizeValue(value));
    String marker = ":" + name;
    return field == null ? marker : castMarker(field.path("type").asText(), marker);
  }

  private String bindList(List<Object> values, Ctx ctx) {
    return bindList(values, null, ctx);
  }

  private String bindList(List<Object> values, JsonNode field, Ctx ctx) {
    List<String> marks = new ArrayList<>();
    for (Object value : values) {
      marks.add(bind(value, field, ctx));
    }
    return String.join(", ", marks);
  }

  private static String castMarker(String type, String marker) {
    return switch (type) {
      case "datetime" -> "cast(" + marker + " as timestamptz)";
      case "date" -> "cast(" + marker + " as date)";
      case "time" -> "cast(" + marker + " as time)";
      case "decimal", "number" -> "cast(" + marker + " as numeric)";
      case "integer" -> "cast(" + marker + " as integer)";
      case "boolean" -> "cast(" + marker + " as boolean)";
      default -> marker;
    };
  }

  private static String castType(String type) {
    return switch (type) {
      case "datetime" -> "::timestamptz";
      case "date" -> "::date";
      case "time" -> "::time";
      case "decimal", "number" -> "::numeric";
      case "integer" -> "::integer";
      case "boolean" -> "::boolean";
      default -> "";
    };
  }

  private static String safeKey(String key) {
    if (key == null || !key.matches("[A-Za-z_][A-Za-z0-9_]*")) {
      throw PlatformException.badRequest("invalid_field", "非法字段标识：" + key);
    }
    return key;
  }

  private static String q(String identifier) {
    if (identifier == null || !identifier.matches("[A-Za-z_][A-Za-z0-9_]*")) {
      throw PlatformException.badRequest("invalid_identifier", "非法标识符：" + identifier);
    }
    return identifier;
  }

  private Map<String, Object> mapRow(
      JsonNode entity, List<String> fields, Map<String, Object> raw) {
    Map<String, Object> row = new LinkedHashMap<>();
    for (String key : fields) {
      Object value = raw.get(key);
      if (value != null) {
        row.put(key, normalizeValue(value));
      }
    }
    return row;
  }

  private static Object normalizeValue(Object value) {
    if (value instanceof Timestamp ts) {
      return ts.toInstant().atZone(ZONE).toOffsetDateTime();
    }
    if (value instanceof java.sql.Date date) {
      return date.toLocalDate().toString();
    }
    if (value instanceof java.sql.Time time) {
      return time.toLocalTime().toString();
    }
    if (value instanceof LocalDate date) {
      return date.toString();
    }
    if (value instanceof BigDecimal decimal) {
      return decimal.stripTrailingZeros();
    }
    if (value instanceof String text) {
      return text.stripTrailing();
    }
    return value;
  }

  private static boolean isEmptyValue(Object value) {
    if (value == null) {
      return true;
    }
    if (value instanceof String text) {
      return text.isBlank();
    }
    if (value instanceof java.util.Collection<?> collection) {
      return collection.isEmpty();
    }
    if (value instanceof Map<?, ?> map) {
      return map.isEmpty();
    }
    return value.getClass().isArray() && java.lang.reflect.Array.getLength(value) == 0;
  }

  private static List<Object> values(JsonNode node) {
    List<Object> out = new ArrayList<>();
    if (node == null || node.isNull()) {
      return out;
    }
    if (node.isArray()) {
      for (JsonNode item : node) {
        out.add(plain(item));
      }
    } else {
      out.add(plain(node));
    }
    return out;
  }

  private static List<Object> values(Object value) {
    List<Object> out = new ArrayList<>();
    if (value == null) {
      return out;
    }
    if (value instanceof JsonNode node) {
      return values(node);
    }
    if (value instanceof java.util.Collection<?> collection) {
      out.addAll(collection);
      return out;
    }
    if (value.getClass().isArray()) {
      int length = java.lang.reflect.Array.getLength(value);
      for (int index = 0; index < length; index++) {
        out.add(java.lang.reflect.Array.get(value, index));
      }
      return out;
    }
    if (value instanceof String text) {
      for (String item : text.split(",")) {
        if (!item.isBlank()) {
          out.add(item.strip());
        }
      }
      return out;
    }
    out.add(value);
    return out;
  }

  private static List<Object> betweenValues(Object value, String type) {
    List<Object> source = values(value);
    if (source.size() >= 2) {
      return List.of(source.get(0), source.get(1));
    }
    if (value instanceof Map<?, ?> map) {
      Object start = map.get("start");
      Object end = map.get("end");
      if (start != null && end != null) {
        return List.of(start, end);
      }
    }
    return source;
  }

  private static String likePattern(Object value, boolean startsWith) {
    String text = String.valueOf(normalizeValue(value));
    String slash = Character.toString((char) 92);
    String escaped = text.replace(slash, slash + slash).replace("%", slash + "%").replace("_", slash + "_");
    return startsWith ? escaped + "%" : "%" + escaped + "%";
  }

  private static String operator(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    for (String key : OPERATORS) {
      if (node.has(key)) {
        return key;
      }
    }
    return null;
  }

  private static Object plain(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return null;
    }
    if (node.isBoolean()) {
      return node.booleanValue();
    }
    if (node.isNumber()) {
      return node.numberValue();
    }
    if (node.isTextual()) {
      return node.asText();
    }
    return node;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> objectMap(JsonNode node) {
    if (node == null || node.isNull()) {
      return Map.of();
    }
    return node.isObject() ? json.convertValue(node, Map.class) : Map.of();
  }

  private static JsonNode first(JsonNode args) {
    return arg(args, 0);
  }

  private static JsonNode arg(JsonNode args, int index) {
    return args != null && args.isArray() && index >= 0 && index < args.size()
        ? args.get(index) : null;
  }

  private static String text(JsonNode node, String field, String fallback) {
    String value = node == null ? null : node.path(field).asText(null);
    return value == null || value.isBlank() ? fallback : value;
  }

  private <T> T throwUnsupported(String message) {
    throw PlatformException.badRequest("unsupported_query_expression", message);
  }

  private record Term(JsonNode field, Object value) {
    boolean column() {
      return field != null;
    }
  }

  private record Ctx(
      JsonNode entity,
      String table,
      String idColumn,
      String tenantColumn,
      String jsonbColumn,
      String softDeleteColumn,
      ExpressionEngine.Scope scope,
      MapSqlParameterSource params) {

    String tenantCondition() {
      return "t." + q(tenantColumn) + " = :tenant";
    }
  }
}
