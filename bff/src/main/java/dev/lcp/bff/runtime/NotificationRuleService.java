package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.engine.ExpressionEngine;
import dev.lcp.bff.tenant.TenantContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 发布态通知规则执行器。规则失败只记日志，不影响审批主链路。
 * 站内信与审批同事务落库；webhook/email 仅写 outbox。
 */
@Service
public class NotificationRuleService {

  private static final Logger log = LoggerFactory.getLogger(NotificationRuleService.class);

  private final ExpressionEngine expressions;
  private final ObjectMapper json;
  private final RuntimeUserDirectory users;
  private final NotificationService notifications;

  public NotificationRuleService(
      ExpressionEngine expressions,
      ObjectMapper json,
      RuntimeUserDirectory users,
      NotificationService notifications) {
    this.expressions = expressions;
    this.json = json;
    this.users = users;
    this.notifications = notifications;
  }

  public record Event(
      String name,
      PublishedBundle published,
      JsonNode flow,
      JsonNode entity,
      String businessKey,
      String businessTitle,
      Map<String, Object> business,
      Map<String, Object> variables,
      String processInstanceId,
      String taskId,
      String taskName,
      String assignee,
      String bizType,
      String bizId,
      String link,
      String defaultTitle,
      String defaultBody) {
  }

  public void fire(Event event) {
    if (event == null || event.published() == null || event.name() == null) {
      return;
    }
    Map<String, Object> business = event.business() == null ? Map.of() : event.business();
    ExpressionEngine.Scope scope = scope(event, business);
    List<JsonNode> rules = rules(event.published().content(), event.entity(), event.name());
    for (JsonNode rule : rules) {
      try {
        JsonNode notification = rule.path("notification");
        if (!notification.isObject()) {
          continue;
        }
        JsonNode when = rule.get("when");
        if (when != null && !expressions.truthy(expressions.eval(when, scope))) {
          continue;
        }
        List<String> targets = targets(notification.path("targets"), business);
        sendSpec(event, notification, targets, "rule:" + rule.path("key").asText("rule"));
      } catch (RuntimeException ex) {
        log.warn("通知规则 {} 执行失败，event={} app={}: {}",
            rule.path("key").asText("?"), event.name(), event.published().appId(),
            ex.getMessage());
      }
    }
  }

  /** SLA 等平台事件直接使用 NotificationSpec，不再要求额外写一条规则。 */
  public void sendSpec(Event event, JsonNode spec, List<String> targets, String fallbackKey) {
    if (event == null || spec == null || !spec.isObject()) {
      return;
    }
    List<String> recipients = dedupe(targets);
    Map<String, Object> business = event.business() == null ? Map.of() : event.business();
    ExpressionEngine.Scope scope = scope(event, business);
    String title = text(spec.get("title"), scope, event.defaultTitle());
    String body = text(spec.get("body"), scope, event.defaultBody());
    String link = text(spec.get("link"), scope, event.link());
    String idemBase = text(spec.get("idempotencyKey"), scope, null);
    if (idemBase == null || idemBase.isBlank()) {
      idemBase = fallbackKey + ":" + event.name() + ":"
          + value(event.bizType()) + ":" + value(event.bizId());
    }
    Set<String> channels = texts(spec.path("channels"));
    if (channels.isEmpty()) {
      channels = Set.of("inApp");
    }

    UUID firstNotification = null;
    if (channels.contains("inApp")) {
      for (String target : recipients) {
        if (target.equals(TenantContext.userId())) {
          continue;
        }
        UUID id = notifications.send(event.published().appId(), target,
            fallbackKey, title, body, link, event.bizType(), event.bizId());
        if (firstNotification == null) {
          firstNotification = id;
        }
      }
    }

    if (channels.contains("webhook")) {
      String recipient = recipients.isEmpty() ? "webhook" : String.join(",", recipients);
      ObjectNode payload = payload(event, title, body, link, recipients);
      try {
        notifications.enqueue(event.published().appId(), firstNotification, "webhook",
            connectionRef(spec.get("connectionRef")), recipient,
            spec.path("path").asText(null), payload, idemBase + ":webhook");
      } catch (RuntimeException ex) {
        log.warn("通知 webhook 入队失败，event={} app={}: {}",
            event.name(), event.published().appId(), ex.getMessage());
      }
    }

    if (channels.contains("email")) {
      Map<String, String> emails = users.emails(recipients);
      for (String email : new LinkedHashSet<>(emails.values())) {
        ObjectNode payload = json.createObjectNode();
        payload.put("to", email);
        payload.put("subject", title);
        payload.put("text", body == null ? "" : body);
        if (link != null) {
          payload.put("link", link);
        }
        try {
          notifications.enqueue(event.published().appId(), firstNotification, "email",
              connectionRef(spec.get("connectionRef")), email,
              spec.path("path").asText(null), payload, idemBase + ":email:" + email);
        } catch (RuntimeException ex) {
          log.warn("通知 email 入队失败，event={} app={}: {}",
              event.name(), event.published().appId(), ex.getMessage());
        }
      }
    }
  }

  private List<JsonNode> rules(JsonNode bundle, JsonNode entity, String event) {
    String entityKey = entity == null ? null : entity.path("key").asText(null);
    List<JsonNode> out = new ArrayList<>();
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode rule : logic.path("rules")) {
        if (!"notification".equals(rule.path("kind").asText())
            || !rule.path("enabled").asBoolean(true)) {
          continue;
        }
        String ruleEntity = rule.path("entityRef").path("key").asText(null);
        if (ruleEntity != null && !ruleEntity.isBlank()
            && entityKey != null && !ruleEntity.equals(entityKey)) {
          continue;
        }
        if (!contains(rule.path("notification").path("events"), event)) {
          continue;
        }
        out.add(rule);
      }
    }
    out.sort(Comparator.comparingInt(rule -> rule.path("priority").asInt(100)));
    return out;
  }

  private List<String> targets(JsonNode specs, Map<String, Object> business) {
    List<String> out = new ArrayList<>();
    for (JsonNode spec : specs) {
      String type = spec.path("type").asText("");
      if ("expression".equals(type)) {
        try {
          JsonNode value = expressions.eval(spec.get("expr"), scope(null, business));
          out.addAll(strings(value));
        } catch (RuntimeException ex) {
          log.warn("通知接收人表达式求值失败：{}", ex.getMessage());
        }
      } else {
        out.addAll(users.resolveAll(
            null, type, spec, business));
      }
    }
    return dedupe(out);
  }

  private ExpressionEngine.Scope scope(Event event, Map<String, Object> business) {
    String actor = event == null ? TenantContext.userId() : event.assignee();
    if (actor == null || actor.isBlank()) {
      actor = TenantContext.userId();
    }
    String tenantId = TenantContext.tenantId();
    ObjectNode user = json.createObjectNode();
    if (actor != null) {
      user.put("id", actor);
      user.put("name", actor);
    }
    ObjectNode tenant = json.createObjectNode();
    if (tenantId != null) {
      tenant.put("id", tenantId);
    }
    ObjectNode app = json.createObjectNode();
    ObjectNode process = json.createObjectNode();
    if (event != null) {
      app.put("id", event.published().appId().toString());
      app.put("key", event.published().appKey());
      app.put("name", event.published().appName());
      process.put("instanceId", value(event.processInstanceId()));
      process.put("businessKey", value(event.businessKey()));
      process.put("flowKey", event.flow() == null ? "" : event.flow().path("key").asText(""));
      process.put("taskId", value(event.taskId()));
      process.put("taskName", value(event.taskName()));
      process.put("assignee", value(event.assignee()));
      process.put("bizType", value(event.bizType()));
      process.put("bizId", value(event.bizId()));
    }
    JsonNode biz = json.valueToTree(business);
    JsonNode vars = json.valueToTree(event == null ? Map.of() : event.variables());
    Map<String, JsonNode> roots = new LinkedHashMap<>();
    roots.put("user", user);
    roots.put("tenant", tenant);
    roots.put("app", app);
    roots.put("process", process);
    roots.put("biz", biz);
    roots.put("row", biz);
    roots.put("form", vars);
    roots.put("data", biz);
    return expressions.newScope(roots);
  }

  private ObjectNode payload(
      Event event, String title, String body, String link, List<String> recipients) {
    ObjectNode payload = json.createObjectNode();
    payload.put("event", event.name());
    payload.put("appId", event.published().appId().toString());
    payload.put("tenantId", TenantContext.tenantId());
    payload.put("title", title);
    payload.put("body", body == null ? "" : body);
    payload.put("link", link);
    payload.put("bizType", event.bizType());
    payload.put("bizId", event.bizId());
    payload.put("businessTitle", event.businessTitle());
    payload.put("recipients", String.join(",", recipients));
    return payload;
  }

  private String text(JsonNode expr, ExpressionEngine.Scope scope, String fallback) {
    if (expr == null || expr.isMissingNode() || expr.isNull()) {
      return fallback;
    }
    JsonNode value = expressions.eval(expr, scope);
    String text = expressions.stringify(value);
    return text.isBlank() ? fallback : text;
  }

  private static Set<String> channels(JsonNode channels) {
    return texts(channels);
  }

  private static Set<String> texts(JsonNode array) {
    Set<String> out = new LinkedHashSet<>();
    if (array != null && array.isArray()) {
      for (JsonNode item : array) {
        if (item.isTextual() && !item.asText().isBlank()) {
          out.add(item.asText());
        }
      }
    }
    return out;
  }

  private static boolean contains(JsonNode array, String value) {
    if (array == null || !array.isArray()) {
      return false;
    }
    for (JsonNode item : array) {
      if (value.equals(item.asText())) {
        return true;
      }
    }
    return false;
  }

  private static List<String> strings(JsonNode value) {
    List<String> out = new ArrayList<>();
    if (value == null || value.isNull() || value.isMissingNode()) {
      return out;
    }
    if (value.isArray()) {
      for (JsonNode item : value) {
        if (!item.isNull() && !item.asText().isBlank()) {
          out.add(item.asText());
        }
      }
    } else if (!value.asText().isBlank()) {
      out.add(value.asText());
    }
    return out;
  }

  private static List<String> dedupe(List<String> values) {
    if (values == null) {
      return List.of();
    }
    return new ArrayList<>(new LinkedHashSet<>(values));
  }

  private static String connectionRef(JsonNode ref) {
    if (ref == null || ref.isNull() || ref.isMissingNode()) {
      return null;
    }
    if (ref.isTextual()) {
      return ref.asText();
    }
    String key = ref.path("key").asText("");
    return key.isBlank() ? ref.path("id").asText(null) : key;
  }

  private static String value(Object value) {
    return value == null ? "" : String.valueOf(value);
  }
}
