package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.auth.PermissionService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.RuntimeRequests.CompleteTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.ExecuteActionRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionExecutionResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionRunDetail;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionRunFeed;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionRunSummary;
import dev.lcp.bff.runtime.engine.ActionExecutor;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 动作执行编排：执行引擎只负责步骤与 writeback 表达式求值，本服务负责把结果落到
 * 流程变量 / 业务字段、按 success / failure 推进任务，并持久化运行日志。
 */
@Service
public class ActionRunService {

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  private final ActionExecutor actions;
  private final PublishedBundleService bundles;
  private final BusinessRecordService records;
  private final ProcessRuntimeService processes;
  private final RuntimeService runtimeService;
  private final TaskService taskService;
  private final HistoryService historyService;
  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper json;
  private final PermissionService permissions;

  public ActionRunService(
      ActionExecutor actions,
      PublishedBundleService bundles,
      BusinessRecordService records,
      ProcessRuntimeService processes,
      RuntimeService runtimeService,
      TaskService taskService,
      HistoryService historyService,
      NamedParameterJdbcTemplate jdbc,
      ObjectMapper json,
      PermissionService permissions) {
    this.actions = actions;
    this.bundles = bundles;
    this.records = records;
    this.processes = processes;
    this.runtimeService = runtimeService;
    this.taskService = taskService;
    this.historyService = historyService;
    this.jdbc = jdbc;
    this.json = json;
    this.permissions = permissions;
  }

  public ActionExecutionResult execute(
      UUID appId, String actionKey, ExecuteActionRequest request) {
    permissions.requireAction(appId, actionKey, "execute");
    return executeInternal(appId, actionKey, request, null).result();
  }

  public ActionRunFeed list(
      UUID appId,
      String processInstanceId,
      String actionKey,
      String status,
      int limit) {
    int size = Math.max(1, Math.min(limit, 100));
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("tenant", tenant())
        .addValue("app", appId)
        .addValue("limit", size);
    StringBuilder where = new StringBuilder(
        " where tenant_id = :tenant and app_id = :app");
    if (trim(processInstanceId) != null) {
      where.append(" and process_instance_id = :pi");
      params.addValue("pi", processInstanceId.trim());
    }
    if (trim(actionKey) != null) {
      where.append(" and action_key = :action");
      params.addValue("action", actionKey.trim());
    }
    if (trim(status) != null) {
      where.append(" and status = :status");
      params.addValue("status", status.trim());
    }
    List<ActionRunSummary> items = jdbc.query("""
        select id, action_key, status, version_no, user_id, task_id,
               process_instance_id, business_id, duration_ms, replayed_from, created_at
        from lcp_action_run
        """ + where + " order by created_at desc limit :limit",
        params, ActionRunService::summary);
    Long total = jdbc.queryForObject(
        "select count(*) from lcp_action_run" + where, params, Long.class);
    return new ActionRunFeed(items, total == null ? 0 : total);
  }

  public ActionRunDetail detail(UUID appId, UUID id) {
    List<ActionRunDetail> rows = jdbc.query("""
        select * from lcp_action_run
        where tenant_id = :tenant and app_id = :app and id = :id
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("id", id), (rs, row) -> detailRow(rs, row));
    if (rows.isEmpty()) {
      throw PlatformException.notFound("动作运行日志 " + id + " 不存在");
    }
    return rows.get(0);
  }

  public ActionRunDetail replay(UUID appId, UUID id) {
    ActionRunDetail original = detail(appId, id);
    permissions.requireAction(appId, original.actionKey(), "execute");
    ExecuteActionRequest request = new ExecuteActionRequest(
        objectMap(original.params()), objectMap(original.context()), objectMap(original.event()));
    Execution execution = executeInternal(appId, original.actionKey(), request, id);
    return detail(appId, execution.runId());
  }

  private Execution executeInternal(
      UUID appId, String actionKey, ExecuteActionRequest request, UUID replayedFrom) {
    ExecuteActionRequest safe = request == null
        ? new ExecuteActionRequest(null, null, null) : request;
    PublishedBundle bundle = bundles.load(appId);
    ActionExecutionResult raw = actions.execute(bundle, actionKey, safe);
    Resolved resolved = resolve(safe);
    JsonNode writeback = applyWriteback(appId, bundle, raw, resolved);
    UUID runId = UUID.randomUUID();
    save(appId, bundle, raw, safe, resolved, writeback, runId, replayedFrom);
    ActionExecutionResult result = new ActionExecutionResult(
        raw.appKey(), raw.versionNo(), raw.actionKey(), raw.status(), raw.durationMs(),
        raw.result(), raw.vars(), raw.events(), raw.trace(), raw.error(), writeback,
        runId.toString(), raw.state());
    return new Execution(runId, result);
  }

  private JsonNode applyWriteback(
      UUID appId, PublishedBundle bundle, ActionExecutionResult result, Resolved ref) {
    JsonNode payload = result.writeback();
    ObjectNode out = payload != null && payload.isObject()
        ? ((ObjectNode) payload).deepCopy() : json.createObjectNode();
    ObjectNode applied = json.createObjectNode();
    out.set("applied", applied);
    if (payload == null) {
      return out;
    }

    JsonNode variables = payload.get("variables");
    if (variables != null && variables.isObject() && !variables.isEmpty()) {
      if (ref.processInstanceId() == null) {
        applied.put("variables", "skipped:process_instance_missing");
      } else {
        runtimeService.setVariables(ref.processInstanceId(), objectMap(variables));
        applied.put("variables", variables.size());
        applied.put("processInstanceId", ref.processInstanceId());
      }
    }

    JsonNode business = payload.get("business");
    if (business != null && business.isObject() && !business.isEmpty()) {
      JsonNode entity = resolveEntity(bundle, ref);
      if (entity == null) {
        applied.put("business", "skipped:entity_missing");
      } else if (ref.businessId() == null) {
        applied.put("business", "skipped:business_id_missing");
      } else {
        records.update(entity, ref.businessId(), objectMap(business), user());
        applied.put("business", business.size());
        applied.put("businessId", ref.businessId());
      }
    }

    JsonNode advance = payload.get("advance");
    if (advance != null && advance.isObject()
        && trim(advance.path("outcome").asText("")) != null) {
      applied.set("advance", advance(appId, advance, ref));
    }
    return out;
  }

  private ObjectNode advance(UUID appId, JsonNode advance, Resolved ref) {
    String outcome = advance.path("outcome").asText();
    JsonNode commentNode = advance.get("comment");
    String comment = commentNode == null || commentNode.isNull() ? null
        : commentNode.isTextual() ? commentNode.asText() : commentNode.toString();
    ObjectNode result = json.createObjectNode();
    result.put("outcome", outcome);
    if (ref.taskId() == null) {
      result.put("status", "skipped");
      result.put("message", "context.taskId 缺失，未推进任务");
      return result;
    }
    try {
      processes.complete(appId, ref.taskId(),
          new CompleteTaskRequest(outcome, comment, null));
      result.put("status", "completed");
    } catch (RuntimeException ex) {
      result.put("status", "failed");
      result.put("message", ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
    }
    return result;
  }

  private JsonNode resolveEntity(PublishedBundle bundle, Resolved ref) {
    if (ref.entityKey() != null) {
      JsonNode entity = bundles.entity(bundle.content(), ref.entityKey());
      if (entity != null) {
        return entity;
      }
    }
    if (ref.processInstanceId() == null) {
      return null;
    }
    String definitionId = definitionId(ref.processInstanceId());
    JsonNode flow = processes.flowForDefinition(bundle.content(), definitionId);
    return flow == null ? null : records.entity(bundle.content(), flow);
  }

  private String definitionId(String processInstanceId) {
    ProcessInstance active = runtimeService.createProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(tenant())
        .singleResult();
    if (active != null) {
      return active.getProcessDefinitionId();
    }
    HistoricProcessInstance historic = historyService.createHistoricProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(tenant())
        .singleResult();
    return historic == null ? null : historic.getProcessDefinitionId();
  }

  private Resolved resolve(ExecuteActionRequest request) {
    Map<String, Object> context = request.context() == null ? Map.of() : request.context();
    String taskId = first(
        text(context.get("taskId")), text(context.get("task_id")),
        nested(context.get("task"), "taskId"), nested(context.get("task"), "task_id"),
        nested(context.get("task"), "id"));
    String processInstanceId = first(
        text(context.get("processInstanceId")), text(context.get("process_instance_id")),
        nested(context.get("process"), "processInstanceId"),
        nested(context.get("process"), "process_instance_id"),
        nested(context.get("process"), "instanceId"));
    String businessId = first(
        text(context.get("businessId")), text(context.get("business_id")),
        nested(context.get("business"), "id"));
    String entityKey = first(
        text(context.get("entityKey")), text(context.get("entity_key")),
        nested(context.get("entity"), "key"));

    if (taskId != null) {
      Task task = taskService.createTaskQuery().taskId(taskId).singleResult();
      if (task != null && owns(task.getProcessInstanceId())) {
        processInstanceId = task.getProcessInstanceId();
      } else if (task == null) {
        HistoricTaskInstance historic = historyService.createHistoricTaskInstanceQuery()
            .taskId(taskId).singleResult();
        if (historic != null && owns(historic.getProcessInstanceId())) {
          processInstanceId = historic.getProcessInstanceId();
        } else {
          taskId = null;
        }
      } else {
        taskId = null;
      }
    }
    if (processInstanceId != null && !owns(processInstanceId)) {
      processInstanceId = null;
    }
    if (businessId == null && processInstanceId != null) {
      businessId = processes.businessKeyOf(processInstanceId);
    }
    return new Resolved(taskId, processInstanceId, businessId, entityKey);
  }

  private boolean owns(String processInstanceId) {
    if (trim(processInstanceId) == null) {
      return false;
    }
    long active = runtimeService.createProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(tenant())
        .count();
    if (active > 0) {
      return true;
    }
    return historyService.createHistoricProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(tenant())
        .count() > 0;
  }

  private void save(
      UUID appId,
      PublishedBundle bundle,
      ActionExecutionResult result,
      ExecuteActionRequest request,
      Resolved ref,
      JsonNode writeback,
      UUID runId,
      UUID replayedFrom) {
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("id", runId)
        .addValue("tenant", tenant())
        .addValue("app", appId)
        .addValue("version", bundle.versionNo())
        .addValue("action", result.actionKey())
        .addValue("status", result.status())
        .addValue("user", user())
        .addValue("task", ref.taskId())
        .addValue("pi", ref.processInstanceId())
        .addValue("business", ref.businessId())
        .addValue("params", write(request == null ? null : request.params()))
        .addValue("context", write(request == null ? null : request.context()))
        .addValue("event", write(request == null ? null : request.event()))
        .addValue("result", write(result.result()))
        .addValue("vars", write(result.vars()))
        .addValue("trace", write(json.valueToTree(result.trace())))
        .addValue("error", write(json.valueToTree(result.error())))
        .addValue("writeback", write(writeback))
        .addValue("duration", result.durationMs())
        .addValue("replayedFrom", replayedFrom);
    jdbc.update("""
        insert into lcp_action_run
          (id, tenant_id, app_id, version_no, action_key, status, user_id, task_id,
           process_instance_id, business_id, params, context, event, result, vars,
           trace, error, writeback, duration_ms, replayed_from)
        values
          (:id, :tenant, :app, :version, :action, :status, :user, :task,
           :pi, :business, cast(:params as jsonb), cast(:context as jsonb),
           cast(:event as jsonb), cast(:result as jsonb), cast(:vars as jsonb),
           cast(:trace as jsonb), cast(:error as jsonb), cast(:writeback as jsonb),
           :duration, :replayedFrom)
        """, params);
  }

  private String write(Object value) {
    if (value == null) {
      return null;
    }
    JsonNode node = value instanceof JsonNode jsonNode ? jsonNode : json.valueToTree(value);
    if (node == null || node.isNull() || node.isMissingNode()) {
      return null;
    }
    try {
      return json.writeValueAsString(node);
    } catch (Exception ex) {
      throw new IllegalStateException("动作日志序列化失败", ex);
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> objectMap(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    return json.convertValue(node, Map.class);
  }

  private static ActionRunSummary summary(ResultSet rs, int row) throws SQLException {
    return new ActionRunSummary(
        rs.getString("id"), rs.getString("action_key"), rs.getString("status"),
        rs.getInt("version_no"), rs.getString("user_id"), rs.getString("task_id"),
        rs.getString("process_instance_id"), rs.getString("business_id"),
        rs.getLong("duration_ms"), rs.getString("replayed_from"), at(rs.getTimestamp("created_at")));
  }

  private ActionRunDetail detailRow(ResultSet rs, int row) throws SQLException {
    return new ActionRunDetail(
        rs.getString("id"), rs.getString("action_key"), rs.getString("status"),
        rs.getInt("version_no"), rs.getString("user_id"), rs.getString("task_id"),
        rs.getString("process_instance_id"), rs.getString("business_id"),
        rs.getLong("duration_ms"), rs.getString("replayed_from"), at(rs.getTimestamp("created_at")),
        node(rs, "params"), node(rs, "context"), node(rs, "event"), node(rs, "result"),
        node(rs, "vars"), node(rs, "trace"), node(rs, "error"), node(rs, "writeback"));
  }

  private JsonNode node(ResultSet rs, String column) throws SQLException {
    String raw = rs.getString(column);
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return json.readTree(raw);
    } catch (Exception ex) {
      return json.getNodeFactory().textNode(raw);
    }
  }

  private static OffsetDateTime at(Timestamp value) {
    return value == null ? null : value.toInstant().atZone(ZONE).toOffsetDateTime();
  }

  private static String first(String... values) {
    for (String value : values) {
      if (trim(value) != null) {
        return value.trim();
      }
    }
    return null;
  }

  private static String nested(Object value, String key) {
    return value instanceof Map<?, ?> map ? text(map.get(key)) : null;
  }

  private static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static String trim(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static String tenant() {
    String value = TenantContext.tenantId();
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return value;
  }

  private static String user() {
    return TenantContext.userId();
  }

  private record Resolved(
      String taskId, String processInstanceId, String businessId, String entityKey) {
  }

  private record Execution(UUID runId, ActionExecutionResult result) {
  }
}
