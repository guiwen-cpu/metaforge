package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.connector.ConnectionService;
import dev.lcp.bff.connector.ConnectorRuntime;
import dev.lcp.bff.connector.PinnedHttpTransport;
import dev.lcp.bff.connector.XmlJson;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.RuntimeRequests.ExecuteActionRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionError;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionExecutionResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.StepTrace;
import dev.lcp.bff.tenant.TenantContext;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 发布态动作执行器。只读取 current_version 的发布件，逐步执行 LogicSchema.actions[].steps，
 * 返回完整 trace。前端交互类步骤在服务端记为 skipped；任意脚本（code/custom）与
 * 内部 API 连接器未接入时明确失败，不做静默降级。
 */
@Service
public class ActionExecutor {

  private static final Logger log = LoggerFactory.getLogger(ActionExecutor.class);
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private static final int MAX_DEPTH = 8;
  private static final int MAX_STEPS = 5000;
  private static final long MAX_DELAY_MS = 10_000L;

  private final dev.lcp.bff.runtime.PublishedBundleService bundles;
  private final ExpressionEngine expressions;
  private final ObjectMapper json;
  private final ConnectionService connections;
  private final ConnectorRuntime connectors;
  private final XmlJson xml;
  private final RuntimeActionGateway gateway;

  public ActionExecutor(
      dev.lcp.bff.runtime.PublishedBundleService bundles,
      ExpressionEngine expressions,
      ObjectMapper json,
      ConnectionService connections,
      ConnectorRuntime connectors,
      XmlJson xml,
      RuntimeActionGateway gateway) {
    this.bundles = bundles;
    this.expressions = expressions;
    this.json = json;
    this.connections = connections;
    this.connectors = connectors;
    this.xml = xml;
    this.gateway = gateway;
  }

  public ActionExecutionResult execute(UUID appId, String actionKey, ExecuteActionRequest request) {
    PublishedBundle bundle = bundles.load(appId);
    return execute(bundle, actionKey, request);
  }

  /** 便于单测直接传入发布件，不经过数据库。 */
  public ActionExecutionResult execute(
      PublishedBundle bundle, String actionKey, ExecuteActionRequest request) {
    long started = System.nanoTime();
    JsonNode action = findAction(bundle.content(), actionKey);
    if (action == null) {
      throw PlatformException.notFound("动作 " + actionKey + " 不存在于当前发布件");
    }
    ObjectNode params = actionParams(action, request == null ? null : request.params());
    ExpressionEngine.Scope scope = scopeFor(bundle, action, request, params);
    ArrayNode events = json.createArrayNode();
    scope.attach("bundle", bundle.content());
    scope.attach("appId", bundle.appId());
    scope.attach("versionNo", bundle.versionNo());
    scope.attach("events", events);
    scope.attach("depth", 0);

    long timeoutMs = action.path("timeoutMs").asLong(30000);
    long deadline = started + Math.max(1, timeoutMs) * 1_000_000L;
    scope.attach("deadline", deadline);

    List<StepTrace> trace = new ArrayList<>();
    JsonNode result = json.nullNode();
    try {
      if (action.has("when") && !expressions.truthy(expressions.eval(action.get("when"), scope))) {
        return new ActionExecutionResult(bundle.appKey(), bundle.versionNo(), actionKey,
            "skipped", millis(started), null, ctxVars(scope), events, trace, null, null, null,
            stateOf(scope));
      }
      result = executeSteps(action.path("steps"), scope, trace, deadline);
      ObjectNode ctx = (ObjectNode) scope.root("ctx");
      ctx.set("result", result);
      JsonNode writeback = writeback(action, scope, "completed");
      return new ActionExecutionResult(bundle.appKey(), bundle.versionNo(), actionKey,
          "completed", millis(started), result, ctxVars(scope), events, trace, null, writeback, null,
          stateOf(scope));
    } catch (BusinessFailure failure) {
      ObjectNode ctx = (ObjectNode) scope.root("ctx");
      ctx.set("error", errorNode(failure.code, failure.getMessage()));
      JsonNode writeback = safeWriteback(action, scope, "failed");
      return new ActionExecutionResult(bundle.appKey(), bundle.versionNo(), actionKey,
          "failed", millis(started), null, ctxVars(scope), events, trace,
          new ActionError(failure.code, failure.getMessage(), failure.fields, failure.rollback),
          writeback, null, stateOf(scope));
    } catch (ExpressionException ex) {
      ObjectNode ctx = (ObjectNode) scope.root("ctx");
      ctx.set("error", errorNode(ex.code(), ex.getMessage()));
      JsonNode writeback = safeWriteback(action, scope, "failed");
      return new ActionExecutionResult(bundle.appKey(), bundle.versionNo(), actionKey,
          "failed", millis(started), null, ctxVars(scope), events, trace,
          new ActionError(ex.code(), ex.getMessage(), List.of(), false), writeback, null,
          stateOf(scope));
    } catch (RuntimeException ex) {
      log.error("动作执行异常 {}:{}", bundle.appKey(), actionKey, ex);
      ObjectNode ctx = (ObjectNode) scope.root("ctx");
      ctx.set("error", errorNode("runtime_error", ex.getMessage()));
      JsonNode writeback = safeWriteback(action, scope, "failed");
      return new ActionExecutionResult(bundle.appKey(), bundle.versionNo(), actionKey,
          "failed", millis(started), null, ctxVars(scope), events, trace,
          new ActionError("runtime_error", ex.getMessage(), List.of(), true), writeback, null,
          stateOf(scope));
    }
  }

  private static JsonNode stateOf(ExpressionEngine.Scope scope) {
    JsonNode page = scope.root("page");
    JsonNode state = page == null ? null : page.get("state");
    return state != null && state.isObject() ? state : null;
  }

  /**
   * 在动作作用域内计算 writeback：variables / business 逐项求值，success / failure
   * 只取当前状态对应的推进声明。表达式错误向上抛，让调用方把动作标为失败。
   */
  private JsonNode writeback(JsonNode action, ExpressionEngine.Scope scope, String status) {
    JsonNode def = action.path("writeback");
    if (!def.isObject() || def.isEmpty()) {
      return null;
    }
    ObjectNode out = json.createObjectNode();
    if (def.has("variables")) {
      out.set("variables", evalMap(def.get("variables"), scope));
    }
    if (def.has("business")) {
      out.set("business", evalMap(def.get("business"), scope));
    }
    JsonNode advanceDef = "failed".equals(status) ? def.get("failure")
        : "completed".equals(status) ? def.get("success") : null;
    if (advanceDef != null && advanceDef.isObject()) {
      ObjectNode advance = advanceDef.deepCopy();
      if (advance.has("comment")) {
        advance.set("comment", expressions.deepValue(advance.get("comment"), scope));
      }
      out.set("advance", advance);
    }
    return out.size() == 0 ? null : out;
  }

  private JsonNode safeWriteback(JsonNode action, ExpressionEngine.Scope scope, String status) {
    try {
      return writeback(action, scope, status);
    } catch (RuntimeException ex) {
      ObjectNode out = json.createObjectNode();
      out.set("error", errorNode("writeback_failed", ex.getMessage()));
      return out;
    }
  }

  private ObjectNode evalMap(JsonNode source, ExpressionEngine.Scope scope) {
    ObjectNode out = json.createObjectNode();
    if (source == null || !source.isObject()) {
      return out;
    }
    source.fields().forEachRemaining(entry ->
        out.set(entry.getKey(), expressions.deepValue(entry.getValue(), scope)));
    return out;
  }

  private ExpressionEngine.Scope scopeFor(
      PublishedBundle bundle, JsonNode action, ExecuteActionRequest request, ObjectNode params) {
    Map<String, Object> context = request == null || request.context() == null
        ? Map.of() : request.context();
    String tenantId = TenantContext.tenantId();
    String userId = TenantContext.userId();

    ObjectNode user = object(context.get("user"));
    if (!user.hasNonNull("id") && userId != null) {
      user.put("id", userId);
    }
    if (!user.hasNonNull("username") && userId != null) {
      user.put("username", userId);
    }
    if (!user.hasNonNull("tenantId") && tenantId != null) {
      user.put("tenantId", tenantId);
    }

    ObjectNode tenant = object(context.get("tenant"));
    if (!tenant.hasNonNull("id") && tenantId != null) {
      tenant.put("id", tenantId);
    }

    ObjectNode env = object(context.get("env"));
    env.put("platform", env.path("platform").asText("server"));
    env.put("locale", env.path("locale").asText("zh-CN"));
    env.put("timezone", env.path("timezone").asText(ZONE.getId()));
    env.put("mode", env.path("mode").asText("runtime"));
    env.put("appVersion", bundle.versionNo());

    ObjectNode page = object(context.get("page"));
    if (!page.has("state") || !page.get("state").isObject()) {
      page.set("state", json.createObjectNode());
    }
    page.set("params", params.deepCopy());
    if (!page.has("query") || !page.get("query").isObject()) {
      page.set("query", json.createObjectNode());
    }

    ObjectNode route = object(context.get("route"));
    if (!route.has("path")) {
      route.put("path", "");
    }
    if (!route.has("query") || !route.get("query").isObject()) {
      route.set("query", json.createObjectNode());
    }
    if (!route.has("params") || !route.get("params").isObject()) {
      route.set("params", json.createObjectNode());
    }

    ObjectNode ctx = json.createObjectNode();
    ctx.set("params", params.deepCopy());
    ctx.set("event", node(request == null ? null : request.event()));
    ctx.set("vars", json.createObjectNode());
    ctx.putNull("result");
    ctx.putNull("error");
    ctx.put("actionKey", action.path("key").asText());
    ctx.put("stepIndex", -1);

    Map<String, JsonNode> roots = new LinkedHashMap<>();
    roots.put("user", user);
    roots.put("tenant", tenant);
    roots.put("env", env);
    roots.put("page", page);
    roots.put("route", route);
    roots.put("form", node(context.get("form")));
    roots.put("row", node(context.get("row")));
    roots.put("rows", node(context.get("rows")));
    roots.put("data", object(context.get("data")));
    roots.put("process", node(context.get("process")));
    roots.put("ctx", ctx);
    roots.put("component", node(context.get("component")));
    return expressions.newScope(roots);
  }

  private ObjectNode actionParams(JsonNode action, Map<String, Object> input) {
    JsonNode tree = input == null ? json.createObjectNode() : json.valueToTree(input);
    ObjectNode params = tree.isObject() ? (ObjectNode) tree : json.createObjectNode();
    for (JsonNode def : action.path("params")) {
      String key = def.path("key").asText("");
      if (key.isEmpty()) {
        continue;
      }
      boolean missing = !params.has(key) || params.get(key).isNull();
      if (missing && def.has("defaultValue")) {
        params.set(key, def.get("defaultValue").deepCopy());
        missing = false;
      }
      if (missing && def.path("required").asBoolean(false)) {
        throw PlatformException.badRequest("missing_param", "缺少动作参数：" + key);
      }
    }
    return params;
  }

  private JsonNode findAction(JsonNode bundle, String actionKey) {
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode action : logic.path("actions")) {
        if (actionKey != null && actionKey.equals(action.path("key").asText())) {
          return action;
        }
      }
    }
    return null;
  }

  private JsonNode findApi(JsonNode bundle, String apiKey) {
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode api : logic.path("apis")) {
        if (apiKey != null && apiKey.equals(api.path("key").asText())) {
          return api;
        }
      }
    }
    return null;
  }

  private JsonNode node(Object value) {
    if (value == null) {
      return json.nullNode();
    }
    if (value instanceof JsonNode jsonNode) {
      return jsonNode;
    }
    return json.valueToTree(value);
  }

  private ObjectNode object(Object value) {
    JsonNode node = node(value);
    return node != null && node.isObject() ? (ObjectNode) node : json.createObjectNode();
  }

  private ObjectNode ctxVars(ExpressionEngine.Scope scope) {
    JsonNode ctx = scope.root("ctx");
    JsonNode vars = ctx == null ? null : ctx.get("vars");
    return vars != null && vars.isObject() ? (ObjectNode) vars : json.createObjectNode();
  }

  private ObjectNode errorNode(String code, String message) {
    ObjectNode error = json.createObjectNode();
    error.put("code", code);
    error.put("message", message == null ? "" : message);
    return error;
  }

  private static long millis(long startedNanos) {
    return Math.max(0, (System.nanoTime() - startedNanos) / 1_000_000L);
  }

  private static final class BusinessFailure extends RuntimeException {

    private final String code;
    private final List<String> fields;
    private final boolean rollback;

    private BusinessFailure(String code, String message, List<String> fields, boolean rollback) {
      super(message);
      this.code = code;
      this.fields = fields == null ? List.of() : List.copyOf(fields);
      this.rollback = rollback;
    }
  }

  // ------------------------------------------------------------- step runner

  private JsonNode executeSteps(
      JsonNode steps, ExpressionEngine.Scope scope, List<StepTrace> traces, long deadline) {
    JsonNode last = json.nullNode();
    if (steps == null || !steps.isArray()) {
      return last;
    }
    for (JsonNode step : steps) {
      last = executeStep(step, scope, traces, deadline);
      ObjectNode ctx = (ObjectNode) scope.root("ctx");
      ctx.set("result", last == null ? json.nullNode() : last);
    }
    return last;
  }

  private JsonNode executeStep(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> traces, long deadline) {
    String type = step.path("type").asText("");
    String label = step.path("label").asText(type);
    int[] counter = (int[]) scope.attachment("counter");
    if (counter == null) {
      counter = new int[1];
      scope.attach("counter", counter);
    }
    if (++counter[0] > MAX_STEPS) {
      throw new BusinessFailure("STEP_LIMIT", "动作步骤超过上限 " + MAX_STEPS, List.of(), true);
    }
    if (deadline > 0 && System.nanoTime() > deadline) {
      throw new BusinessFailure("ACTION_TIMEOUT", "动作执行超时", List.of(), true);
    }

    long start = System.nanoTime();
    if (step.path("disabled").asBoolean(false)) {
      StepTrace trace = trace(step, "skipped", start, "步骤已禁用", null, List.of());
      traces.add(trace);
      return json.nullNode();
    }
    if (step.has("when")) {
      try {
        if (!expressions.truthy(expressions.eval(step.get("when"), scope))) {
          StepTrace trace = trace(step, "skipped", start, "when 条件不成立", null, List.of());
          traces.add(trace);
          return json.nullNode();
        }
      } catch (RuntimeException ex) {
        BusinessFailure failure = toFailure(ex);
        traces.add(trace(step, "failed", start, failure.getMessage(), null, List.of()));
        throw failure;
      }
    }

    List<StepTrace> children = new ArrayList<>();
    try {
      StepOutcome outcome = run(step, scope, children, deadline);
      StepTrace trace = trace(step, outcome.skipped ? "skipped" : "completed",
          start, outcome.message, outcome.value, children);
      traces.add(trace);
      if (outcome.skipped) {
        return json.nullNode();
      }
      return outcome.value == null ? json.nullNode() : outcome.value;
    } catch (RuntimeException ex) {
      BusinessFailure failure = toFailure(ex);
      JsonNode handlers = step.get("onError");
      if (handlers != null && handlers.isArray() && handlers.size() > 0) {
        executeSteps(handlers, scope, children, deadline);
        traces.add(trace(step, "failed", start, failure.getMessage(), null, children));
        ObjectNode ctx = (ObjectNode) scope.root("ctx");
        ctx.set("error", errorNode(failure.code, failure.getMessage()));
        return json.nullNode();
      }
      traces.add(trace(step, "failed", start, failure.getMessage(), null, children));
      if (step.path("continueOnError").asBoolean(false)) {
        ObjectNode ctx = (ObjectNode) scope.root("ctx");
        ctx.set("error", errorNode(failure.code, failure.getMessage()));
        return json.nullNode();
      }
      throw failure;
    }
  }

  private record StepOutcome(JsonNode value, boolean skipped, String message) {

    static StepOutcome done(JsonNode value) {
      return new StepOutcome(value, false, null);
    }

    static StepOutcome skip(String message) {
      return new StepOutcome(null, true, message);
    }
  }

  private StepOutcome run(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    String type = step.path("type").asText("");
    return switch (type) {
      case "assign" -> StepOutcome.done(assign(step, scope));
      case "apiCall" -> StepOutcome.done(apiCall(step, scope, children, deadline));
      case "branch" -> StepOutcome.done(branch(step, scope, children, deadline));
      case "loop" -> StepOutcome.done(loop(step, scope, children, deadline));
      case "parallel" -> StepOutcome.done(parallel(step, scope, children, deadline));
      case "callAction" -> StepOutcome.done(callAction(step, scope, children, deadline));
      case "transaction" -> StepOutcome.done(
          executeSteps(step.path("steps"), scope, children, deadline));
      case "delay" -> StepOutcome.done(delay(step, scope));
      case "log" -> StepOutcome.done(log(step, scope));
      case "emit" -> StepOutcome.done(emit(step, scope));
      case "fail" -> {
        fail(step, scope);
        yield StepOutcome.done(json.nullNode());
      }
      case "validate" -> StepOutcome.done(validate(step, scope));
      case "code" -> StepOutcome.done(code(step, scope));
      case "startFlow" -> StepOutcome.done(startFlow(step, scope));
      case "completeTask" -> StepOutcome.done(completeTask(step, scope, children, deadline));
      case "confirm" -> confirm(step, scope, children, deadline);
      case "openDialog", "closeDialog", "navigate", "upload", "download", "print" ->
          StepOutcome.skip("前端交互步骤，服务端执行跳过");
      case "custom" ->
          throw new BusinessFailure("UNSUPPORTED_STEP",
              "步骤 " + type + " 需要注册的沙箱/处理器，当前运行时未接入", List.of(), true);
      default -> throw new BusinessFailure("UNKNOWN_STEP", "未知步骤类型：" + type, List.of(), true);
    };
  }

  private StepOutcome confirm(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    JsonNode flag = scope.root("ctx").path("event").path("__confirmed");
    if (!flag.isBoolean()) {
      return StepOutcome.skip("缺少前端确认结果，服务端跳过确认分支");
    }
    JsonNode steps = flag.booleanValue() ? step.get("onConfirm") : step.get("onCancel");
    JsonNode value = executeSteps(steps, scope, children, deadline);
    return StepOutcome.done(value == null ? json.nullNode() : value);
  }

  private JsonNode assign(JsonNode step, ExpressionEngine.Scope scope) {
    JsonNode value = expressions.eval(step.get("value"), scope);
    String target = step.path("target").asText("");
    setTarget(target, value, step.path("merge").asBoolean(false), scope);
    return value;
  }

  private JsonNode branch(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    for (JsonNode branch : step.path("cases")) {
      if (expressions.truthy(expressions.eval(branch.get("when"), scope))) {
        long start = System.nanoTime();
        List<StepTrace> branchTrace = new ArrayList<>();
        JsonNode value = executeSteps(branch.path("then"), scope, branchTrace, deadline);
        String name = branch.path("name").asText("case");
        children.add(new StepTrace(branch.path("name").asText(""),
            "case", name, "completed", millis(start), null, value, branchTrace));
        return value;
      }
    }
    if (step.has("else")) {
      long start = System.nanoTime();
      List<StepTrace> branchTrace = new ArrayList<>();
      JsonNode value = executeSteps(step.get("else"), scope, branchTrace, deadline);
      children.add(new StepTrace("", "case", "else", "completed",
          millis(start), null, value, branchTrace));
      return value;
    }
    return json.nullNode();
  }

  private JsonNode loop(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    JsonNode over = expressions.eval(step.get("over"), scope);
    ArrayNode items = json.createArrayNode();
    if (over != null && over.isArray()) {
      over.forEach(items::add);
    } else if (over != null && over.isObject()) {
      over.forEach(items::add);
    }
    int max = step.path("maxIterations").asInt(1000);
    max = max <= 0 ? 1000 : Math.min(max, 100_000);
    if (items.size() > max) {
      throw new BusinessFailure("LOOP_LIMIT",
          "循环次数 " + items.size() + " 超过上限 " + max, List.of(), true);
    }
    String itemName = step.path("itemName").asText("item");
    String indexName = step.path("indexName").asText("index");
    ObjectNode vars = ctxVars(scope);
    ArrayNode collected = json.createArrayNode();
    for (int i = 0; i < items.size(); i++) {
      vars.set(itemName, items.get(i));
      vars.put(indexName, i);
      long start = System.nanoTime();
      List<StepTrace> iteration = new ArrayList<>();
      JsonNode value = executeSteps(step.path("steps"), scope, iteration, deadline);
      collected.add(value == null ? json.nullNode() : value);
      children.add(new StepTrace("", "iteration", itemName + "[" + i + "]",
          "completed", millis(start), null, value, iteration));
      if (step.has("breakWhen") && expressions.truthy(expressions.eval(step.get("breakWhen"), scope))) {
        break;
      }
    }
    if (step.has("collect") && !step.path("collect").asText("").isBlank()) {
      setTarget(step.path("collect").asText(), collected, false, scope);
    }
    return collected;
  }

  private JsonNode parallel(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    boolean failFast = step.path("failFast").asBoolean(true);
    ArrayNode results = json.createArrayNode();
    for (JsonNode branch : step.path("branches")) {
      long start = System.nanoTime();
      List<StepTrace> branchTrace = new ArrayList<>();
      ExpressionEngine.Scope child = forkScope(scope);
      String name = branch.path("name").asText("branch");
      try {
        JsonNode value = executeSteps(branch.path("steps"), child, branchTrace, deadline);
        results.add(value == null ? json.nullNode() : value);
        children.add(new StepTrace("", "branch", name, "completed",
            millis(start), null, value, branchTrace));
      } catch (RuntimeException ex) {
        BusinessFailure failure = toFailure(ex);
        results.add(json.nullNode());
        children.add(new StepTrace("", "branch", name, "failed",
            millis(start), failure.getMessage(), null, branchTrace));
        if (failFast) {
          throw failure;
        }
      }
    }
    return results;
  }

  private JsonNode callAction(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    String actionKey = step.path("actionRef").path("key").asText("");
    if (actionKey.isBlank()) {
      throw new BusinessFailure("BAD_ACTION_REF", "callAction 缺少 actionRef.key", List.of(), false);
    }
    int depth = (Integer) scope.attachment("depth");
    if (depth >= MAX_DEPTH) {
      throw new BusinessFailure("ACTION_DEPTH", "动作调用层级超过 " + MAX_DEPTH, List.of(), true);
    }
    JsonNode bundle = (JsonNode) scope.attachment("bundle");
    JsonNode action = findAction(bundle, actionKey);
    if (action == null) {
      throw new BusinessFailure("ACTION_NOT_FOUND", "被调用动作不存在：" + actionKey, List.of(), false);
    }
    ObjectNode params = evaluateParams(step.get("params"), scope);
    @SuppressWarnings("unchecked")
    Map<String, Object> paramMap = json.convertValue(params, Map.class);
    ObjectNode withDefaults = actionParams(action, paramMap);
    ExpressionEngine.Scope child = forkScope(scope);
    ObjectNode ctx = (ObjectNode) child.root("ctx");
    ctx.set("params", withDefaults);
    ctx.put("actionKey", actionKey);
    child.attach("depth", depth + 1);
    if (action.has("when") && !expressions.truthy(expressions.eval(action.get("when"), child))) {
      return json.nullNode();
    }
    JsonNode value = executeSteps(action.path("steps"), child, children, deadline);
    if (step.has("assignTo") && !step.path("assignTo").asText("").isBlank()) {
      setTarget(step.path("assignTo").asText(), value, false, scope);
    }
    return value;
  }

  private ExpressionEngine.Scope forkScope(ExpressionEngine.Scope parent) {
    ExpressionEngine.Scope child = parent.child();
    ObjectNode parentCtx = (ObjectNode) parent.root("ctx");
    ObjectNode ctx = json.createObjectNode();
    ctx.set("params", parentCtx.path("params").deepCopy());
    ctx.set("event", parentCtx.path("event").deepCopy());
    ctx.set("vars", parentCtx.path("vars"));
    ctx.putNull("result");
    ctx.putNull("error");
    ctx.put("actionKey", parentCtx.path("actionKey").asText());
    ctx.put("stepIndex", -1);
    child.put("ctx", ctx);
    return child;
  }

  // ------------------------------------------------------- server-side steps

  private JsonNode validate(JsonNode step, ExpressionEngine.Scope scope) {
    String scopeName = step.path("scope").asText("form");
    if (!"form".equals(scopeName)) {
      throw new BusinessFailure("UNSUPPORTED_STEP",
          "validate 仅支持 scope=form，收到 " + scopeName, List.of(), false);
    }
    JsonNode form = scope.root("form");
    List<String> missing = new ArrayList<>();
    for (JsonNode field : step.path("fields")) {
      String key = field.asText("");
      if (key.isBlank()) {
        continue;
      }
      JsonNode value = form == null ? null : form.get(key);
      if (isMissing(value)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      String message = evalString(step.get("message"), scope);
      String base = message == null ? "请完善必填项" : message;
      throw new BusinessFailure("VALIDATION_FAILED",
          base + "：" + String.join("、", missing), missing, false);
    }
    ObjectNode out = json.createObjectNode();
    out.put("valid", true);
    return out;
  }

  private JsonNode code(JsonNode step, ExpressionEngine.Scope scope) {
    String entry = step.path("entry").asText("");
    if ("calcWorkdays".equals(entry)) {
      return calcWorkdays(step, scope);
    }
    throw new BusinessFailure("UNSUPPORTED_STEP",
        "代码步骤 entry=" + entry + " 未注册，服务端不执行任意脚本", List.of(), true);
  }

  private JsonNode calcWorkdays(JsonNode step, ExpressionEngine.Scope scope) {
    Map<String, JsonNode> inputs = new LinkedHashMap<>();
    for (JsonNode input : step.path("inputs")) {
      String key = input.path("key").asText("");
      if (!key.isBlank()) {
        inputs.put(key, expressions.eval(input.get("value"), scope));
      }
    }
    LocalDate start = dateOf(inputs.get("start"));
    LocalDate end = dateOf(inputs.get("end"));
    ObjectNode out = json.createObjectNode();
    ArrayNode skipped = json.createArrayNode();
    ArrayNode warnings = json.createArrayNode();
    if (start == null || end == null) {
      out.put("days", 0);
      out.set("skipped", skipped);
      warnings.add("时间未填完整");
      out.set("warnings", warnings);
      return assignComputed(step, scope, out);
    }
    if (end.isBefore(start)) {
      out.put("days", 0);
      out.set("skipped", skipped);
      warnings.add("结束时间早于开始时间");
      out.set("warnings", warnings);
      return assignComputed(step, scope, out);
    }

    Map<LocalDate, String> holidays = holidayTypes(inputs.get("holidays"));
    int days = 0;
    for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
      String type = holidays.get(date);
      if ("workday".equals(type)) {
        days++;
        continue;
      }
      boolean weekend = date.getDayOfWeek().getValue() >= 6;
      if (weekend || "holiday".equals(type)) {
        skipped.add(date.toString());
        continue;
      }
      days++;
    }
    String leaveType = expressions.stringify(inputs.get("leaveType"));
    if ("annual".equals(leaveType) && days > 15) {
      warnings.add("年假超过 15 天需院长审批");
    }
    out.put("days", days);
    out.set("skipped", skipped);
    out.set("warnings", warnings);
    return assignComputed(step, scope, out);
  }

  private JsonNode assignComputed(
      JsonNode step, ExpressionEngine.Scope scope, ObjectNode value) {
    String target = step.path("assignTo").asText("");
    if (!target.isBlank()) {
      setTarget(target, value, false, scope);
    }
    return value;
  }

  private JsonNode startFlow(JsonNode step, ExpressionEngine.Scope scope) {
    String flowKey = evalString(step.path("flowRef").get("key"), scope);
    if (flowKey == null) {
      throw new BusinessFailure("BAD_FLOW_REF", "startFlow 缺少 flowRef.key", List.of(), false);
    }
    String businessKey = evalString(step.get("businessKey"), scope);
    if (businessKey == null) {
      throw new BusinessFailure("FLOW_BUSINESS_KEY_REQUIRED",
          "startFlow 缺少 businessKey", List.of(), false);
    }
    Map<String, Object> variables = evalVarsMap(step.get("variables"), scope);
    String processInstanceId = gateway.startFlow(
        appId(scope), flowKey, businessKey, variables);
    if (processInstanceId == null || processInstanceId.isBlank()) {
      throw new BusinessFailure("FLOW_START_FAILED", "流程启动未返回实例 ID", List.of(), true);
    }
    String target = step.path("assignTo").asText("");
    setTarget(target.isBlank() ? "vars.processInstanceId" : target,
        json.getNodeFactory().textNode(processInstanceId), false, scope);
    return json.getNodeFactory().textNode(processInstanceId);
  }

  private JsonNode completeTask(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    String taskId = evalString(step.get("taskId"), scope);
    if (taskId == null) {
      throw new BusinessFailure("FLOW_TASK_REQUIRED", "completeTask 缺少 taskId", List.of(), false);
    }
    String outcome = evalString(step.get("outcome"), scope);
    if (outcome == null) {
      outcome = "approve";
    }
    String comment = evalString(step.get("comment"), scope);
    String nextAssignee = nextAssignee(step, scope);
    Map<String, Object> variables = evalVarsMap(step.get("variables"), scope);
    JsonNode result = gateway.completeTask(
        appId(scope), taskId, outcome, comment, nextAssignee, variables);
    executeSteps(step.path("afterComplete"), scope, children, deadline);
    return result == null ? json.nullNode() : result;
  }

  private String nextAssignee(JsonNode step, ExpressionEngine.Scope scope) {
    JsonNode def = step.get("nextAssignee");
    if (def == null || def.isNull()) {
      return null;
    }
    if (def.isObject()) {
      String type = def.path("type").asText("");
      if ("expression".equals(type)) {
        return evalString(def.get("expr"), scope);
      }
      if ("user".equals(type)) {
        return evalString(def.path("userId"), scope);
      }
    }
    return evalString(def, scope);
  }

  private UUID appId(ExpressionEngine.Scope scope) {
    Object value = scope.attachment("appId");
    if (value instanceof UUID id) {
      return id;
    }
    throw new BusinessFailure("APP_CONTEXT_MISSING", "动作缺少应用上下文", List.of(), true);
  }

  private String evalString(JsonNode expr, ExpressionEngine.Scope scope) {
    if (expr == null) {
      return null;
    }
    JsonNode value = expressions.eval(expr, scope);
    if (value == null || value.isNull() || value.isMissingNode()) {
      return null;
    }
    String text = expressions.stringify(value);
    return text == null || text.isBlank() || "null".equals(text) ? null : text;
  }

  private Map<String, Object> evalVarsMap(JsonNode expr, ExpressionEngine.Scope scope) {
    if (expr == null || expr.isNull()) {
      return Map.of();
    }
    JsonNode value = expressions.eval(expr, scope);
    if (value == null || !value.isObject()) {
      return Map.of();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> out = json.convertValue(value, Map.class);
    return out;
  }

  private static boolean isMissing(JsonNode value) {
    if (value == null || value.isNull() || value.isMissingNode()) {
      return true;
    }
    if (value.isTextual()) {
      return value.asText().isBlank();
    }
    return (value.isArray() || value.isObject()) && value.isEmpty();
  }

  private LocalDate dateOf(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return null;
    }
    String raw = node.asText("").trim();
    if (raw.isEmpty()) {
      return null;
    }
    try {
      return OffsetDateTime.parse(raw).atZoneSameInstant(ZONE).toLocalDate();
    } catch (DateTimeParseException ignored) {
      // 继续尝试无时区格式
    }
    try {
      return LocalDateTime.parse(raw).toLocalDate();
    } catch (DateTimeParseException ignored) {
      // 继续尝试日期
    }
    try {
      return LocalDate.parse(raw);
    } catch (DateTimeParseException ignored) {
      // 继续尝试空格分隔时间
    }
    try {
      return LocalDateTime.parse(raw.replace(' ', 'T')).toLocalDate();
    } catch (DateTimeParseException ignored) {
      // 继续尝试日期前缀
    }
    if (raw.length() >= 10) {
      try {
        return LocalDate.parse(raw.substring(0, 10));
      } catch (DateTimeParseException ignored) {
        // 落到统一错误
      }
    }
    throw new BusinessFailure("BAD_DATE", "无法解析日期：" + raw, List.of(), false);
  }

  private Map<LocalDate, String> holidayTypes(JsonNode node) {
    Map<LocalDate, String> out = new LinkedHashMap<>();
    if (node == null || !node.isArray()) {
      return out;
    }
    for (JsonNode item : node) {
      try {
        LocalDate date = item.isTextual() ? dateOf(item) : dateOf(item.get("date"));
        if (date == null) {
          continue;
        }
        String type = item.isObject() ? item.path("type").asText("holiday") : "holiday";
        out.put(date, "workday".equals(type) ? "workday" : "holiday");
      } catch (BusinessFailure ignored) {
        // 单个非法日历项不影响其余日期
      }
    }
    return out;
  }

  private JsonNode delay(JsonNode step, ExpressionEngine.Scope scope) {
    long ms = Math.max(0, step.path("ms").asLong(0));
    if (ms == 0 && step.has("until")) {
      String raw = expressions.stringify(expressions.eval(step.get("until"), scope));
      Instant until = parseInstant(raw);
      ms = Math.max(0, until.toEpochMilli() - System.currentTimeMillis());
    }
    ms = Math.min(ms, MAX_DELAY_MS);
    try {
      if (ms > 0) {
        Thread.sleep(ms);
      }
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new BusinessFailure("ACTION_INTERRUPTED", "延迟等待被中断", List.of(), false);
    }
    ObjectNode out = json.createObjectNode();
    out.put("delayedMs", ms);
    return out;
  }

  private Instant parseInstant(String raw) {
    try {
      return OffsetDateTime.parse(raw).toInstant();
    } catch (DateTimeParseException ignored) {
      // 继续尝试本地时间
    }
    try {
      return LocalDateTime.parse(raw).atZone(ZONE).toInstant();
    } catch (DateTimeParseException ignored) {
      // 继续尝试日期
    }
    try {
      return LocalDate.parse(raw).atStartOfDay(ZONE).toInstant();
    } catch (DateTimeParseException ex) {
      throw new BusinessFailure("BAD_DATE", "无法解析 until：" + raw, List.of(), false);
    }
  }

  private JsonNode log(JsonNode step, ExpressionEngine.Scope scope) {
    String message = expressions.stringify(expressions.eval(step.get("message"), scope));
    JsonNode data = step.has("data") ? expressions.deepValue(step.get("data"), scope) : null;
    String level = step.path("level").asText("info").toLowerCase(Locale.ROOT);
    switch (level) {
      case "debug" -> log.debug("{} {}", message, data);
      case "warn" -> log.warn("{} {}", message, data);
      case "error" -> log.error("{} {}", message, data);
      default -> log.info("{} {}", message, data);
    }
    return json.getNodeFactory().textNode(message);
  }

  private JsonNode emit(JsonNode step, ExpressionEngine.Scope scope) {
    String event = step.path("event").asText("");
    JsonNode payload = step.has("payload")
        ? expressions.deepValue(step.get("payload"), scope) : json.createObjectNode();
    ObjectNode out = json.createObjectNode();
    out.put("event", event);
    out.set("payload", payload);
    out.put("sync", step.path("sync").asBoolean(false));
    ArrayNode events = (ArrayNode) scope.attachment("events");
    if (events != null) {
      events.add(out.deepCopy());
    }
    return out;
  }

  private void fail(JsonNode step, ExpressionEngine.Scope scope) {
    String message = step.has("message")
        ? expressions.stringify(expressions.eval(step.get("message"), scope)) : "业务规则不通过";
    String code = step.path("code").asText("ACTION_FAILED");
    List<String> fields = new ArrayList<>();
    if (step.has("fields") && step.get("fields").isArray()) {
      step.get("fields").forEach(field -> fields.add(field.asText()));
    }
    throw new BusinessFailure(code, message, fields, step.path("rollback").asBoolean(true));
  }

  private ObjectNode evaluateParams(JsonNode params, ExpressionEngine.Scope scope) {
    if (params == null || !params.isObject()) {
      return json.createObjectNode();
    }
    return (ObjectNode) expressions.deepValue(params, scope);
  }

  private StepTrace trace(
      JsonNode step, String status, long start, String message,
      JsonNode result, List<StepTrace> children) {
    String type = step.path("type").asText("");
    return new StepTrace(
        step.path("id").asText(""),
        type,
        step.path("label").asText(type),
        status,
        millis(start),
        message,
        result,
        children == null ? List.of() : children);
  }

  private BusinessFailure toFailure(RuntimeException ex) {
    if (ex instanceof BusinessFailure failure) {
      return failure;
    }
    if (ex instanceof ExpressionException expression) {
      return new BusinessFailure(expression.code(), expression.getMessage(), List.of(), false);
    }
    if (ex instanceof PlatformException platform) {
      return new BusinessFailure(platform.code(), platform.getMessage(), List.of(), false);
    }
    return new BusinessFailure("RUNTIME_ERROR",
        ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage(),
        List.of(), true);
  }


  // ------------------------------------------------------------- write target

  private void setTarget(String target, JsonNode value, boolean merge, ExpressionEngine.Scope scope) {
    if (target == null || target.isBlank()) {
      throw new BusinessFailure("BAD_TARGET", "写入目标为空", List.of(), false);
    }
    String raw = target.trim();
    if (raw.startsWith("$")) {
      raw = raw.substring(1);
    }
    List<String> segments = ExpressionEngine.parsePath(raw);
    if (segments.isEmpty()) {
      throw new BusinessFailure("BAD_TARGET", "无法解析写入目标：" + target, List.of(), false);
    }
    Target dest = targetOf(segments.get(0), scope);
    JsonNode normalized = value == null ? json.nullNode() : value;
    if (segments.size() <= dest.offset()) {
      dest.write(mergeValue(dest.container(), normalized, merge));
      return;
    }
    dest.write(writePath(dest.container(), segments, dest.offset(), normalized, merge));
  }

  private Target targetOf(String head, ExpressionEngine.Scope scope) {
    return switch (head) {
      case "state" -> {
        ObjectNode page = object(scope.root("page"));
        JsonNode state = page.get("state");
        if (state == null || !state.isObject()) {
          state = json.createObjectNode();
          page.set("state", state);
        }
        yield new Target(state, value -> page.set("state", value), 1);
      }
      case "vars" -> {
        ObjectNode ctx = object(scope.root("ctx"));
        JsonNode vars = ctx.get("vars");
        if (vars == null || (!vars.isObject() && !vars.isArray())) {
          vars = json.createObjectNode();
          ctx.set("vars", vars);
        }
        yield new Target(vars, value -> ctx.set("vars", value), 1);
      }
      case "form" -> rootTarget("form", scope, json.createObjectNode());
      case "row" -> rootTarget("row", scope, json.createObjectNode());
      case "rows" -> rootTarget("rows", scope, json.createArrayNode());
      case "data" -> rootTarget("data", scope, json.createObjectNode());
      case "page" -> rootTarget("page", scope, json.createObjectNode());
      case "ctx" -> rootTarget("ctx", scope, json.createObjectNode());
      case "process" -> rootTarget("process", scope, json.createObjectNode());
      case "component" -> rootTarget("component", scope, json.createObjectNode());
      default -> throw new BusinessFailure(
          "BAD_TARGET", "不支持的写入根：" + head, List.of(), false);
    };
  }

  private Target rootTarget(String name, ExpressionEngine.Scope scope, JsonNode fallback) {
    JsonNode current = scope.root(name);
    if (current == null || current.isNull()) {
      current = fallback;
      scope.put(name, current);
    }
    return new Target(current, value -> scope.put(name, value), 1);
  }

  private JsonNode writePath(
      JsonNode current, List<String> segments, int pos, JsonNode value, boolean merge) {
    if (pos >= segments.size()) {
      return mergeValue(current, value, merge);
    }
    String key = segments.get(pos);
    boolean index = isIndex(key);
    if (current == null || current.isNull() || (!current.isObject() && !current.isArray())) {
      current = index ? json.createArrayNode() : json.createObjectNode();
    }
    if (current.isArray()) {
      if (!index) {
        throw new BusinessFailure(
            "BAD_TARGET", "数组下标必须是数字：" + key, List.of(), false);
      }
      int at = Integer.parseInt(key);
      while (current.size() <= at) {
        ((ArrayNode) current).addNull();
      }
      JsonNode updated = writePath(current.get(at), segments, pos + 1, value, merge);
      ((ArrayNode) current).set(at, updated);
      return current;
    }
    JsonNode updated = writePath(current.get(key), segments, pos + 1, value, merge);
    ((ObjectNode) current).set(key, updated);
    return current;
  }

  private JsonNode mergeValue(JsonNode current, JsonNode value, boolean merge) {
    if (!merge || value == null || !value.isObject()) {
      return value;
    }
    ObjectNode base = current != null && current.isObject()
        ? ((ObjectNode) current).deepCopy() : json.createObjectNode();
    value.fields().forEachRemaining(entry -> base.set(entry.getKey(), entry.getValue().deepCopy()));
    return base;
  }

  private boolean isIndex(String segment) {
    if (segment == null || segment.isEmpty()) {
      return false;
    }
    for (int i = 0; i < segment.length(); i++) {
      if (!Character.isDigit(segment.charAt(i))) {
        return false;
      }
    }
    return true;
  }

  private record Target(
      JsonNode container, java.util.function.Consumer<JsonNode> setter, int offset) {

    void write(JsonNode value) {
      setter.accept(value);
    }
  }

  // ------------------------------------------------------------------ api call

  private JsonNode apiCall(
      JsonNode step, ExpressionEngine.Scope scope, List<StepTrace> children, long deadline) {
    String apiKey = step.path("apiRef").path("key").asText("");
    if (apiKey.isBlank()) {
      throw new BusinessFailure("BAD_API_REF", "apiCall 缺少 apiRef.key", List.of(), false);
    }
    JsonNode bundle = (JsonNode) scope.attachment("bundle");
    JsonNode api = bundles.api(bundle, apiKey);
    if (api == null) {
      throw new BusinessFailure("API_NOT_FOUND", "API 不存在：" + apiKey, List.of(), false);
    }

    ObjectNode callParams = evaluateParams(step.get("params"), scope);
    ExpressionEngine.Scope apiScope = forkScope(scope);
    ObjectNode apiCtx = (ObjectNode) apiScope.root("ctx");
    apiCtx.set("params", callParams.deepCopy());
    apiCtx.put("apiKey", apiKey);

    if (api.path("before").isArray() && !api.path("before").isEmpty()) {
      executeSteps(api.get("before"), apiScope, children, deadline);
    }

    JsonNode response;
    if (api.path("mock").path("enabled").asBoolean(false)) {
      response = mockResponse(api, apiScope);
    } else {
      String kind = api.path("kind").asText("rest");
      if ("internal".equals(kind)) {
        response = invokeInternal(api, apiKey, callParams, apiScope);
      } else if ("rest".equals(kind)) {
        JsonNode retry = step.has("retry") ? step.get("retry") : api.path("retry");
        if (isPlaceholderHolidayApi(api)) {
          log.warn("节假日日历使用占位服务，API {} 已降级为空日历", apiKey);
          response = emptyResponse();
        } else {
          response = invokeHttp(api, "rest", apiKey, callParams, apiScope, retry, deadline);
        }
      } else if ("graphql".equals(kind)) {
        JsonNode retry = step.has("retry") ? step.get("retry") : api.path("retry");
        response = invokeHttp(api, "graphql", apiKey, callParams, apiScope, retry, deadline);
        JsonNode errors = response.path("body").path("errors");
        if (errors.isArray() && !errors.isEmpty()) {
          throw new BusinessFailure("API_GRAPHQL_ERROR",
              "API " + apiKey + " GraphQL 返回错误：" + abbreviate(errors.toString()),
              List.of(), false);
        }
      } else if ("soap".equals(kind)) {
        JsonNode retry = step.has("retry") ? step.get("retry") : api.path("retry");
        response = invokeSoap(api, apiKey, callParams, apiScope, retry, deadline);
        String fault = xml.faultMessage(response.path("body"));
        if (fault != null) {
          throw new BusinessFailure("API_SOAP_FAULT",
              "API " + apiKey + " SOAP Fault：" + fault, List.of(), false);
        }
      } else if ("database".equals(kind)) {
        response = invokeDatabase(api, apiKey, apiScope, callParams);
      } else {
        throw new BusinessFailure("UNSUPPORTED_API",
            "API " + apiKey + " 的 kind=" + kind + " 尚未接入运行时连接器", List.of(), false);
      }
    }

    ExpressionEngine.Scope resScope = apiScope.child();
    resScope.put("res", response);
    ensureApiSuccess(api, apiKey, response, resScope);

    JsonNode output = mapResponse(api.path("response"), response.path("body"), resScope);
    if (step.has("resultPath") && !step.path("resultPath").asText("").isBlank()) {
      output = expressions.jsonPath(output, step.path("resultPath").asText());
    }
    if (api.path("after").isArray() && !api.path("after").isEmpty()) {
      ObjectNode afterCtx = (ObjectNode) apiScope.root("ctx");
      afterCtx.set("result", output == null ? json.nullNode() : output);
      executeSteps(api.get("after"), apiScope, children, deadline);
    }
    if (step.has("assignTo") && !step.path("assignTo").asText("").isBlank()) {
      setTarget(step.path("assignTo").asText(), output, false, scope);
    }
    return output;
  }

  private JsonNode mockResponse(JsonNode api, ExpressionEngine.Scope scope) {
    JsonNode mock = api.path("mock");
    long delay = Math.max(0, Math.min(MAX_DELAY_MS, mock.path("delayMs").asLong(0)));
    sleep(delay);
    JsonNode errorRate = mock.get("errorRate");
    if (errorRate != null && errorRate.isNumber()
        && ThreadLocalRandom.current().nextDouble() < errorRate.asDouble()) {
      throw new BusinessFailure("API_MOCK_ERROR", "API mock 命中 errorRate", List.of(), false);
    }
    JsonNode data = mock.has("data")
        ? expressions.deepValue(mock.get("data"), scope) : json.createObjectNode();
    ObjectNode response = json.createObjectNode();
    response.put("status", 200);
    response.set("body", data == null ? json.nullNode() : data);
    response.set("headers", json.createObjectNode());
    response.put("mock", true);
    return response;
  }

  private JsonNode invokeInternal(
      JsonNode api, String apiKey, ObjectNode callParams, ExpressionEngine.Scope apiScope) {
    Map<String, String> pathValues = pathValues(api, callParams, apiScope);
    JsonNode body = gateway.invokeInternalApi(
        (JsonNode) apiScope.attachment("bundle"),
        apiKey,
        api.path("method").asText("GET"),
        api.path("path").asText(""),
        pathValues,
        callParams);
    ObjectNode response = json.createObjectNode();
    response.put("status", 200);
    response.set("body", body == null ? json.nullNode() : body);
    response.set("headers", json.createObjectNode());
    response.put("internal", true);
    return response;
  }

  private JsonNode emptyResponse() {
    ObjectNode body = json.createObjectNode();
    body.put("code", 0);
    body.set("data", json.createArrayNode());
    ObjectNode response = json.createObjectNode();
    response.put("status", 200);
    response.set("body", body);
    response.set("headers", json.createObjectNode());
    return response;
  }

  private boolean isPlaceholderHolidayApi(JsonNode api) {
    String baseUrl = api.path("baseUrl").asText("");
    if (baseUrl.isBlank()) {
      return false;
    }
    try {
      return "open.example.gov.cn".equalsIgnoreCase(URI.create(baseUrl).getHost());
    } catch (IllegalArgumentException ex) {
      return false;
    }
  }

  private Map<String, String> pathValues(
      JsonNode api, ObjectNode callParams, ExpressionEngine.Scope apiScope) {
    LinkedHashMap<String, String> values = new LinkedHashMap<>();
    for (JsonNode def : api.path("request").path("path")) {
      String key = def.path("key").asText("");
      Object value = apiParamValue(def, callParams, apiScope);
      if (value != null) {
        values.put(key, stringValue(value));
      }
    }
    return values;
  }

  private JsonNode invokeHttp(
      JsonNode api, String kind, String apiKey, ObjectNode callParams,
      ExpressionEngine.Scope apiScope, JsonNode retry, long deadline) {
    String method = "graphql".equals(kind)
        ? "POST" : api.path("method").asText("GET").toUpperCase(Locale.ROOT);
    ConnectionService.RuntimeConnection connection = resolveConnection(api, apiKey, kind);
    JsonNode connectionConfig = connection == null
        ? json.createObjectNode() : connection.config();
    String baseUrl = api.path("baseUrl").asText("");
    if (baseUrl.isBlank() && connection != null && connection.baseUrl() != null) {
      baseUrl = connection.baseUrl();
    }
    if (baseUrl.isBlank()) {
      throw new BusinessFailure("API_NO_BASE_URL",
          "API " + apiKey + " 未配置 baseUrl，运行时无法直连", List.of(), false);
    }
    Map<String, String> pathValues = pathValues(api, callParams, apiScope);
    String path = applyPathParams(api.path("path").asText(""), pathValues, apiKey);
    JsonNode apiAuth = api.path("auth");
    JsonNode auth = apiAuth.isMissingNode() || apiAuth.isNull()
        ? connectionConfig.path("auth") : apiAuth;
    ConnectorRuntime.AuthResult authResult = connectors.auth(auth, apiKey);
    URI uri = buildUri(
        baseUrl, path, api.path("request").path("query"), callParams, apiScope, apiKey,
        authResult.query());

    long defaultTimeout = connectionConfig.path("timeoutMs").asLong(10_000);
    long timeout = Math.max(1, api.has("timeoutMs")
        ? api.path("timeoutMs").asLong(defaultTimeout) : defaultTimeout);
    timeout = remainingMillis(deadline, timeout);
    HttpPayload payload = "graphql".equals(kind)
        ? graphqlPayload(api, apiScope) : requestPayload(api, apiScope);

    Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    addConnectionHeaders(connectionConfig.path("headers"), headers);
    addApiHeaders(api.path("request").path("headers"), callParams, apiScope, headers);
    if (payload != null) {
      headers.put("Content-Type", payload.contentType());
    }
    headers.putAll(authResult.headers());
    connectors.sign(auth, method, uri.getRawPath(), uri.getRawQuery(),
        payload == null ? "" : payload.body(), headers);

    int maxAttempts = Math.max(1, Math.min(10, retry.path("maxAttempts").asInt(1)));
    String backoff = retry.path("backoff").asText("none");
    List<Integer> retryOn = retryStatuses(retry);
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        PinnedHttpTransport.Response response = connectors.send(
            uri, method, headers, payload == null ? null : payload.body(), timeout);
        JsonNode envelope = responseNode(response);
        if (attempt < maxAttempts && retryOn.contains(response.status())) {
          sleep(backoffMillis(backoff, attempt));
          continue;
        }
        return envelope;
      } catch (IOException ex) {
        if (attempt >= maxAttempts) {
          throw new BusinessFailure("API_IO",
              "API " + apiKey + " 网络请求失败（" + ex.getClass().getSimpleName() + "）",
              List.of(), false);
        }
        sleep(backoffMillis(backoff, attempt));
      } catch (IllegalArgumentException ex) {
        throw new BusinessFailure("API_REQUEST",
            "API " + apiKey + " 请求构造失败，请检查地址与请求头", List.of(), false);
      }
    }
    throw new BusinessFailure("API_IO", "API " + apiKey + " 请求失败", List.of(), false);
  }

  private JsonNode invokeSoap(
      JsonNode api, String apiKey, ObjectNode callParams, ExpressionEngine.Scope apiScope,
      JsonNode retry, long deadline) {
    ConnectionService.RuntimeConnection connection = resolveConnection(api, apiKey, "soap");
    JsonNode config = connection == null ? json.createObjectNode() : connection.config();
    String baseUrl = api.path("baseUrl").asText("");
    if (baseUrl.isBlank() && connection != null && connection.baseUrl() != null) {
      baseUrl = connection.baseUrl();
    }
    if (baseUrl.isBlank()) {
      throw new BusinessFailure("API_NO_BASE_URL",
          "API " + apiKey + " 未配置 SOAP 地址", List.of(), false);
    }
    String path = applyPathParams(api.path("path").asText(""),
        pathValues(api, callParams, apiScope), apiKey);
    URI uri = buildUri(baseUrl, path, json.createArrayNode(), json.createObjectNode(), apiScope,
        apiKey, List.of());
    String body = soapBody(api, apiScope, apiKey);
    JsonNode apiAuth = api.path("auth");
    JsonNode auth = apiAuth.isMissingNode() || apiAuth.isNull() ? config.path("auth") : apiAuth;
    ConnectorRuntime.AuthResult authResult = connectors.auth(auth, apiKey);
    Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    addConnectionHeaders(config.path("headers"), headers);
    addApiHeaders(api.path("request").path("headers"), callParams, apiScope, headers);
    headers.put("Content-Type", "text/xml; charset=utf-8");
    headers.put("Accept", "text/xml, application/soap+xml");
    String action = api.path("x-soapAction").asText(config.path("soapAction").asText(""));
    if (!action.isBlank()) {
      headers.put("SOAPAction", action);
    }
    headers.putAll(authResult.headers());
    connectors.sign(auth, "POST", uri.getRawPath(), uri.getRawQuery(), body, headers);

    long timeout = remainingMillis(deadline, api.has("timeoutMs")
        ? api.path("timeoutMs").asLong(10_000) : config.path("timeoutMs").asLong(10_000));
    int maxAttempts = Math.max(1, Math.min(10, retry.path("maxAttempts").asInt(1)));
    String backoff = retry.path("backoff").asText("none");
    List<Integer> retryOn = retryStatuses(retry);
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        PinnedHttpTransport.Response response = connectors.send(
            uri, "POST", headers, body, timeout);
        ObjectNode envelope = json.createObjectNode();
        envelope.put("status", response.status());
        envelope.set("body", xml.parse(response.body()));
        ObjectNode responseHeaders = envelope.putObject("headers");
        response.headers().forEach((name, values) -> responseHeaders.put(name,
            String.join(",", values)));
        if (attempt < maxAttempts && retryOn.contains(response.status())) {
          sleep(backoffMillis(backoff, attempt));
          continue;
        }
        return envelope;
      } catch (IOException ex) {
        if (attempt >= maxAttempts) {
          throw new BusinessFailure("API_IO",
              "API " + apiKey + " SOAP 请求失败（" + ex.getClass().getSimpleName() + "）",
              List.of(), false);
        }
        sleep(backoffMillis(backoff, attempt));
      }
    }
    throw new BusinessFailure("API_IO", "API " + apiKey + " SOAP 请求失败", List.of(), false);
  }

  private JsonNode invokeDatabase(
      JsonNode api, String apiKey, ExpressionEngine.Scope apiScope, ObjectNode callParams) {
    ConnectionService.RuntimeConnection connection = resolveConnection(api, apiKey, "database");
    if (connection == null) {
      throw new BusinessFailure("API_NO_CONNECTION",
          "API " + apiKey + " 的 database 调用必须引用连接器", List.of(), false);
    }
    JsonNode request = expressions.deepValue(api.path("request").path("body").path("mapping"), apiScope);
    if (request == null || !request.isObject()) {
      request = json.createObjectNode();
    }
    ObjectNode body = json.createObjectNode();
    body.put("status", 200);
    body.set("body", connectors.queryDatabase(connection, request, apiKey));
    body.set("headers", json.createObjectNode());
    return body;
  }

  private HttpPayload graphqlPayload(JsonNode api, ExpressionEngine.Scope apiScope) {
    JsonNode body = api.path("request").path("body");
    JsonNode raw = body.has("raw") ? expressions.eval(body.get("raw"), apiScope) : null;
    JsonNode mapping = body.has("mapping")
        ? expressions.deepValue(body.get("mapping"), apiScope) : null;
    ObjectNode payload = json.createObjectNode();
    if (raw != null && !raw.isNull()) {
      if (raw.isObject() && raw.has("query")) {
        payload = (ObjectNode) raw.deepCopy();
      } else {
        payload.put("query", raw.isTextual() ? raw.asText() : raw.toString());
      }
    } else if (mapping != null && mapping.isObject()) {
      payload = (ObjectNode) mapping.deepCopy();
      if (!payload.has("query") && payload.has("queryText")) {
        payload.set("query", payload.remove("queryText"));
      }
    }
    if (payload.path("query").asText("").isBlank()) {
      throw new BusinessFailure("API_GRAPHQL_QUERY",
          "GraphQL API 必须在 request.body.raw 或 mapping 中提供 query", List.of(), false);
    }
    try {
      return new HttpPayload("application/json", json.writeValueAsString(payload));
    } catch (Exception ex) {
      throw new BusinessFailure("API_BODY", "GraphQL 请求体序列化失败", List.of(), false);
    }
  }

  private String soapBody(JsonNode api, ExpressionEngine.Scope apiScope, String apiKey) {
    JsonNode body = api.path("request").path("body");
    JsonNode raw = body.has("raw") ? expressions.eval(body.get("raw"), apiScope) : null;
    if (raw == null || raw.isNull()) {
      JsonNode mapping = body.has("mapping")
          ? expressions.deepValue(body.get("mapping"), apiScope) : null;
      raw = mapping == null ? null : mapping.get("envelope");
    }
    if (raw == null || raw.isNull() || raw.asText("").isBlank()) {
      throw new BusinessFailure("API_SOAP_BODY",
          "API " + apiKey + " 必须在 request.body 中提供 XML envelope", List.of(), false);
    }
    return raw.isTextual() ? raw.asText() : raw.toString();
  }

  private ConnectionService.RuntimeConnection resolveConnection(
      JsonNode api, String apiKey, String expectedKind) {
    JsonNode ref = api.path("connectionRef");
    if (ref.isMissingNode() || ref.isNull() || ref.isTextual() && ref.asText().isBlank()) {
      if ("database".equals(expectedKind)) {
        throw new BusinessFailure("API_NO_CONNECTION",
            "API " + apiKey + " 的 database 调用必须引用连接器", List.of(), false);
      }
      return null;
    }
    String kind = ref.isTextual() ? "connection" : ref.path("kind").asText("connection");
    if (!kind.isBlank() && !"connection".equals(kind)) {
      throw new BusinessFailure("CONNECTION_REF_INVALID",
          "API " + apiKey + " 的 connectionRef.kind 必须是 connection", List.of(), false);
    }
    String value = ref.isTextual() ? ref.asText() : ref.path("key").asText("");
    if (value.isBlank() && !ref.isTextual()) {
      value = ref.path("id").asText("");
    }
    if (value.isBlank()) {
      throw new BusinessFailure("CONNECTION_REF_INVALID",
          "API " + apiKey + " 的 connectionRef 缺少 key 或 id", List.of(), false);
    }
    ConnectionService.RuntimeConnection connection = connections.runtime(value);
    if (connection == null) {
      throw new BusinessFailure("CONNECTION_NOT_FOUND",
          "连接器 " + value + " 不存在", List.of(), false);
    }
    if (!connection.enabled()) {
      throw new BusinessFailure("CONNECTION_DISABLED",
          "连接器 " + value + " 已停用", List.of(), false);
    }
    if (!expectedKind.equals(connection.kind())) {
      throw new BusinessFailure("CONNECTION_KIND_MISMATCH",
          "API " + apiKey + " 的 kind=" + expectedKind + " 与连接器 " + value
              + " 的 kind=" + connection.kind() + " 不一致", List.of(), false);
    }
    return connection;
  }

  private void addConnectionHeaders(JsonNode headers, Map<String, String> merged) {
    if (!headers.isArray()) {
      return;
    }
    for (JsonNode header : headers) {
      String name = header.path("name").asText("");
      String value = header.path("value").asText("");
      if (!name.isBlank()) {
        merged.put(name, value);
      }
    }
  }

  private void addApiHeaders(
      JsonNode headers, ObjectNode callParams, ExpressionEngine.Scope apiScope,
      Map<String, String> merged) {
    for (JsonNode header : headers) {
      String name = header.path("name").asText("");
      if (name.isBlank()) {
        continue;
      }
      String value = headerValue(header, callParams, apiScope);
      if (value != null) {
        merged.put(name, value);
      }
    }
  }

  private Object apiParamValue(
      JsonNode def, ObjectNode callParams, ExpressionEngine.Scope apiScope) {
    String key = def.path("key").asText("");
    if (def.has("source")) {
      JsonNode value = expressions.eval(def.get("source"), apiScope);
      if (value != null && !value.isNull()) {
        return json.convertValue(value, Object.class);
      }
    }
    if (!key.isEmpty() && callParams.has(key) && !callParams.get(key).isNull()) {
      return json.convertValue(callParams.get(key), Object.class);
    }
    if (def.has("defaultValue")) {
      return json.convertValue(def.get("defaultValue"), Object.class);
    }
    if (def.path("required").asBoolean(false)) {
      throw new BusinessFailure("API_PARAM_MISSING", "API 参数缺失：" + key, List.of(), false);
    }
    return null;
  }

  private String headerValue(
      JsonNode def, ObjectNode callParams, ExpressionEngine.Scope apiScope) {
    if (def.has("value")) {
      JsonNode value = expressions.eval(def.get("value"), apiScope);
      if (value != null && !value.isNull()) {
        return expressions.stringify(value);
      }
    }
    String name = def.path("name").asText("");
    if (!name.isEmpty() && callParams.has(name) && !callParams.get(name).isNull()) {
      return expressions.stringify(callParams.get(name));
    }
    if (def.has("defaultValue")) {
      return expressions.stringify(def.get("defaultValue"));
    }
    if (def.path("required").asBoolean(false)) {
      throw new BusinessFailure("API_PARAM_MISSING", "API 请求头缺失：" + name, List.of(), false);
    }
    return null;
  }

  private String applyPathParams(String path, Map<String, String> values, String apiKey) {
    String resolved = path == null ? "" : path;
    for (Map.Entry<String, String> entry : values.entrySet()) {
      String encoded = URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8);
      resolved = resolved.replace(":" + entry.getKey(), encoded)
          .replace("{" + entry.getKey() + "}", encoded);
    }
    boolean unresolved = resolved.matches(".*:[A-Za-z_][A-Za-z0-9_]*.*")
        || resolved.matches(".*\\{[A-Za-z_][A-Za-z0-9_]*\\}.*");
    if (unresolved) {
      throw new BusinessFailure("API_PATH_PARAM",
          "API " + apiKey + " 路径占位符未解析：" + resolved, List.of(), false);
    }
    return resolved;
  }

  private URI buildUri(
      String baseUrl, String path, JsonNode queryDefs, ObjectNode callParams,
      ExpressionEngine.Scope apiScope, String apiKey,
      List<ConnectorRuntime.QueryParam> authQuery) {
    StringBuilder url = new StringBuilder(baseUrl.endsWith("/")
        ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
    if (path != null && !path.isEmpty()) {
      if (!path.startsWith("/")) {
        url.append('/');
      }
      url.append(path);
    }
    StringBuilder query = new StringBuilder();
    for (JsonNode def : queryDefs) {
      String key = def.path("key").asText("");
      Object value = apiParamValue(def, callParams, apiScope);
      if (value == null || key.isBlank()) {
        continue;
      }
      if (query.length() > 0) {
        query.append('&');
      }
      query.append(URLEncoder.encode(key, StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(stringValue(value), StandardCharsets.UTF_8));
    }
    for (ConnectorRuntime.QueryParam param : authQuery) {
      if (query.length() > 0) {
        query.append('&');
      }
      query.append(URLEncoder.encode(param.name(), StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(param.value(), StandardCharsets.UTF_8));
    }
    if (query.length() > 0) {
      url.append(url.indexOf("?") >= 0 ? '&' : '?').append(query);
    }
    try {
      return URI.create(url.toString());
    } catch (IllegalArgumentException ex) {
      throw new BusinessFailure("API_URL",
          "API " + apiKey + " 地址非法，请检查 baseUrl、路径与查询参数", List.of(), false);
    }
  }

  private HttpPayload requestPayload(JsonNode api, ExpressionEngine.Scope apiScope) {
    JsonNode body = api.path("request").path("body");
    if (!body.isObject() || body.isEmpty()) {
      return null;
    }
    String contentType = body.path("contentType").asText("application/json");
    JsonNode payload = body.has("raw")
        ? expressions.eval(body.get("raw"), apiScope)
        : body.has("mapping")
            ? expressions.deepValue(body.get("mapping"), apiScope)
            : json.createObjectNode();
    if (contentType.startsWith("application/json")) {
      try {
        return new HttpPayload(contentType, json.writeValueAsString(payload));
      } catch (Exception ex) {
        throw new BusinessFailure("API_BODY", "请求体序列化失败：" + ex.getMessage(), List.of(), false);
      }
    }
    if ("application/x-www-form-urlencoded".equals(contentType)) {
      StringBuilder form = new StringBuilder();
      if (payload.isObject()) {
        payload.fields().forEachRemaining(entry -> {
          if (form.length() > 0) {
            form.append('&');
          }
          form.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
              .append('=')
              .append(URLEncoder.encode(stringValue(entry.getValue()), StandardCharsets.UTF_8));
        });
      }
      return new HttpPayload(contentType, form.toString());
    }
    if (contentType.startsWith("text/")) {
      return new HttpPayload(contentType, expressions.stringify(payload));
    }
    throw new BusinessFailure("UNSUPPORTED_CONTENT_TYPE",
        "请求体类型 " + contentType + " 尚未接入", List.of(), false);
  }

  private JsonNode responseNode(PinnedHttpTransport.Response response) {
    ObjectNode out = json.createObjectNode();
    out.put("status", response.status());
    out.set("body", parseBody(response.body(), response.firstHeader("content-type")));
    ObjectNode headers = json.createObjectNode();
    response.headers().forEach((name, values) -> {
      if (values == null || values.isEmpty()) {
        headers.put(name, "");
      } else if (values.size() == 1) {
        headers.put(name, values.get(0));
      } else {
        ArrayNode list = json.createArrayNode();
        values.forEach(list::add);
        headers.set(name, list);
      }
    });
    out.set("headers", headers);
    return out;
  }

  private static String abbreviate(String value) {
    if (value == null) {
      return "";
    }
    String compact = value.replaceAll("\\s+", " ").trim();
    return compact.length() <= 300 ? compact : compact.substring(0, 300) + "…";
  }

  private JsonNode parseBody(String raw, String contentType) {
    if (raw == null || raw.isBlank()) {
      return json.nullNode();
    }
    String trimmed = raw.trim();
    if (contentType.toLowerCase(Locale.ROOT).contains("json")
        || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return json.readTree(raw);
      } catch (Exception ignored) {
        return json.getNodeFactory().textNode(raw);
      }
    }
    return json.getNodeFactory().textNode(raw);
  }

  private void ensureApiSuccess(
      JsonNode api, String apiKey, JsonNode response, ExpressionEngine.Scope resScope) {
    JsonNode responseDef = api.path("response");
    boolean ok;
    if (responseDef.has("successWhen")) {
      ok = expressions.truthy(expressions.eval(responseDef.get("successWhen"), resScope));
    } else {
      int status = response.path("status").asInt(0);
      JsonNode body = response.path("body");
      JsonNode code = body.isObject() ? body.get("code") : null;
      boolean codeOk = code == null || code.isNull()
          || code.asInt(-1) == 0 || code.asInt(-1) == 200;
      ok = status >= 200 && status < 300 && codeOk;
    }
    if (ok) {
      return;
    }
    JsonNode body = response.path("body");
    String message = "";
    String messagePath = responseDef.path("errorMessagePath").asText("");
    if (!messagePath.isBlank()) {
      message = expressions.stringify(expressions.jsonPath(body, messagePath));
    }
    if (message.isBlank() || "null".equals(message)) {
      String errorPath = responseDef.path("errorPath").asText("");
      if (!errorPath.isBlank()) {
        message = expressions.stringify(expressions.jsonPath(body, errorPath));
      }
    }
    if (message.isBlank() || "null".equals(message)) {
      message = "API " + apiKey + " 调用失败（HTTP " + response.path("status").asInt() + "）";
    }
    throw new BusinessFailure("API_FAILED", message, List.of(), false);
  }

  private JsonNode mapResponse(
      JsonNode responseDef, JsonNode body, ExpressionEngine.Scope resScope) {
    JsonNode mapping = responseDef.path("mapping");
    if (!mapping.isObject() || mapping.isEmpty()) {
      return outputPath(responseDef, body);
    }
    ObjectNode out = json.createObjectNode();
    mapping.fields().forEachRemaining(entry -> {
      JsonNode spec = entry.getValue();
      if (spec == null || spec.isNull()) {
        out.putNull(entry.getKey());
        return;
      }
      if (spec.isTextual()) {
        String text = spec.asText();
        if (text.startsWith("$")) {
          out.set(entry.getKey(), expressions.jsonPath(body, text));
        } else {
          out.set(entry.getKey(), spec.deepCopy());
        }
        return;
      }
      out.set(entry.getKey(), expressions.deepValue(spec, resScope));
    });
    // 单条读取接口约定 response.mapping = { item: "$.data" }，下游按记录而不是包装对象使用。
    if (out.size() == 1 && out.has("item")) {
      return out.get("item");
    }
    return out;
  }

  private JsonNode outputPath(JsonNode responseDef, JsonNode body) {
    String rowsPath = responseDef.path("rowsPath").asText("");
    if (!rowsPath.isBlank()) {
      JsonNode rows = expressions.jsonPath(body, rowsPath);
      String totalPath = responseDef.path("totalPath").asText("");
      if (!totalPath.isBlank()) {
        ObjectNode page = json.createObjectNode();
        page.set("rows", rows == null ? json.nullNode() : rows);
        JsonNode total = expressions.jsonPath(body, totalPath);
        page.set("total", total == null ? json.nullNode() : total);
        return page;
      }
      return rows == null ? json.nullNode() : rows;
    }
    String itemPath = responseDef.path("itemPath").asText("");
    if (!itemPath.isBlank()) {
      JsonNode item = expressions.jsonPath(body, itemPath);
      return item == null ? json.nullNode() : item;
    }
    return body == null ? json.nullNode() : body;
  }

  private List<Integer> retryStatuses(JsonNode retry) {
    List<Integer> statuses = new ArrayList<>();
    JsonNode configured = retry.path("retryOn");
    if (configured.isArray() && !configured.isEmpty()) {
      configured.forEach(item -> statuses.add(item.asInt()));
    } else if (retry.path("maxAttempts").asInt(1) > 1) {
      statuses.addAll(List.of(502, 503, 504));
    }
    return statuses;
  }

  private long backoffMillis(String backoff, int attempt) {
    return switch (backoff) {
      case "linear" -> 200L * attempt;
      case "exponential" -> 200L * (1L << Math.min(attempt - 1, 4));
      default -> 0L;
    };
  }

  private long remainingMillis(long deadline, long fallback) {
    if (deadline <= 0) {
      return fallback;
    }
    long left = (deadline - System.nanoTime()) / 1_000_000L;
    return Math.max(1, Math.min(fallback, Math.max(0, left)));
  }

  private void sleep(long millis) {
    if (millis <= 0) {
      return;
    }
    try {
      Thread.sleep(Math.min(millis, MAX_DELAY_MS));
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new BusinessFailure("ACTION_INTERRUPTED", "等待被中断", List.of(), false);
    }
  }

  private String stringValue(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof JsonNode node) {
      return node.isValueNode() ? node.asText() : node.toString();
    }
    if (value instanceof String text) {
      return text;
    }
    if (value instanceof Number || value instanceof Boolean) {
      return String.valueOf(value);
    }
    try {
      return json.writeValueAsString(value);
    } catch (Exception ignored) {
      return String.valueOf(value);
    }
  }

  private record HttpPayload(String contentType, String body) {
  }
}
