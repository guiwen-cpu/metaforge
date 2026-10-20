package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * 安全表达式求值器。语义唯一来源是 schema/expression-registry.json：
 * 函数名、元数、纯函数标记均取自 {@link ExpressionCatalog}；本类只实现其行为。
 *
 * <p>求值规则：普通对象/数组逐层求值；仅当对象恰好含一个已知算子键
 * （$lit / $ref / $fn / $tpl / $if）时才按表达式解释。缺失的属性路径返回 null，
 * 语法或类型错误抛 {@link ExpressionException}。
 */
@Component
public class ExpressionEngine {

  private static final Set<String> OPERATORS = Set.of("$lit", "$ref", "$fn", "$tpl", "$if");
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private static final MathContext MATH = MathContext.DECIMAL128;
  private static final String DEFAULT_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

  private final ExpressionCatalog catalog;
  private final ObjectMapper json;
  private final JsonNodeFactory nodes;
  private final List<RuntimeFunctionProvider> providers;

  public ExpressionEngine(
      ExpressionCatalog catalog,
      ObjectMapper json,
      List<RuntimeFunctionProvider> providers) {
    this.catalog = catalog;
    this.json = json;
    this.nodes = json.getNodeFactory();
    this.providers = providers == null ? List.of() : List.copyOf(providers);
  }

  // ------------------------------------------------------------------ scope

  /** 一次动作链共享的作用域。$now 在创建时冻结；子作用域用于 filter/map 的 $item/$index。 */
  public static final class Scope {

    private final Scope parent;
    private final Map<String, JsonNode> roots = new LinkedHashMap<>();
    private final Map<String, Object> attachments = new HashMap<>();
    private final ZoneId zone;
    private final String now;

    private Scope(Scope parent, ZoneId zone, String now) {
      this.parent = parent;
      this.zone = zone;
      this.now = now;
    }

    static Scope root(ZoneId zone, String now) {
      return new Scope(null, zone, now);
    }

    public JsonNode root(String name) {
      JsonNode local = roots.get(name);
      if (local != null) {
        return local;
      }
      return parent == null ? null : parent.root(name);
    }

    public boolean has(String name) {
      return roots.containsKey(name) || (parent != null && parent.has(name));
    }

    public void put(String name, JsonNode value) {
      roots.put(name, value == null ? JsonNodeFactory.instance.nullNode() : value);
    }

    public Object attachment(String key) {
      if (attachments.containsKey(key)) {
        return attachments.get(key);
      }
      return parent == null ? null : parent.attachment(key);
    }

    public void attach(String key, Object value) {
      attachments.put(key, value);
    }

    public Scope child() {
      return new Scope(this, zone, now);
    }

    public ZoneId zone() {
      return zone;
    }

    public String now() {
      return now;
    }

    public Map<String, JsonNode> roots() {
      return roots;
    }

    /** 从根到当前层展开所有作用域，用于并行分支的快照与差异合并。 */
    public Map<String, JsonNode> flattenedRoots() {
      Map<String, JsonNode> all = new LinkedHashMap<>();
      if (parent != null) {
        all.putAll(parent.flattenedRoots());
      }
      all.putAll(roots);
      return all;
    }
  }

  public Scope newScope() {
    return newScope(null);
  }

  /**
   * 创建动作链作用域。overrides 的键不带 $（如 user / tenant / page），
   * 未提供的根使用运行时安全默认值。
   */
  public Scope newScope(Map<String, JsonNode> overrides) {
    String now = OffsetDateTime.now(ZONE).toString();
    Scope scope = Scope.root(ZONE, now);
    scope.put("user", nodes.objectNode());
    scope.put("tenant", nodes.objectNode());
    scope.put("env", defaultEnv());
    scope.put("now", nodes.textNode(now));
    scope.put("page", defaultPage());
    scope.put("route", defaultRoute());
    scope.put("form", nodes.nullNode());
    scope.put("row", nodes.nullNode());
    scope.put("rows", nodes.arrayNode());
    scope.put("data", nodes.objectNode());
    scope.put("process", nodes.nullNode());
    scope.put("ctx", defaultCtx());
    scope.put("component", nodes.nullNode());
    scope.put("res", nodes.nullNode());
    if (overrides != null) {
      overrides.forEach((key, value) -> {
        if (key != null && !key.isBlank()) {
          scope.put(key.startsWith("$") ? key.substring(1) : key, value);
        }
      });
    }
    return scope;
  }

  private ObjectNode defaultEnv() {
    ObjectNode env = nodes.objectNode();
    env.put("platform", "server");
    env.put("locale", "zh-CN");
    env.put("timezone", ZONE.getId());
    env.put("mode", "runtime");
    return env;
  }

  private ObjectNode defaultPage() {
    ObjectNode page = nodes.objectNode();
    page.set("state", nodes.objectNode());
    page.set("params", nodes.objectNode());
    page.set("query", nodes.objectNode());
    return page;
  }

  private ObjectNode defaultRoute() {
    ObjectNode route = nodes.objectNode();
    route.put("path", "");
    route.set("query", nodes.objectNode());
    route.set("params", nodes.objectNode());
    return route;
  }

  private ObjectNode defaultCtx() {
    ObjectNode ctx = nodes.objectNode();
    ctx.set("params", nodes.objectNode());
    ctx.set("event", nodes.objectNode());
    ctx.set("vars", nodes.objectNode());
    ctx.putNull("result");
    ctx.putNull("error");
    ctx.put("actionKey", "");
    ctx.put("stepIndex", -1);
    return ctx;
  }

  // ------------------------------------------------------------- evaluation

  public JsonNode eval(JsonNode expr, Scope scope) {
    if (expr == null) {
      return nodes.nullNode();
    }
    String op = operator(expr);
    if (op == null) {
      return deepValue(expr, scope);
    }
    return switch (op) {
      case "$lit" -> expr.get("$lit").deepCopy();
      case "$ref" -> reference(expr, scope);
      case "$tpl" -> template(expr, scope);
      case "$if" -> conditional(expr, scope);
      case "$fn" -> function(expr, scope);
      default -> throw new ExpressionException("bad_expression", "未知表达式算子：" + op);
    };
  }

  /** 普通对象/数组逐层求值；表达式对象只求自身。 */
  public JsonNode deepValue(JsonNode node, Scope scope) {
    if (node == null) {
      return nodes.nullNode();
    }
    if (operator(node) != null) {
      return eval(node, scope);
    }
    if (node.isObject()) {
      ObjectNode out = nodes.objectNode();
      Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
      while (fields.hasNext()) {
        Map.Entry<String, JsonNode> field = fields.next();
        out.set(field.getKey(), deepValue(field.getValue(), scope));
      }
      return out;
    }
    if (node.isArray()) {
      ArrayNode out = nodes.arrayNode();
      for (JsonNode item : node) {
        out.add(deepValue(item, scope));
      }
      return out;
    }
    return node;
  }

  private String operator(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    String found = null;
    int count = 0;
    Iterator<String> names = node.fieldNames();
    while (names.hasNext()) {
      String name = names.next();
      if (OPERATORS.contains(name)) {
        found = name;
        count++;
      }
    }
    return count == 1 ? found : null;
  }

  private JsonNode reference(JsonNode expr, Scope scope) {
    JsonNode value = expr.get("$ref");
    if (value == null || !value.isTextual() || value.asText().isBlank()) {
      throw new ExpressionException("bad_ref", "$ref 必须是字符串路径");
    }
    return reference(value.asText(), scope);
  }

  public JsonNode reference(String path, Scope scope) {
    if (path == null || !path.startsWith("$")) {
      throw new ExpressionException("bad_ref", "取值路径必须以 $ 开头：" + path);
    }
    List<String> segments = parsePath(path.substring(1));
    if (segments.isEmpty()) {
      throw new ExpressionException("bad_ref", "取值路径缺少根：" + path);
    }
    String root = segments.remove(0);
    if (!catalog.isRoot("$" + root) && !scope.has(root)) {
      throw new ExpressionException("unknown_root", "未注册的取值根：$" + root);
    }
    JsonNode current = scope.root(root);
    for (String segment : segments) {
      current = step(current, segment);
      if (current == null) {
        return nodes.nullNode();
      }
    }
    return current == null ? nodes.nullNode() : current;
  }

  private JsonNode template(JsonNode expr, Scope scope) {
    JsonNode parts = expr.get("$tpl");
    if (parts == null || !parts.isArray()) {
      throw new ExpressionException("bad_expression", "$tpl 必须是数组");
    }
    StringBuilder out = new StringBuilder();
    for (JsonNode part : parts) {
      if (part.isTextual()) {
        out.append(part.asText());
      } else {
        out.append(stringify(eval(part, scope)));
      }
    }
    return nodes.textNode(out.toString());
  }

  private JsonNode conditional(JsonNode expr, Scope scope) {
    if (!expr.has("$then")) {
      throw new ExpressionException("bad_expression", "$if 缺少 $then");
    }
    if (truthy(eval(expr.get("$if"), scope))) {
      return eval(expr.get("$then"), scope);
    }
    return expr.has("$else") ? eval(expr.get("$else"), scope) : nodes.nullNode();
  }

  private JsonNode function(JsonNode expr, Scope scope) {
    JsonNode nameNode = expr.get("$fn");
    if (nameNode == null || !nameNode.isTextual() || nameNode.asText().isBlank()) {
      throw new ExpressionException("bad_expression", "$fn 必须是函数名");
    }
    String name = nameNode.asText();
    ExpressionCatalog.FunctionDef def = catalog.require(name);
    JsonNode argsNode = expr.get("$args");
    if (argsNode != null && !argsNode.isArray()) {
      throw new ExpressionException("bad_expression", "$args 必须是数组：" + name);
    }
    List<JsonNode> rawArgs = new ArrayList<>();
    if (argsNode != null) {
      argsNode.forEach(rawArgs::add);
    }
    catalog.checkArity(def, rawArgs.size());

    return switch (name) {
      case "and" -> shortAnd(rawArgs, scope);
      case "or" -> shortOr(rawArgs, scope);
      case "if" -> shortIf(rawArgs, scope);
      case "coalesce" -> shortCoalesce(rawArgs, scope);
      case "default" -> shortDefault(rawArgs, scope);
      case "filter" -> filter(rawArgs, scope);
      case "map" -> map(rawArgs, scope);
      default -> apply(name, evaluate(rawArgs, scope), scope);
    };
  }

  private List<JsonNode> evaluate(List<JsonNode> rawArgs, Scope scope) {
    List<JsonNode> out = new ArrayList<>(rawArgs.size());
    for (JsonNode arg : rawArgs) {
      out.add(eval(arg, scope));
    }
    return out;
  }

  private JsonNode shortAnd(List<JsonNode> args, Scope scope) {
    for (JsonNode arg : args) {
      if (!truthy(eval(arg, scope))) {
        return nodes.booleanNode(false);
      }
    }
    return nodes.booleanNode(true);
  }

  private JsonNode shortOr(List<JsonNode> args, Scope scope) {
    for (JsonNode arg : args) {
      if (truthy(eval(arg, scope))) {
        return nodes.booleanNode(true);
      }
    }
    return nodes.booleanNode(false);
  }

  private JsonNode shortIf(List<JsonNode> args, Scope scope) {
    return truthy(eval(args.get(0), scope)) ? eval(args.get(1), scope) : eval(args.get(2), scope);
  }

  private JsonNode shortCoalesce(List<JsonNode> args, Scope scope) {
    for (JsonNode arg : args) {
      JsonNode value = eval(arg, scope);
      if (!isNull(value)) {
        return value;
      }
    }
    return nodes.nullNode();
  }

  private JsonNode shortDefault(List<JsonNode> args, Scope scope) {
    JsonNode value = eval(args.get(0), scope);
    return isEmpty(value) ? eval(args.get(1), scope) : value;
  }

  private JsonNode filter(List<JsonNode> args, Scope scope) {
    ArrayNode source = requireArray(eval(args.get(0), scope), "filter");
    JsonNode predicate = args.get(1);
    ArrayNode out = nodes.arrayNode();
    for (int i = 0; i < source.size(); i++) {
      Scope child = scope.child();
      child.put("item", source.get(i));
      child.put("index", nodes.numberNode(i));
      if (truthy(eval(predicate, child))) {
        out.add(source.get(i));
      }
    }
    return out;
  }

  private JsonNode map(List<JsonNode> args, Scope scope) {
    ArrayNode source = requireArray(eval(args.get(0), scope), "map");
    JsonNode mapper = args.get(1);
    ArrayNode out = nodes.arrayNode();
    for (int i = 0; i < source.size(); i++) {
      Scope child = scope.child();
      child.put("item", source.get(i));
      child.put("index", nodes.numberNode(i));
      out.add(eval(mapper, child));
    }
    return out;
  }

  // ---------------------------------------------------------------- function

  private JsonNode apply(String name, List<JsonNode> a, Scope scope) {
    return switch (name) {
      // comparison
      case "eq" -> nodes.booleanNode(deepEquals(a.get(0), a.get(1)));
      case "ne" -> nodes.booleanNode(!deepEquals(a.get(0), a.get(1)));
      case "lt" -> compareResult(a, scope, c -> c < 0);
      case "lte" -> compareResult(a, scope, c -> c <= 0);
      case "gt" -> compareResult(a, scope, c -> c > 0);
      case "gte" -> compareResult(a, scope, c -> c >= 0);
      case "between" -> nodes.booleanNode(compare(a.get(0), a.get(1), scope) >= 0
          && compare(a.get(0), a.get(2), scope) <= 0);
      case "in" -> nodes.booleanNode(in(a.get(0), requireArray(a.get(1), "in")));
      case "notIn" -> nodes.booleanNode(!in(a.get(0), requireArray(a.get(1), "notIn")));
      case "like" -> nodes.booleanNode(like(text(a.get(0)), text(a.get(1))));
      case "startsWith" -> nodes.booleanNode(text(a.get(0)).startsWith(text(a.get(1))));
      case "endsWith" -> nodes.booleanNode(text(a.get(0)).endsWith(text(a.get(1))));
      case "isNull" -> nodes.booleanNode(isNull(a.get(0)));
      case "isNotNull" -> nodes.booleanNode(!isNull(a.get(0)));
      case "isEmpty" -> nodes.booleanNode(isEmpty(a.get(0)));
      case "isNotEmpty" -> nodes.booleanNode(!isEmpty(a.get(0)));

      // logic
      case "not" -> nodes.booleanNode(!truthy(a.get(0)));

      // math
      case "add" -> numberNode(sumOf(a));
      case "sub" -> numberNode(decimal(a.get(0), "sub").subtract(decimal(a.get(1), "sub"), MATH));
      case "mul" -> numberNode(productOf(a));
      case "div" -> divide(a.get(0), a.get(1));
      case "mod" -> modulo(a.get(0), a.get(1));
      case "round" -> numberNode(decimal(a.get(0), "round")
          .setScale(a.size() > 1 ? intValue(a.get(1), "round") : 0, RoundingMode.HALF_UP));
      case "floor" -> numberNode(decimal(a.get(0), "floor").setScale(0, RoundingMode.FLOOR));
      case "ceil" -> numberNode(decimal(a.get(0), "ceil").setScale(0, RoundingMode.CEILING));
      case "abs" -> numberNode(decimal(a.get(0), "abs").abs());
      case "min" -> extrema(a, true);
      case "max" -> extrema(a, false);
      case "sum" -> aggregate(a, Aggregate.SUM);
      case "avg" -> aggregate(a, Aggregate.AVG);

      // string
      case "concat" -> nodes.textNode(concat(a));
      case "upper" -> nodes.textNode(text(a.get(0)).toUpperCase(Locale.ROOT));
      case "lower" -> nodes.textNode(text(a.get(0)).toLowerCase(Locale.ROOT));
      case "trim" -> nodes.textNode(text(a.get(0)).trim());
      case "substr" -> nodes.textNode(substr(text(a.get(0)), intValue(a.get(1), "substr"),
          a.size() > 2 ? intValue(a.get(2), "substr") : null));
      case "replace" -> nodes.textNode(text(a.get(0)).replace(text(a.get(1)), text(a.get(2))));
      case "split" -> split(text(a.get(0)), text(a.get(1)));
      case "join" -> join(a);
      case "padStart" -> nodes.textNode(pad(text(a.get(0)), intValue(a.get(1), "padStart"),
          text(a.get(2)), true));
      case "padEnd" -> nodes.textNode(pad(text(a.get(0)), intValue(a.get(1), "padEnd"),
          text(a.get(2)), false));
      case "len" -> nodes.numberNode(length(a.get(0)));
      case "indexOf" -> nodes.numberNode(text(a.get(0)).indexOf(text(a.get(1))));
      case "format" -> nodes.textNode(format(text(a.get(0)), a));

      // array
      case "first" -> element(a.get(0), 0);
      case "last" -> element(a.get(0), -1);
      case "nth" -> element(a.get(0), intValue(a.get(1), "nth"));
      case "slice" -> slice(a);
      case "sort" -> sort(a, scope);
      case "reverse" -> reverse(a.get(0));
      case "unique" -> unique(a, scope, "unique");
      case "flatten" -> flatten(requireArray(a.get(0), "flatten"),
          a.size() > 1 ? intValue(a.get(1), "flatten") : 1);
      case "groupBy" -> groupBy(a, scope);
      case "pluck" -> pluck(a, scope);
      case "size" -> nodes.numberNode(length(a.get(0)));

      // object
      case "get" -> get(a);
      case "has" -> nodes.booleanNode(resolve(a.get(0), parsePath(text(a.get(1)))) != null);
      case "keys" -> keys(a.get(0));
      case "values" -> values(a.get(0));
      case "merge" -> merge(a);

      // type
      case "toNumber" -> toNumber(a);
      case "toString" -> a.get(0).isNull() && a.size() > 1 && !a.get(1).isNull()
          ? a.get(1) : nodes.textNode(stringify(a.get(0)));
      case "toBool" -> nodes.booleanNode(truthy(a.get(0)));
      case "toDate" -> toDate(a);
      case "toArray" -> toArray(a.get(0));
      case "typeOf" -> nodes.textNode(typeOf(a.get(0)));

      // date
      case "now" -> nodes.textNode(scope.now());
      case "today" -> nodes.textNode(LocalDate.now(scope.zone()).toString());
      case "dateAdd" -> dateAdd(a, scope);
      case "dateDiff" -> nodes.numberNode(dateDiff(a, scope));
      case "formatDate" -> formatDate(a, scope);
      case "startOf" -> boundary(a, scope, true);
      case "endOf" -> boundary(a, scope, false);
      case "year" -> nodes.numberNode(temporal(a.get(0), scope).localDate().getYear());
      case "month" -> nodes.numberNode(temporal(a.get(0), scope).localDate().getMonthValue());
      case "day" -> nodes.numberNode(temporal(a.get(0), scope).localDate().getDayOfMonth());

      // security
      case "maskIdCard" -> nodes.textNode(maskIdCard(text(a.get(0)),
          a.size() > 1 ? intValue(a.get(1), "maskIdCard") : 6));
      case "maskPhone" -> nodes.textNode(maskPhone(text(a.get(0))));
      case "maskName" -> nodes.textNode(maskName(text(a.get(0))));
      case "maskEmail" -> nodes.textNode(maskEmail(text(a.get(0))));
      case "hash" -> nodes.textNode(hash(text(a.get(0)),
          a.size() > 1 ? text(a.get(1)) : "sha256"));
      case "uuid" -> nodes.textNode(UUID.randomUUID().toString());

      // data
      case "lookup" -> lookup(a, scope);
      case "entityField" -> external(name, a, scope);

      // flow (运行时上下文内的只读投影)
      case "processVariable" -> processVariable(a, scope);
      case "taskAssignee" -> taskAssignee(a, scope);
      case "isTaskClaimed" -> nodes.booleanNode(taskClaimed(scope));

      // file
      case "fileName" -> nodes.textNode(fileName(a.get(0)));
      case "fileExt" -> nodes.textNode(fileExt(fileName(a.get(0))));
      case "fileSize" -> fileSize(a.get(0));
      case "fileUrl" -> nodes.textNode(fileUrl(a.get(0)));

      default -> external(name, a, scope);
    };
  }

  private JsonNode external(String name, List<JsonNode> args, Scope scope) {
    for (RuntimeFunctionProvider provider : providers) {
      if (provider.supports(name)) {
        return provider.invoke(name, args, scope);
      }
    }
    throw new ExpressionException("unsupported_function", "函数 " + name + " 需要运行时提供者：" + name);
  }

  // --------------------------------------------------------------- operators

  private JsonNode compareResult(List<JsonNode> args, Scope scope, java.util.function.IntPredicate test) {
    JsonNode left = args.get(0);
    JsonNode right = args.get(1);
    if (isNull(left) || isNull(right)) {
      return nodes.booleanNode(false);
    }
    return nodes.booleanNode(test.test(compare(left, right, scope)));
  }

  private int compare(JsonNode left, JsonNode right, Scope scope) {
    if (left.isNumber() && right.isNumber()) {
      return left.decimalValue().compareTo(right.decimalValue());
    }
    if (left.isTextual() && right.isTextual()) {
      TemporalValue l = tryTemporal(left.asText(), scope);
      TemporalValue r = tryTemporal(right.asText(), scope);
      if (l != null && r != null) {
        return l.instant(scope.zone()).compareTo(r.instant(scope.zone()));
      }
    }
    if (left.isBoolean() && right.isBoolean()) {
      return Boolean.compare(left.booleanValue(), right.booleanValue());
    }
    return stringify(left).compareTo(stringify(right));
  }

  private boolean contains(ArrayNode array, JsonNode value) {
    for (JsonNode item : array) {
      if (deepEquals(item, value)) {
        return true;
      }
    }
    return false;
  }

  /** 左侧为数组时按交集判断，兼容 {@code in($user.roleKeys, [...])} 的权限写法。 */
  private boolean in(JsonNode value, ArrayNode array) {
    if (value != null && value.isArray()) {
      for (JsonNode item : value) {
        if (contains(array, item)) {
          return true;
        }
      }
      return false;
    }
    return contains(array, value);
  }

  private boolean like(String value, String pattern) {
    StringBuilder regex = new StringBuilder("^");
    for (int i = 0; i < pattern.length(); i++) {
      char c = pattern.charAt(i);
      if (c == '%') {
        regex.append(".*");
      } else if (c == '_') {
        regex.append('.');
      } else if ("\\.[]{}()+-^$|?".indexOf(c) >= 0) {
        regex.append('\\').append(c);
      } else {
        regex.append(c);
      }
    }
    regex.append('$');
    return Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE | Pattern.DOTALL)
        .matcher(value).matches();
  }

  // ------------------------------------------------------------------- math

  private BigDecimal sumOf(List<JsonNode> args) {
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode arg : args) {
      total = total.add(decimal(arg, "add"), MATH);
    }
    return total;
  }

  private BigDecimal productOf(List<JsonNode> args) {
    BigDecimal total = BigDecimal.ONE;
    for (JsonNode arg : args) {
      total = total.multiply(decimal(arg, "mul"), MATH);
    }
    return total;
  }

  private JsonNode divide(JsonNode left, JsonNode right) {
    BigDecimal divisor = decimal(right, "div");
    if (divisor.signum() == 0) {
      return nodes.nullNode();
    }
    return numberNode(decimal(left, "div").divide(divisor, MATH));
  }

  private JsonNode modulo(JsonNode left, JsonNode right) {
    BigDecimal divisor = decimal(right, "mod");
    if (divisor.signum() == 0) {
      return nodes.nullNode();
    }
    return numberNode(new BigDecimal(
        decimal(left, "mod").toBigInteger().remainder(divisor.toBigInteger())));
  }

  private JsonNode extrema(List<JsonNode> args, boolean minimum) {
    List<JsonNode> values = new ArrayList<>();
    if (args.size() == 1 && args.get(0).isArray()) {
      args.get(0).forEach(values::add);
    } else {
      values.addAll(args);
    }
    if (values.isEmpty()) {
      return nodes.nullNode();
    }
    BigDecimal best = null;
    for (JsonNode value : values) {
      BigDecimal current = decimal(value, minimum ? "min" : "max");
      if (best == null || (minimum ? current.compareTo(best) < 0 : current.compareTo(best) > 0)) {
        best = current;
      }
    }
    return numberNode(best);
  }

  private enum Aggregate { SUM, AVG }

  private JsonNode aggregate(List<JsonNode> args, Aggregate kind) {
    ArrayNode rows = requireArray(args.get(0), kind == Aggregate.SUM ? "sum" : "avg");
    String field = args.size() > 1 ? text(args.get(1)) : null;
    BigDecimal total = BigDecimal.ZERO;
    int count = 0;
    for (JsonNode row : rows) {
      JsonNode value = field == null || field.isBlank() ? row : resolve(row, parsePath(field));
      if (value == null || value.isNull()) {
        continue;
      }
      total = total.add(decimal(value, kind == Aggregate.SUM ? "sum" : "avg"), MATH);
      count++;
    }
    if (kind == Aggregate.AVG) {
      return count == 0 ? nodes.nullNode() : numberNode(total.divide(BigDecimal.valueOf(count), MATH));
    }
    return numberNode(total);
  }

  // ----------------------------------------------------------------- string

  private String concat(List<JsonNode> args) {
    StringBuilder out = new StringBuilder();
    for (JsonNode arg : args) {
      out.append(stringify(arg));
    }
    return out.toString();
  }

  private String substr(String value, int start, Integer length) {
    int size = value.length();
    int from = start < 0 ? Math.max(0, size + start) : Math.min(start, size);
    int to = length == null ? size : Math.min(size, from + Math.max(0, length));
    return value.substring(from, Math.max(from, to));
  }

  private JsonNode split(String value, String separator) {
    ArrayNode out = nodes.arrayNode();
    if (separator.isEmpty()) {
      value.codePoints().forEach(cp -> out.add(new String(Character.toChars(cp))));
      return out;
    }
    for (String part : value.split(Pattern.quote(separator), -1)) {
      out.add(part);
    }
    return out;
  }

  private JsonNode join(List<JsonNode> args) {
    ArrayNode array = requireArray(args.get(0), "join");
    String separator = args.size() > 1 ? text(args.get(1)) : ",";
    String field = args.size() > 2 ? text(args.get(2)) : null;
    List<String> values = new ArrayList<>();
    for (JsonNode item : array) {
      JsonNode value = field == null || field.isBlank() ? item : resolve(item, parsePath(field));
      values.add(stringify(value));
    }
    return nodes.textNode(String.join(separator, values));
  }

  private String pad(String value, int target, String filler, boolean start) {
    if (filler.isEmpty() || value.length() >= target) {
      return value;
    }
    StringBuilder padding = new StringBuilder();
    while (padding.length() < target - value.length()) {
      padding.append(filler);
    }
    String clipped = padding.substring(0, target - value.length());
    return start ? clipped + value : value + clipped;
  }

  private int length(JsonNode value) {
    if (value == null || value.isNull()) {
      return 0;
    }
    if (value.isTextual()) {
      return value.asText().codePointCount(0, value.asText().length());
    }
    if (value.isArray() || value.isObject()) {
      return value.size();
    }
    return 0;
  }

  private String format(String pattern, List<JsonNode> args) {
    String out = pattern;
    for (int i = 1; i < args.size(); i++) {
      out = out.replace("{" + (i - 1) + "}", stringify(args.get(i)));
    }
    return out;
  }

  // ------------------------------------------------------------------ array

  private JsonNode element(JsonNode value, int index) {
    ArrayNode array = requireArray(value, "array");
    int resolved = index < 0 ? array.size() + index : index;
    return resolved >= 0 && resolved < array.size() ? array.get(resolved) : nodes.nullNode();
  }

  private JsonNode slice(List<JsonNode> args) {
    ArrayNode array = requireArray(args.get(0), "slice");
    int size = array.size();
    int start = intValue(args.get(1), "slice");
    int end = args.size() > 2 ? intValue(args.get(2), "slice") : size;
    int from = start < 0 ? Math.max(0, size + start) : Math.min(start, size);
    int to = end < 0 ? Math.max(0, size + end) : Math.min(end, size);
    ArrayNode out = nodes.arrayNode();
    for (int i = from; i < to; i++) {
      out.add(array.get(i));
    }
    return out;
  }

  private JsonNode sort(List<JsonNode> args, Scope scope) {
    ArrayNode source = requireArray(args.get(0), "sort");
    String field = null;
    String direction = "asc";
    if (args.size() > 1) {
      String second = text(args.get(1));
      if ("asc".equalsIgnoreCase(second) || "desc".equalsIgnoreCase(second)) {
        direction = second;
      } else if (!second.isBlank()) {
        field = second;
      }
    }
    if (args.size() > 2 && !text(args.get(2)).isBlank()) {
      direction = text(args.get(2));
    }
    boolean desc = "desc".equalsIgnoreCase(direction);
    final String sortField = field;
    List<JsonNode> values = new ArrayList<>();
    source.forEach(values::add);
    Comparator<JsonNode> comparator = (left, right) -> {
      JsonNode l = sortField == null ? left : resolve(left, parsePath(sortField));
      JsonNode r = sortField == null ? right : resolve(right, parsePath(sortField));
      if (isNull(l)) {
        return isNull(r) ? 0 : 1;
      }
      if (isNull(r)) {
        return -1;
      }
      return compare(l, r, scope);
    };
    if (desc) {
      comparator = comparator.reversed();
    }
    values.sort(comparator);
    ArrayNode out = nodes.arrayNode();
    values.forEach(out::add);
    return out;
  }

  private JsonNode reverse(JsonNode value) {
    ArrayNode source = requireArray(value, "reverse");
    ArrayNode out = nodes.arrayNode();
    for (int i = source.size() - 1; i >= 0; i--) {
      out.add(source.get(i));
    }
    return out;
  }

  private JsonNode unique(List<JsonNode> args, Scope scope, String fn) {
    ArrayNode source = requireArray(args.get(0), fn);
    String field = args.size() > 1 ? text(args.get(1)) : null;
    Map<String, JsonNode> seen = new LinkedHashMap<>();
    for (JsonNode item : source) {
      JsonNode value = field == null || field.isBlank() ? item : resolve(item, parsePath(field));
      seen.putIfAbsent(canonical(value), item);
    }
    ArrayNode out = nodes.arrayNode();
    seen.values().forEach(out::add);
    return out;
  }

  private JsonNode flatten(ArrayNode source, int depth) {
    ArrayNode out = nodes.arrayNode();
    flattenInto(source, Math.max(0, depth), out);
    return out;
  }

  private void flattenInto(ArrayNode source, int depth, ArrayNode out) {
    for (JsonNode item : source) {
      if (depth > 0 && item.isArray()) {
        flattenInto((ArrayNode) item, depth - 1, out);
      } else {
        out.add(item);
      }
    }
  }

  private JsonNode groupBy(List<JsonNode> args, Scope scope) {
    ArrayNode source = requireArray(args.get(0), "groupBy");
    String field = text(args.get(1));
    ObjectNode out = nodes.objectNode();
    for (JsonNode item : source) {
      JsonNode value = resolve(item, parsePath(field));
      String key = stringify(value);
      ArrayNode group = out.has(key) ? (ArrayNode) out.get(key) : nodes.arrayNode();
      group.add(item);
      out.set(key, group);
    }
    return out;
  }

  private JsonNode pluck(List<JsonNode> args, Scope scope) {
    ArrayNode source = requireArray(args.get(0), "pluck");
    String field = text(args.get(1));
    ArrayNode out = nodes.arrayNode();
    for (JsonNode item : source) {
      out.add(resolve(item, parsePath(field)));
    }
    return out;
  }

  // ----------------------------------------------------------------- object

  private JsonNode get(List<JsonNode> args) {
    JsonNode value = resolve(args.get(0), parsePath(text(args.get(1))));
    if (value != null) {
      return value;
    }
    return args.size() > 2 ? args.get(2) : nodes.nullNode();
  }

  private JsonNode keys(JsonNode value) {
    if (value == null || !value.isObject()) {
      return nodes.arrayNode();
    }
    ArrayNode out = nodes.arrayNode();
    value.fieldNames().forEachRemaining(out::add);
    return out;
  }

  private JsonNode values(JsonNode value) {
    if (value == null || !value.isObject()) {
      return nodes.arrayNode();
    }
    ArrayNode out = nodes.arrayNode();
    value.forEach(out::add);
    return out;
  }

  private JsonNode merge(List<JsonNode> args) {
    ObjectNode out = nodes.objectNode();
    for (JsonNode arg : args) {
      if (arg != null && arg.isObject()) {
        arg.fields().forEachRemaining(entry -> out.set(entry.getKey(), entry.getValue()));
      }
    }
    return out;
  }

  // ------------------------------------------------------------------- type

  private JsonNode toNumber(List<JsonNode> args) {
    JsonNode value = args.get(0);
    try {
      if (value.isNumber()) {
        return value;
      }
      if (value.isBoolean()) {
        return nodes.numberNode(value.booleanValue() ? 1 : 0);
      }
      if (value.isTextual() && !value.asText().isBlank()) {
        return numberNode(new BigDecimal(value.asText().trim()));
      }
    } catch (NumberFormatException ignored) {
      // 失败走 fallback
    }
    return args.size() > 1 ? args.get(1) : nodes.nullNode();
  }

  private JsonNode toDate(List<JsonNode> args) {
    if (args.size() > 1 && !text(args.get(1)).isBlank()) {
      String pattern = text(args.get(1));
      DateTimeFormatter formatter = DateTimeFormatter.ofPattern(pattern);
      String raw = text(args.get(0));
      try {
        return nodes.textNode(LocalDateTime.parse(raw, formatter).toString());
      } catch (DateTimeParseException ignored) {
        return nodes.textNode(LocalDate.parse(raw, formatter).toString());
      }
    }
    return nodes.textNode(temporal(args.get(0), null).iso());
  }

  private JsonNode toArray(JsonNode value) {
    if (value == null || value.isNull()) {
      return nodes.arrayNode();
    }
    if (value.isArray()) {
      return value;
    }
    ArrayNode out = nodes.arrayNode();
    out.add(value);
    return out;
  }

  private String typeOf(JsonNode value) {
    if (value == null || value.isNull() || value.isMissingNode()) {
      return "null";
    }
    if (value.isTextual()) {
      return "string";
    }
    if (value.isNumber()) {
      return "number";
    }
    if (value.isBoolean()) {
      return "boolean";
    }
    if (value.isArray()) {
      return "array";
    }
    if (value.isObject()) {
      return "object";
    }
    return value.getNodeType().name().toLowerCase(Locale.ROOT);
  }

  // ------------------------------------------------------------------- date

  private record TemporalValue(boolean dateOnly, LocalDate date, ZonedDateTime dateTime) {

    LocalDate localDate() {
      return dateOnly ? date : dateTime.toLocalDate();
    }

    Instant instant(ZoneId zone) {
      return dateOnly ? date.atStartOfDay(zone).toInstant() : dateTime.toInstant();
    }

    String iso() {
      return dateOnly ? date.toString() : dateTime.toOffsetDateTime().toString();
    }
  }

  private TemporalValue temporal(JsonNode value, Scope scope) {
    if (isNull(value)) {
      throw new ExpressionException("type_error", "日期函数收到 null");
    }
    ZoneId zone = scope == null ? ZONE : scope.zone();
    if (value.isNumber()) {
      return new TemporalValue(false, null,
          Instant.ofEpochMilli(value.asLong()).atZone(zone));
    }
    TemporalValue parsed = tryTemporal(stringify(value), scope);
    if (parsed == null) {
      throw new ExpressionException("date_parse", "无法解析日期：" + stringify(value));
    }
    return parsed;
  }

  private TemporalValue tryTemporal(String raw, Scope scope) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    String value = raw.trim();
    ZoneId zone = scope == null ? ZONE : scope.zone();
    try {
      return new TemporalValue(false, null, OffsetDateTime.parse(value).atZoneSameInstant(zone));
    } catch (DateTimeParseException ignored) {
      // 继续尝试下一种格式
    }
    try {
      return new TemporalValue(false, null, LocalDateTime.parse(value).atZone(zone));
    } catch (DateTimeParseException ignored) {
      // 继续尝试下一种格式
    }
    try {
      return new TemporalValue(true, LocalDate.parse(value), null);
    } catch (DateTimeParseException ignored) {
      // 继续尝试下一种格式
    }
    try {
      return new TemporalValue(false, null, Instant.parse(value).atZone(zone));
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  private JsonNode dateAdd(List<JsonNode> args, Scope scope) {
    TemporalValue value = temporal(args.get(0), scope);
    long amount = longValue(args.get(1), "dateAdd");
    String unit = text(args.get(2)).toLowerCase(Locale.ROOT);
    if (value.dateOnly() && !unit.equals("hour") && !unit.equals("minute")) {
      LocalDate date = switch (unit) {
        case "year", "years" -> value.date().plusYears(amount);
        case "month", "months" -> value.date().plusMonths(amount);
        case "week", "weeks" -> value.date().plusWeeks(amount);
        case "day", "days" -> value.date().plusDays(amount);
        default -> throw new ExpressionException("bad_unit", "dateAdd 不支持单位：" + unit);
      };
      return nodes.textNode(date.toString());
    }
    ZonedDateTime dateTime = switch (unit) {
      case "year", "years" -> value.dateTime().plusYears(amount);
      case "month", "months" -> value.dateTime().plusMonths(amount);
      case "week", "weeks" -> value.dateTime().plusWeeks(amount);
      case "day", "days" -> value.dateTime().plusDays(amount);
      case "hour", "hours" -> value.dateTime().plusHours(amount);
      case "minute", "minutes" -> value.dateTime().plusMinutes(amount);
      default -> throw new ExpressionException("bad_unit", "dateAdd 不支持单位：" + unit);
    };
    return nodes.textNode(dateTime.toOffsetDateTime().toString());
  }

  private long dateDiff(List<JsonNode> args, Scope scope) {
    TemporalValue start = temporal(args.get(0), scope);
    TemporalValue end = temporal(args.get(1), scope);
    String unit = args.size() > 2 ? text(args.get(2)).toLowerCase(Locale.ROOT) : "day";
    return switch (unit) {
      case "year", "years" -> ChronoUnit.YEARS.between(start.localDate(), end.localDate());
      case "month", "months" -> ChronoUnit.MONTHS.between(start.localDate(), end.localDate());
      case "week", "weeks" -> ChronoUnit.DAYS.between(start.localDate(), end.localDate()) / 7;
      case "day", "days" -> ChronoUnit.DAYS.between(start.localDate(), end.localDate());
      case "hour", "hours" ->
          Duration.between(start.instant(scope.zone()), end.instant(scope.zone())).toHours();
      case "minute", "minutes" ->
          Duration.between(start.instant(scope.zone()), end.instant(scope.zone())).toMinutes();
      default -> throw new ExpressionException("bad_unit", "dateDiff 不支持单位：" + unit);
    };
  }

  private JsonNode formatDate(List<JsonNode> args, Scope scope) {
    TemporalValue value = temporal(args.get(0), scope);
    String pattern = args.size() > 1 ? text(args.get(1)) : DEFAULT_DATE_FORMAT;
    DateTimeFormatter formatter = DateTimeFormatter.ofPattern(pattern);
    return nodes.textNode(formatter.format(value.dateOnly()
        ? value.date().atStartOfDay(scope.zone())
        : value.dateTime()));
  }

  private JsonNode boundary(List<JsonNode> args, Scope scope, boolean start) {
    TemporalValue value = temporal(args.get(0), scope);
    String unit = text(args.get(1)).toLowerCase(Locale.ROOT);
    LocalDate date = value.localDate();
    LocalDate resultDate = switch (unit) {
      case "day" -> date;
      case "week" -> start
          ? date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
          : date.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
      case "month" -> start ? date.withDayOfMonth(1) : date.with(TemporalAdjusters.lastDayOfMonth());
      case "quarter" -> {
        LocalDate first = date.withDayOfMonth(1).withMonth(((date.getMonthValue() - 1) / 3) * 3 + 1);
        yield start ? first : first.plusMonths(2).with(TemporalAdjusters.lastDayOfMonth());
      }
      case "year" -> start ? date.withDayOfYear(1) : date.with(TemporalAdjusters.lastDayOfYear());
      default -> throw new ExpressionException("bad_unit", "区间单位不支持：" + unit);
    };
    if (value.dateOnly()) {
      return nodes.textNode(resultDate.toString());
    }
    ZonedDateTime dateTime = start
        ? resultDate.atStartOfDay(scope.zone())
        : resultDate.atTime(23, 59, 59).atZone(scope.zone());
    return nodes.textNode(dateTime.toOffsetDateTime().toString());
  }

  // --------------------------------------------------------------- security

  private String maskIdCard(String value, int front) {
    if (value.length() <= front + 4) {
      return "*".repeat(value.length());
    }
    return value.substring(0, Math.max(0, front)) + "*".repeat(value.length() - front - 4)
        + value.substring(value.length() - 4);
  }

  private String maskPhone(String value) {
    if (value.length() <= 4) {
      return "*".repeat(value.length());
    }
    if (value.length() >= 7) {
      return value.substring(0, 3) + "****" + value.substring(value.length() - 4);
    }
    return value.charAt(0) + "*".repeat(value.length() - 2) + value.charAt(value.length() - 1);
  }

  private String maskName(String value) {
    if (value.isEmpty()) {
      return value;
    }
    return value.substring(0, 1) + "*".repeat(Math.max(1, value.length() - 1));
  }

  private String maskEmail(String value) {
    int at = value.indexOf('@');
    if (at <= 0) {
      return maskName(value);
    }
    return value.charAt(0) + "***" + value.substring(at);
  }

  private String hash(String value, String algorithm) {
    String normalized = algorithm == null
        ? "sha256" : algorithm.toLowerCase(Locale.ROOT).replace("-", "");
    String digest = switch (normalized) {
      case "md5" -> "MD5";
      case "sha1" -> "SHA-1";
      case "sha512" -> "SHA-512";
      default -> "SHA-256";
    };
    try {
      byte[] bytes = MessageDigest.getInstance(digest).digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder out = new StringBuilder(bytes.length * 2);
      for (byte b : bytes) {
        out.append(Character.forDigit((b >> 4) & 0xf, 16));
        out.append(Character.forDigit(b & 0xf, 16));
      }
      return out.toString();
    } catch (Exception ex) {
      throw new ExpressionException("hash_failed", "哈希算法不可用：" + algorithm, ex);
    }
  }

  // -------------------------------------------------------------- data/flow

  private JsonNode lookup(List<JsonNode> args, Scope scope) {
    ArrayNode rows = requireArray(args.get(0), "lookup");
    JsonNode key = args.get(1);
    String field = args.size() > 2 ? text(args.get(2)) : null;
    for (JsonNode row : rows) {
      JsonNode id = resolve(row, List.of("id"));
      if (id == null) {
        id = resolve(row, List.of("key"));
      }
      if (id != null && deepEquals(id, key)) {
        return field == null || field.isBlank() ? row : orNull(resolve(row, parsePath(field)));
      }
    }
    return nodes.nullNode();
  }

  private JsonNode processVariable(List<JsonNode> args, Scope scope) {
    JsonNode process = scope.root("process");
    if (isNull(process)) {
      return args.size() > 1 ? args.get(1) : nodes.nullNode();
    }
    JsonNode variables = process.path("variables");
    JsonNode value = variables.path(text(args.get(0)));
    if (value.isMissingNode() || value.isNull()) {
      return args.size() > 1 ? args.get(1) : nodes.nullNode();
    }
    return value;
  }

  private JsonNode taskAssignee(List<JsonNode> args, Scope scope) {
    JsonNode process = scope.root("process");
    if (isNull(process)) {
      return nodes.nullNode();
    }
    if (args.isEmpty() || text(args.get(0)).isBlank()) {
      JsonNode assignee = process.path("assignee");
      return assignee.isMissingNode() ? process.path("taskAssignee") : assignee;
    }
    JsonNode tasks = process.path("tasks");
    JsonNode task = tasks.path(text(args.get(0)));
    return task.isMissingNode() ? nodes.nullNode() : task.path("assignee");
  }

  private boolean taskClaimed(Scope scope) {
    JsonNode process = scope.root("process");
    if (isNull(process)) {
      return false;
    }
    JsonNode claimed = process.path("claimed");
    return !claimed.isMissingNode() && claimed.asBoolean(false);
  }

  private String fileName(JsonNode value) {
    if (value == null || value.isNull()) {
      return "";
    }
    if (value.isObject()) {
      JsonNode name = value.path("name");
      if (name.isMissingNode()) {
        name = value.path("filename");
      }
      if (!name.isMissingNode()) {
        return name.asText();
      }
      return fileName(value.path("url"));
    }
    String raw = value.asText();
    int slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    return slash >= 0 ? raw.substring(slash + 1) : raw;
  }

  private String fileExt(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 || dot == name.length() - 1
        ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private JsonNode fileSize(JsonNode value) {
    if (value != null && value.isObject()) {
      JsonNode size = value.path("size");
      if (size.isMissingNode()) {
        size = value.path("bytes");
      }
      return size.isMissingNode() ? nodes.nullNode() : size;
    }
    return nodes.nullNode();
  }

  private String fileUrl(JsonNode value) {
    if (value == null || value.isNull()) {
      return "";
    }
    if (value.isObject()) {
      JsonNode url = value.path("url");
      if (url.isMissingNode()) {
        url = value.path("path");
      }
      return url.isMissingNode() ? "" : url.asText();
    }
    return value.asText();
  }

  // ------------------------------------------------------------------ utils

  public boolean truthy(JsonNode value) {
    if (value == null || value.isNull() || value.isMissingNode()) {
      return false;
    }
    if (value.isBoolean()) {
      return value.booleanValue();
    }
    if (value.isNumber()) {
      return value.decimalValue().signum() != 0;
    }
    if (value.isTextual()) {
      String text = value.asText();
      return !text.isEmpty() && !"false".equalsIgnoreCase(text) && !"0".equals(text);
    }
    return value.size() > 0;
  }

  public boolean isNull(JsonNode value) {
    return value == null || value.isNull() || value.isMissingNode();
  }

  private boolean isEmpty(JsonNode value) {
    if (isNull(value)) {
      return true;
    }
    if (value.isTextual()) {
      return value.asText().isEmpty();
    }
    return (value.isArray() || value.isObject()) && value.size() == 0;
  }

  public String stringify(JsonNode value) {
    if (value == null || value.isNull() || value.isMissingNode()) {
      return "";
    }
    if (value.isTextual()) {
      return value.asText();
    }
    if (value.isNumber()) {
      BigDecimal decimal = value.decimalValue().stripTrailingZeros();
      if (decimal.scale() < 0) {
        decimal = decimal.setScale(0);
      }
      return decimal.toPlainString();
    }
    if (value.isBoolean()) {
      return value.booleanValue() ? "true" : "false";
    }
    try {
      return json.writeValueAsString(value);
    } catch (Exception ex) {
      return value.toString();
    }
  }

  private String text(JsonNode value) {
    return value == null || value.isNull() ? "" : value.asText();
  }

  private BigDecimal decimal(JsonNode value, String fn) {
    if (value == null || value.isNull()) {
      throw new ExpressionException("type_error", fn + " 收到 null，无法转为数字");
    }
    if (value.isNumber()) {
      return value.decimalValue();
    }
    if (value.isTextual()) {
      try {
        return new BigDecimal(value.asText().trim());
      } catch (NumberFormatException ex) {
        throw new ExpressionException("type_error", fn + " 收到非数字文本：" + value.asText());
      }
    }
    throw new ExpressionException("type_error", fn + " 需要数字，实际 " + typeOf(value));
  }

  private int intValue(JsonNode value, String fn) {
    return decimal(value, fn).intValue();
  }

  private long longValue(JsonNode value, String fn) {
    return decimal(value, fn).longValue();
  }

  private JsonNode numberNode(BigDecimal value) {
    BigDecimal normalized = value.stripTrailingZeros();
    if (normalized.scale() < 0) {
      normalized = normalized.setScale(0);
    }
    return nodes.numberNode(normalized);
  }

  private ArrayNode requireArray(JsonNode value, String fn) {
    if (value == null || !value.isArray()) {
      throw new ExpressionException("type_error", fn + " 需要数组，实际 " + typeOf(value));
    }
    return (ArrayNode) value;
  }

  private JsonNode orNull(JsonNode value) {
    return value == null ? nodes.nullNode() : value;
  }

  private boolean deepEquals(JsonNode left, JsonNode right) {
    return canonical(left).equals(canonical(right));
  }

  private String canonical(JsonNode value) {
    if (value == null || value.isNull() || value.isMissingNode()) {
      return "null";
    }
    if (value.isNumber()) {
      BigDecimal decimal = value.decimalValue().stripTrailingZeros();
      if (decimal.scale() < 0) {
        decimal = decimal.setScale(0);
      }
      return "n:" + decimal.toPlainString();
    }
    if (value.isTextual()) {
      return "s:" + value.asText();
    }
    if (value.isBoolean()) {
      return "b:" + value.booleanValue();
    }
    if (value.isArray()) {
      StringBuilder out = new StringBuilder("a:[");
      for (int i = 0; i < value.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        out.append(canonical(value.get(i)));
      }
      return out.append(']').toString();
    }
    if (value.isObject()) {
      List<String> keys = new ArrayList<>();
      value.fieldNames().forEachRemaining(keys::add);
      keys.sort(String::compareTo);
      StringBuilder out = new StringBuilder("o:{");
      for (int i = 0; i < keys.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        out.append(keys.get(i)).append('=').append(canonical(value.get(keys.get(i))));
      }
      return out.append('}').toString();
    }
    return value.toString();
  }

  /**
   * 解析 JSONPath 子集：$.a.b[0].c。缺失返回 null。
   * 供响应映射、resultPath 等声明式取值使用。
   */
  public JsonNode jsonPath(JsonNode root, String path) {
    if (root == null || path == null || path.isBlank()) {
      return nodes.nullNode();
    }
    String body = path.startsWith("$") ? path.substring(1) : path;
    JsonNode found = resolve(root, parsePath(body));
    return found == null ? nodes.nullNode() : found;
  }

  private JsonNode resolve(JsonNode root, List<String> segments) {
    JsonNode current = root;
    for (String segment : segments) {
      if (current == null) {
        return null;
      }
      current = step(current, segment);
    }
    return current;
  }

  private JsonNode step(JsonNode current, String segment) {
    if (current == null || current.isNull() || current.isMissingNode()) {
      return null;
    }
    if (current.isObject()) {
      return current.get(segment);
    }
    if (current.isArray()) {
      try {
        int index = Integer.parseInt(segment);
        return index >= 0 && index < current.size() ? current.get(index) : null;
      } catch (NumberFormatException ex) {
        return null;
      }
    }
    return null;
  }

  /** 支持 a.b、a[0]、a['k']；首段不带 $。 */
  static List<String> parsePath(String path) {
    List<String> segments = new ArrayList<>();
    if (path == null || path.isEmpty()) {
      return segments;
    }
    StringBuilder token = new StringBuilder();
    int i = 0;
    while (i < path.length()) {
      char c = path.charAt(i);
      if (c == '.') {
        flush(segments, token);
        i++;
      } else if (c == '[') {
        flush(segments, token);
        int end = path.indexOf(']', i);
        if (end < 0) {
          throw new ExpressionException("bad_ref", "路径缺少 ]：" + path);
        }
        String inside = path.substring(i + 1, end).trim();
        if (inside.isEmpty()) {
          throw new ExpressionException("bad_ref", "路径包含空下标：" + path);
        }
        if ((inside.startsWith("'") && inside.endsWith("'"))
            || (inside.startsWith("\"") && inside.endsWith("\""))) {
          inside = inside.substring(1, inside.length() - 1);
        }
        segments.add(inside);
        i = end + 1;
      } else {
        token.append(c);
        i++;
      }
    }
    flush(segments, token);
    return segments;
  }

  private static void flush(List<String> segments, StringBuilder token) {
    if (token.length() > 0) {
      segments.add(token.toString());
      token.setLength(0);
    }
  }
}
