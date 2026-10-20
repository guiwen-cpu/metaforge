package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.BusinessRecordService;
import dev.lcp.bff.runtime.ProcessRuntimeService;
import dev.lcp.bff.runtime.dto.RuntimeRequests.CompleteTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.StartInstanceRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.TransferTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.StartResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskDetail;
import dev.lcp.bff.tenant.TenantContext;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 发布态动作到 BFF 内部能力的适配层：只放行发布件声明的内置 API，不伪造成功。 */
@Service
public class RuntimeInternalApiService implements RuntimeActionGateway {

  private final BusinessRecordService records;
  private final ProcessRuntimeService processes;
  private final ObjectMapper json;

  public RuntimeInternalApiService(
      BusinessRecordService records,
      ProcessRuntimeService processes,
      ObjectMapper json) {
    this.records = records;
    this.processes = processes;
    this.json = json;
  }

  @Override
  public JsonNode invokeInternalApi(
      JsonNode bundle,
      String apiKey,
      String method,
      String pathTemplate,
      Map<String, String> pathValues,
      JsonNode params) {
    String verb = method == null ? "" : method.toUpperCase(Locale.ROOT);
    String path = pathTemplate == null ? "" : pathTemplate;
    JsonNode input = params == null ? json.nullNode() : params;
    Map<String, String> values = pathValues == null ? Map.of() : pathValues;

    if ("POST".equals(verb) && "/bff/entity/{entity}/save".equals(path)) {
      return save(bundle, apiKey, input, values);
    }
    if ("GET".equals(verb) && "/bff/entity/{entity}/get".equals(path)) {
      return get(bundle, apiKey, input, values);
    }
    if ("PATCH".equals(verb) && "/bff/entity/{entity}/patch".equals(path)) {
      return patch(bundle, apiKey, input, values);
    }
    if ("POST".equals(verb) && "/bff/flow/processes/{processInstanceId}/terminate".equals(path)) {
      return terminate(input, values);
    }
    throw new PlatformException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_INTERNAL_API",
        "内部 API " + apiKey + "（" + verb + " " + path + "）尚未接入运行时");
  }

  @Override
  public String startFlow(
      UUID appId,
      String flowKey,
      String businessKey,
      Map<String, Object> variables) {
    StartResult result = processes.start(appId, flowKey,
        new StartInstanceRequest(businessKey, null, variables));
    return result.processInstanceId();
  }

  @Override
  public JsonNode completeTask(
      UUID appId,
      String taskId,
      String outcome,
      String comment,
      String nextAssignee,
      Map<String, Object> variables) {
    ObjectNode out = json.createObjectNode();
    out.put("code", 0);
    ObjectNode data = out.putObject("data");
    data.put("taskId", taskId);
    data.put("outcome", outcome);
    if ("transfer".equals(outcome)) {
      if (nextAssignee == null || nextAssignee.isBlank()) {
        throw PlatformException.badRequest("transfer_target_required", "请选择转办目标");
      }
      TaskDetail detail = processes.transfer(appId, taskId,
          new TransferTaskRequest(nextAssignee, comment));
      data.put("assignee", detail.assignee());
      return out;
    }
    processes.complete(appId, taskId, new CompleteTaskRequest(outcome, comment, variables));
    return out;
  }

  private JsonNode save(
      JsonNode bundle, String apiKey, JsonNode params, Map<String, String> pathValues) {
    JsonNode entity = requireEntity(bundle, apiKey, params, pathValues);
    JsonNode data = params.path("data");
    if (!data.isObject()) {
      throw PlatformException.badRequest("business_required", "保存请求缺少 data 对象");
    }
    Map<String, Object> values = map(data);
    String id = text(params, "id");
    String actor = actor();
    String savedId = id;
    if (savedId == null) {
      savedId = records.create(entity, values, actor);
    } else {
      records.update(entity, savedId, values, actor);
    }
    Map<String, Object> record = records.get(entity, savedId);
    if (record.isEmpty()) {
      throw PlatformException.notFound("业务单据 " + savedId + " 不存在或不属于当前租户");
    }
    ObjectNode out = json.createObjectNode();
    out.put("code", 0);
    ObjectNode payload = out.putObject("data");
    payload.put("id", savedId);
    payload.put("version", integer(record.get("version"), 0));
    Object updatedAt = record.get(updatedAtColumn(entity));
    if (updatedAt == null) {
      payload.putNull("updatedAt");
    } else {
      payload.put("updatedAt", String.valueOf(updatedAt));
    }
    return out;
  }

  private JsonNode get(
      JsonNode bundle, String apiKey, JsonNode params, Map<String, String> pathValues) {
    JsonNode entity = requireEntity(bundle, apiKey, params, pathValues);
    String id = requiredId(params);
    Map<String, Object> record = records.get(entity, id);
    if (record.isEmpty()) {
      throw PlatformException.notFound("业务单据 " + id + " 不存在或不属于当前租户");
    }
    ObjectNode out = json.createObjectNode();
    out.put("code", 0);
    out.set("data", json.valueToTree(record));
    return out;
  }

  private JsonNode patch(
      JsonNode bundle, String apiKey, JsonNode params, Map<String, String> pathValues) {
    JsonNode entity = requireEntity(bundle, apiKey, params, pathValues);
    String id = requiredId(params);
    Map<String, Object> updates = new LinkedHashMap<>();
    JsonNode patch = params.path("patch");
    if (patch.isObject()) {
      copyPatch(patch, updates);
    } else {
      copyPatch(params, updates);
    }
    if (updates.isEmpty()) {
      throw PlatformException.badRequest("patch_empty", "局部更新至少需要 status 或 currentTask");
    }
    records.update(entity, id, updates, actor());
    Map<String, Object> record = records.get(entity, id);
    if (record.isEmpty()) {
      throw PlatformException.notFound("业务单据 " + id + " 不存在或不属于当前租户");
    }
    ObjectNode out = json.createObjectNode();
    out.put("code", 0);
    ObjectNode payload = out.putObject("data");
    payload.put("id", id);
    payload.put("status", string(record.get("status")));
    payload.put("version", integer(record.get("version"), 0));
    return out;
  }

  private JsonNode terminate(JsonNode params, Map<String, String> pathValues) {
    String processInstanceId = trim(pathValues.get("processInstanceId"));
    if (processInstanceId == null) {
      throw PlatformException.badRequest("process_instance_required", "缺少流程实例 ID");
    }
    String reason = text(params, "reason");
    boolean deleteHistory = params.path("deleteHistory").asBoolean(false);
    JsonNode result = processes.terminate(processInstanceId, reason, deleteHistory);
    ObjectNode out = json.createObjectNode();
    out.put("code", 0);
    out.set("data", result);
    return out;
  }

  private JsonNode requireEntity(
      JsonNode bundle, String apiKey, JsonNode params, Map<String, String> pathValues) {
    String fromParams = text(params, "entity");
    String fromPath = trim(pathValues.get("entity"));
    if (fromParams != null && fromPath != null && !fromParams.equals(fromPath)) {
      throw PlatformException.badRequest("entity_mismatch",
          "API " + apiKey + " 的实体参数与路径不一致");
    }
    String key = fromParams == null ? fromPath : fromParams;
    if (key == null) {
      throw PlatformException.badRequest("entity_required", "内部 API 缺少实体 key");
    }
    for (JsonNode schema : bundle.path("artifacts").path("dataSchemas")) {
      for (JsonNode entity : schema.path("entities")) {
        if (key.equals(entity.path("key").asText())) {
          return entity;
        }
      }
    }
    throw PlatformException.badRequest("entity_not_found", "发布件中不存在实体 " + key);
  }

  private void copyPatch(JsonNode source, Map<String, Object> updates) {
    String status = text(source, "status");
    if (status != null) {
      updates.put("status", status);
    }
    String currentTask = text(source, "currentTask");
    if (currentTask != null) {
      updates.put("current_task", currentTask);
    }
  }

  private String requiredId(JsonNode params) {
    String id = trim(text(params, "id"));
    if (id == null) {
      throw PlatformException.badRequest("id_required", "内部 API 缺少业务主键 id");
    }
    return id;
  }

  private static String updatedAtColumn(JsonNode entity) {
    String column = entity.path("storage").path("timestamps").path("updatedAt").asText(null);
    return column == null || column.isBlank() ? "updated_at" : column;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> map(JsonNode data) {
    return json.convertValue(data, Map.class);
  }

  private static String text(JsonNode node, String field) {
    if (node == null || !node.has(field)) {
      return null;
    }
    JsonNode value = node.get(field);
    if (value == null || value.isNull()) {
      return null;
    }
    return trim(value.isTextual() ? value.asText() : value.asText());
  }

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static int integer(Object value, int fallback) {
    if (value instanceof Number number) {
      return number.intValue();
    }
    try {
      return value == null ? fallback : Integer.parseInt(String.valueOf(value));
    } catch (NumberFormatException ex) {
      return fallback;
    }
  }

  private static String actor() {
    String user = TenantContext.userId();
    return user == null || user.isBlank() ? "anonymous" : user;
  }
}
