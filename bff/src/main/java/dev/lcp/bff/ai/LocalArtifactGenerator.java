package dev.lcp.bff.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.ai.AiDtos.AiGenerateRequest;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.platform.Ulid;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 本地确定性生成器。
 *
 * <p>没有外部模型时也能产出可校验的页面与流程：同样的提示词与实体得到同样的 key，
 * 便于测试、diff 与复现。它不是模板市场，只覆盖最常见的列表 / 表单 / 详情与线性审批。
 */
@Component
public class LocalArtifactGenerator {

  private static final String DS_ID = "ds_ai_entity";

  private final ObjectMapper mapper;

  public LocalArtifactGenerator(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public Generated generate(AiGenerateRequest request) {
    String kind = request.kind();
    if ("flow".equals(kind)) return flow(request);
    return page(request);
  }

  private Generated page(AiGenerateRequest request) {
    JsonNode entity = resolveEntity(request.context(), request.entityKey());
    if (entity == null) {
      throw PlatformException.badRequest("ai_entity_required", "生成页面需要选择一个数据实体");
    }
    String entityKey = entity.path("key").asText();
    String entityName = displayName(entity, entityKey);
    String pageKind = "form".equals(request.kind())
        ? "form"
        : (request.pageKind() == null || request.pageKind().isBlank() ? "list" : request.pageKind());
    if (!Set.of("form", "list", "detail").contains(pageKind)) pageKind = "list";
    String prompt = request.prompt().trim();
    String digest = digest(prompt + "|" + request.kind() + "|" + pageKind + "|" + entityKey);
    String key = "ai_" + entityPart(entityKey) + "_" + pageKind + "_" + digest.substring(0, 8);
    String title = switch (pageKind) {
      case "form" -> "填写" + entityName;
      case "detail" -> entityName + "详情";
      default -> entityName + "列表";
    };

    ObjectNode page = mapper.createObjectNode();
    page.put("id", Ulid.next());
    page.put("key", key);
    page.set("title", textNode(title));
    page.put("kind", pageKind);
    page.put("scope", "app");
    page.put("version", 1);
    page.put("description", "由 AI 本地生成，应用前请确认字段与交互");
    page.set("route", route("/" + key.replace('_', '-'), key));
    page.set("dataSources", mapper.createArrayNode());
    page.set("state", mapper.createObjectNode());
    page.set("layout", pageLayout(pageKind, title, entity, entityName));
    page.set("semantic", semantic("AI 生成" + title, pageKind, prompt));

    if ("list".equals(pageKind) || "detail".equals(pageKind)) {
      ((ArrayNode) page.get("dataSources")).add(dataSource(entity, pageKind));
      ObjectNode layout = (ObjectNode) page.get("layout");
      // 页面布局先构建，再按类型补状态；数据源在布局里以 id 引用，顺序不影响校验。
      page.set("state", "list".equals(pageKind) ? listState() : mapper.createObjectNode());
    } else {
      page.set("state", formState());
    }

    List<String> warnings = new ArrayList<>();
    if (visibleFields(entity, false).isEmpty()) {
      warnings.add("实体没有可用字段，页面只生成了空容器");
    }
    warnings.add("已生成本地确定性页面，未调用外部模型");
    return new Generated(page, List.of(), warnings);
  }

  private ObjectNode pageLayout(String kind, String title, JsonNode entity, String entityName) {
    ObjectNode root = node("x-page");
    ObjectNode props = (ObjectNode) root.get("props");
    props.put("title", title);
    props.put("subtitle", "由 AI 根据自然语言生成，可继续在设计器中调整");
    props.put("showBreadcrumb", true);

    ObjectNode card = node("x-card");
    ((ObjectNode) card.get("props")).put("title", title);
    ((ObjectNode) card.get("props")).put("bordered", true);
    ArrayNode children = (ArrayNode) card.get("children");

    if ("list".equals(kind)) {
      List<JsonNode> sourceFields = visibleFields(entity, false);
      ObjectNode search = node("x-search-form");
      ObjectNode searchProps = (ObjectNode) search.get("props");
      searchProps.set("entityRef", entityRef(entity));
      searchProps.set("model", ref("$page.state.query"));
      searchProps.put("targetDataSourceId", DS_ID);
      searchProps.put("fieldsPerRow", 4);
      searchProps.put("collapsible", true);
      searchProps.set("searchFieldList", searchFields(sourceFields));
      children.add(search);

      ObjectNode table = node("x-table");
      ObjectNode tableProps = (ObjectNode) table.get("props");
      tableProps.set("entityRef", entityRef(entity));
      tableProps.put("dataSourceId", DS_ID);
      tableProps.put("rowKey", "id");
      tableProps.put("selection", "none");
      tableProps.put("stripe", true);
      tableProps.put("autoHeight", true);
      tableProps.put("emptyText", "暂无数据");
      tableProps.set("columnList", columns(sourceFields));
      children.add(table);

      ObjectNode pagination = node("x-pagination");
      ((ObjectNode) pagination.get("props")).put("dataSourceId", DS_ID);
      children.add(pagination);
    } else if ("detail".equals(kind)) {
      ObjectNode descriptions = node("x-descriptions");
      ObjectNode descProps = (ObjectNode) descriptions.get("props");
      descProps.set("entityRef", entityRef(entity));
      descProps.put("dataSourceId", DS_ID);
      descProps.put("column", 2);
      descProps.put("border", true);
      descProps.set("fieldList", descriptionFields(visibleFields(entity, false)));
      children.add(descriptions);
    } else {
      ObjectNode form = node("x-form");
      ObjectNode formProps = (ObjectNode) form.get("props");
      formProps.set("entityRef", entityRef(entity));
      formProps.set("model", ref("$page.state.form"));
      formProps.set("fieldList", formFields(visibleFields(entity, false)));
      formProps.put("labelWidth", "110px");
      formProps.put("columnsPerRow", 2);
      formProps.put("showActions", true);
      formProps.put("submitText", "保存");
      children.add(form);
    }

    ((ArrayNode) root.get("children")).add(card);
    return root;
  }

  private Generated flow(AiGenerateRequest request) {
    JsonNode entity = resolveEntity(request.context(), request.entityKey());
    String entityKey = entity == null ? "" : entity.path("key").asText("");
    String entityName = entity == null ? "" : displayName(entity, entityKey);
    String prompt = request.prompt().trim();
    String digest = digest(prompt + "|flow|" + entityKey);
    String key = "ai_" + (entityKey.isBlank() ? "flow" : entityPart(entityKey)) + "_flow_" + digest.substring(0, 8);
    String name = entityName.isBlank() ? "AI 审批流程" : entityName + "审批";
    List<TaskDef> tasks = tasksFor(prompt);
    String xml = bpmn(key, name, tasks);

    ObjectNode asset = mapper.createObjectNode();
    asset.put("assetId", Ulid.next());
    asset.put("key", key + "_bpmn");
    asset.put("kind", "bpmn");
    asset.put("version", 1);
    asset.put("fileName", key + ".bpmn20.xml");
    asset.put("mime", "application/xml");
    asset.put("size", xml.getBytes(StandardCharsets.UTF_8).length);
    ObjectNode checksum = mapper.createObjectNode();
    checksum.put("algo", "sha256");
    checksum.put("value", sha256(xml));
    asset.set("checksum", checksum);
    asset.put("storage", "inline");
    ObjectNode inline = mapper.createObjectNode();
    inline.put("mediaType", "application/xml");
    inline.put("encoding", "utf8");
    inline.put("content", xml);
    asset.set("inline", inline);

    ObjectNode flow = mapper.createObjectNode();
    flow.put("id", Ulid.next());
    flow.put("key", key);
    flow.put("name", name);
    flow.put("description", "由 AI 本地生成，发布前请确认办理人与表单字段");
    flow.put("engine", "flowable");
    flow.put("processKey", key);
    flow.set("bpmnRef", asset.deepCopy());
    if (!entityKey.isBlank()) flow.set("entityRef", entityRef(entity));
    flow.set("variables", variables(entity));
    flow.set("taskForms", taskForms(tasks, entity));
    ObjectNode deployment = mapper.createObjectNode();
    deployment.put("tenantStrategy", "flowableTenantId");
    deployment.put("historyLevel", "audit");
    deployment.put("autoDeploy", true);
    flow.set("deployment", deployment);
    flow.put("allowRecall", true);
    flow.put("allowReturn", true);
    flow.put("allowTransfer", true);
    flow.put("allowAddSign", false);
    flow.put("category", "AI 生成");
    flow.set("semantic", semantic("AI 生成" + name, "flow", prompt));

    List<String> warnings = new ArrayList<>();
    warnings.add(switch (tasks.size()) {
      case 1 -> "已生成单级审批流程";
      case 3 -> "已生成三级审批流程：部门负责人 → 院级 → 校级";
      default -> "已生成两级审批流程：部门负责人 → 院级";
    });
    warnings.add("线性审批流不含条件分支；如需按金额 / 天数分流，请补充网关与表达式");
    warnings.add("已生成本地确定性流程，未调用外部模型");
    return new Generated(flow, List.of(asset), warnings);
  }

  private List<TaskDef> tasksFor(String prompt) {
    String text = prompt == null ? "" : prompt;
    int count = text.matches("(?s).*(三级|3\\s*级|院级|校级).*") ? 3
        : text.matches("(?s).*(单级|一级|1\\s*级).*") ? 1 : 2;
    List<TaskDef> tasks = new ArrayList<>();
    tasks.add(new TaskDef("dept_approve", "部门负责人审批", assignee("deptLeader", 1)));
    if (count >= 2) tasks.add(new TaskDef("college_approve", "院级审批", assignee("deptLeader", 2)));
    if (count >= 3) tasks.add(new TaskDef("final_approve", "校级审批", roleAssignee("school_admin")));
    return tasks;
  }

  private String bpmn(String processKey, String name, List<TaskDef> tasks) {
    StringBuilder xml = new StringBuilder();
    xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.append("<definitions xmlns=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"\n");
    xml.append("             xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n");
    xml.append("             xmlns:flowable=\"http://flowable.org/bpmn\"\n");
    xml.append("             targetNamespace=\"http://lcp.dev/bpmn/ai\"\n");
    xml.append("             typeLanguage=\"http://www.w3.org/2001/XMLSchema\">\n");
    xml.append("  <process id=\"").append(escape(processKey)).append("\" name=\"")
        .append(escape(name)).append("\" isExecutable=\"true\">\n");
    xml.append("    <documentation>AI 生成的线性审批流</documentation>\n");
    xml.append("    <extensionElements>\n");
    xml.append("      <flowable:executionListener event=\"start\" delegateExpression=\"${lcpProcessStartListener}\"/>\n");
    xml.append("      <flowable:executionListener event=\"end\" delegateExpression=\"${lcpProcessEndListener}\"/>\n");
    xml.append("    </extensionElements>\n");
    xml.append("    <startEvent id=\"startFlow\" name=\"发起\"/>\n");
    String previous = "startFlow";
    for (TaskDef task : tasks) {
      String flowId = "flow_" + previous + "_to_" + task.key();
      xml.append("    <sequenceFlow id=\"").append(escape(flowId)).append("\" sourceRef=\"")
          .append(escape(previous)).append("\" targetRef=\"").append(escape(task.key())).append("\"/>\n");
      xml.append("    <userTask id=\"").append(escape(task.key())).append("\" name=\"")
          .append(escape(task.name())).append("\">\n");
      xml.append("      <extensionElements>\n");
      xml.append("        <flowable:taskListener event=\"create\" delegateExpression=\"${lcpTaskListener}\"/>\n");
      xml.append("        <flowable:taskListener event=\"complete\" delegateExpression=\"${lcpTaskListener}\"/>\n");
      xml.append("      </extensionElements>\n");
      xml.append("    </userTask>\n");
      previous = task.key();
    }
    xml.append("    <sequenceFlow id=\"flow_").append(escape(previous)).append("_to_end\" sourceRef=\"")
        .append(escape(previous)).append("\" targetRef=\"endFlow\"/>\n");
    xml.append("    <endEvent id=\"endFlow\" name=\"结束\"/>\n");
    xml.append("  </process>\n");
    xml.append("</definitions>\n");
    return xml.toString();
  }

  private ArrayNode variables(JsonNode entity) {
    ArrayNode variables = mapper.createArrayNode();
    Set<String> names = new LinkedHashSet<>();
    if (entity != null) {
      for (JsonNode field : fieldsOf(entity)) {
        String fieldKey = field.path("key").asText("");
        if (fieldKey.isBlank()) continue;
        String name = camel(fieldKey);
        if (!names.add(name)) continue;
        ObjectNode variable = mapper.createObjectNode();
        variable.put("name", name);
        variable.put("direction", "in");
        variable.set("source", ref("$form." + fieldKey));
        variable.put("type", variableType(field.path("type").asText("string")));
        if (field.path("required").asBoolean(false)) variable.put("required", true);
        String label = fieldLabel(field);
        if (!label.isBlank()) variable.put("description", label);
        variables.add(variable);
      }
    }
    if (names.add("comment")) {
      ObjectNode comment = mapper.createObjectNode();
      comment.put("name", "comment");
      comment.put("direction", "out");
      comment.set("source", ref("$process.variables.comment"));
      comment.put("type", "string");
      comment.put("description", "审批办理意见");
      variables.add(comment);
    }
    return variables;
  }

  private ArrayNode taskForms(List<TaskDef> tasks, JsonNode entity) {
    ArrayNode forms = mapper.createArrayNode();
    Set<String> allFields = new LinkedHashSet<>();
    Set<String> required = new LinkedHashSet<>();
    if (entity != null) {
      for (JsonNode field : fieldsOf(entity)) {
        String key = field.path("key").asText("");
        if (key.isBlank() || "id".equals(key)) continue;
        allFields.add(key);
        if (field.path("required").asBoolean(false)) required.add(key);
        if (allFields.size() >= 30) break;
      }
    }
    for (TaskDef task : tasks) {
      ObjectNode form = mapper.createObjectNode();
      form.put("taskKey", task.key());
      form.set("name", textNode(task.name()));
      form.set("assignee", task.assignee());
      form.put("commentField", "comment");
      form.set("editableFields", strings(allFields));
      form.set("requiredFields", strings(required));
      ArrayNode buttons = mapper.createArrayNode();
      buttons.add(button("approve", "同意", "approve", "primary"));
      buttons.add(button("reject", "驳回", "reject", "danger"));
      buttons.add(button("return", "退回", "return", "default"));
      form.set("buttons", buttons);
      forms.add(form);
    }
    return forms;
  }

  private ObjectNode button(String key, String label, String outcome, String style) {
    ObjectNode button = mapper.createObjectNode();
    button.put("key", key);
    button.set("label", textNode(label));
    button.put("outcome", outcome);
    button.put("style", style);
    return button;
  }

  private ObjectNode node(String component) {
    ObjectNode node = mapper.createObjectNode();
    node.put("id", Ulid.next());
    node.put("component", component);
    node.set("props", mapper.createObjectNode());
    node.set("children", mapper.createArrayNode());
    return node;
  }

  private ObjectNode route(String path, String key) {
    ObjectNode route = mapper.createObjectNode();
    route.put("path", path);
    route.put("name", key);
    route.put("layout", "side");
    route.put("auth", true);
    return route;
  }

  private ObjectNode dataSource(JsonNode entity, String pageKind) {
    ObjectNode source = mapper.createObjectNode();
    source.put("id", DS_ID);
    source.put("type", "entity");
    source.put("name", displayName(entity, entity.path("key").asText()) + "数据");
    source.set("entityRef", entityRef(entity));
    if ("detail".equals(pageKind)) {
      source.put("mode", "one");
      source.put("pkParam", "$route.params.id");
    } else {
      source.put("mode", "page");
    }
    return source;
  }

  private ObjectNode entityRef(JsonNode entity) {
    ObjectNode ref = mapper.createObjectNode();
    ref.put("kind", "entity");
    ref.put("key", entity.path("key").asText());
    ref.put("version", entity.path("version").asInt(1));
    return ref;
  }

  private ObjectNode ref(String path) {
    ObjectNode ref = mapper.createObjectNode();
    ref.put("$ref", path);
    return ref;
  }

  private ObjectNode semantic(String intent, String generate, String prompt) {
    ObjectNode semantic = mapper.createObjectNode();
    semantic.put("intent", intent);
    ObjectNode hint = mapper.createObjectNode();
    hint.put("generate", generate);
    hint.put("confidence", 0.6);
    hint.putArray("constraints")
        .add("自然语言提示：" + (prompt.length() > 200 ? prompt.substring(0, 200) : prompt));
    semantic.set("aiHint", hint);
    return semantic;
  }

  private ObjectNode textNode(String text) {
    ObjectNode node = mapper.createObjectNode();
    node.put("default", text);
    return node;
  }

  private ObjectNode formState() {
    ObjectNode state = mapper.createObjectNode();
    ObjectNode form = mapper.createObjectNode();
    form.put("type", "object");
    form.set("initial", mapper.createObjectNode());
    state.set("form", form);
    return state;
  }

  private ObjectNode listState() {
    ObjectNode state = mapper.createObjectNode();
    ObjectNode query = mapper.createObjectNode();
    query.put("type", "object");
    ObjectNode initial = mapper.createObjectNode();
    initial.put("page", 1);
    initial.put("size", 10);
    query.set("initial", initial);
    state.set("query", query);
    return state;
  }

  private ArrayNode formFields(List<JsonNode> fields) {
    ArrayNode list = mapper.createArrayNode();
    for (JsonNode field : fields) {
      String type = field.path("type").asText("string");
      ObjectNode item = mapper.createObjectNode();
      item.put("field", field.path("key").asText());
      item.put("label", fieldLabel(field));
      item.put("span", wide(type) ? 24 : 12);
      item.put("required", field.path("required").asBoolean(false));
      item.put("widget", widget(type));
      JsonNode enumRef = field.path("enumRef");
      if (enumRef.isObject()) item.set("enumRef", enumRef.deepCopy());
      String placeholder = field.path("uiHints").path("placeholder").asText("");
      if (!placeholder.isBlank()) item.put("placeholder", placeholder);
      if (Set.of("file", "image", "video").contains(type)) {
        long maxSize = field.path("uiHints").path("upload").path("maxSizeMb").asLong(20) * 1024 * 1024;
        item.put("maxSize", maxSize);
        item.put("maxCount", field.path("uiHints").path("upload").path("maxCount")
            .asInt("file".equals(type) ? 5 : 1));
        item.put("multiple", field.path("uiHints").path("upload").path("multiple").asBoolean("file".equals(type)));
      }
      list.add(item);
    }
    return list;
  }

  private ArrayNode searchFields(List<JsonNode> fields) {
    ArrayNode list = mapper.createArrayNode();
    List<JsonNode> chosen = new ArrayList<>();
    for (JsonNode field : fields) {
      if (field.path("searchable").asBoolean(false)) chosen.add(field);
    }
    if (chosen.isEmpty()) {
      for (JsonNode field : fields) {
        String type = field.path("type").asText("");
        if (Set.of("string", "enum", "date", "datetime").contains(type)) chosen.add(field);
        if (chosen.size() >= 4) break;
      }
    }
    for (JsonNode field : chosen.subList(0, Math.min(4, chosen.size()))) {
      String type = field.path("type").asText("string");
      ObjectNode item = mapper.createObjectNode();
      item.put("field", field.path("key").asText());
      item.put("label", fieldLabel(field));
      item.put("op", Set.of("date", "datetime").contains(type) ? "between"
          : Set.of("string", "text").contains(type) ? "like" : "in");
      item.put("span", Set.of("date", "datetime").contains(type) ? 6 : 5);
      item.put("widget", widget(type));
      list.add(item);
    }
    return list;
  }

  private ArrayNode columns(List<JsonNode> fields) {
    ArrayNode list = mapper.createArrayNode();
    int count = 0;
    for (JsonNode field : fields) {
      if (field.path("key").asText("").isBlank()) continue;
      String type = field.path("type").asText("string");
      ObjectNode item = mapper.createObjectNode();
      item.put("field", field.path("key").asText());
      item.put("label", fieldLabel(field));
      item.put("width", String.valueOf(columnWidth(type)));
      item.put("widget", widget(type));
      JsonNode enumRef = field.path("enumRef");
      if (enumRef.isObject()) item.set("enumRef", enumRef.deepCopy());
      if ("datetime".equals(type)) item.put("format", "YYYY-MM-DD HH:mm");
      if ("date".equals(type)) item.put("format", "YYYY-MM-DD");
      if (Set.of("integer", "decimal").contains(type)) item.put("align", "right");
      if (field.path("searchable").asBoolean(false)) item.put("sortable", true);
      list.add(item);
      count += 1;
      if (count >= 8) break;
    }
    return list;
  }

  private ArrayNode descriptionFields(List<JsonNode> fields) {
    ArrayNode list = mapper.createArrayNode();
    int count = 0;
    for (JsonNode field : fields) {
      if (field.path("key").asText("").isBlank()) continue;
      ObjectNode item = mapper.createObjectNode();
      item.put("field", field.path("key").asText());
      item.put("label", fieldLabel(field));
      list.add(item);
      count += 1;
      if (count >= 12) break;
    }
    return list;
  }

  private List<JsonNode> visibleFields(JsonNode entity, boolean listOnly) {
    List<JsonNode> result = new ArrayList<>();
    for (JsonNode field : fieldsOf(entity)) {
      String key = field.path("key").asText("");
      if (key.isBlank() || "id".equals(key)) continue;
      if (listOnly && field.path("uiHints").path("hideInList").asBoolean(false)) continue;
      result.add(field);
    }
    return result;
  }

  private List<JsonNode> fieldsOf(JsonNode entity) {
    List<JsonNode> fields = new ArrayList<>();
    if (entity == null) return fields;
    JsonNode list = entity.path("fields");
    if (!list.isArray()) return fields;
    for (JsonNode field : list) fields.add(field);
    return fields;
  }

  private JsonNode resolveEntity(JsonNode context, String entityKey) {
    if (context == null) return null;
    String key = entityKey == null ? "" : entityKey.trim();
    JsonNode direct = context.path("entity");
    if (direct.isObject()) {
      String directKey = direct.path("key").asText("");
      if (key.isBlank() || key.equals(directKey)) return direct;
    }
    for (JsonNode schema : context.path("dataSchemas")) {
      for (JsonNode entity : schema.path("entities")) {
        String candidate = entity.path("key").asText("");
        if (key.isBlank() || key.equals(candidate)) return entity;
      }
    }
    return null;
  }

  private static String displayName(JsonNode entity, String fallback) {
    JsonNode name = entity.path("name");
    String text = name.isTextual() ? name.asText() : name.path("default").asText("");
    return text.isBlank() ? fallback : text;
  }

  private static String fieldLabel(JsonNode field) {
    JsonNode label = field.path("label");
    String text = label.isTextual() ? label.asText() : label.path("default").asText("");
    if (!text.isBlank()) return text;
    String key = field.path("key").asText("");
    return key.isBlank() ? "字段" : key;
  }

  private static String widget(String type) {
    return switch (type == null ? "string" : type) {
      case "text" -> "x-textarea";
      case "richText" -> "x-rich-text";
      case "integer", "decimal" -> "x-number";
      case "boolean" -> "x-switch";
      case "date", "datetime", "time" -> "x-date-picker";
      case "enum", "ref", "array" -> "x-select";
      case "file", "image", "video" -> "x-upload";
      case "json" -> "x-json-editor";
      case "signature" -> "x-signature";
      case "location" -> "x-location";
      default -> "x-input";
    };
  }

  private static String variableType(String type) {
    return switch (type == null ? "string" : type) {
      case "integer" -> "integer";
      case "decimal" -> "decimal";
      case "boolean" -> "boolean";
      case "date" -> "date";
      case "datetime" -> "datetime";
      case "json", "array" -> "json";
      default -> "string";
    };
  }

  private static boolean wide(String type) {
    return Set.of("text", "richText", "file", "image", "video", "json").contains(type);
  }

  private static int columnWidth(String type) {
    return switch (type == null ? "string" : type) {
      case "datetime" -> 160;
      case "date" -> 120;
      case "boolean", "enum" -> 100;
      case "text" -> 220;
      case "decimal", "integer" -> 100;
      default -> 140;
    };
  }

  private static ObjectNode assignee(String type, int level) {
    ObjectNode node = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    node.put("type", type);
    node.put("level", level);
    return node;
  }

  private static ObjectNode roleAssignee(String role) {
    ObjectNode node = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    node.put("type", "role");
    node.putArray("values").add(role);
    return node;
  }

  private static ArrayNode strings(Set<String> values) {
    ArrayNode array = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    for (String value : values) array.add(value);
    return array;
  }

  private static String entityPart(String key) {
    String normalized = key == null ? "" : key.toLowerCase()
        .replaceAll("[^a-z0-9_]+", "_")
        .replaceAll("^_+|_+$", "");
    if (normalized.isBlank()) normalized = "entity";
    return normalized.length() > 20 ? normalized.substring(0, 20) : normalized;
  }

  private static String camel(String key) {
    StringBuilder out = new StringBuilder();
    boolean upper = false;
    for (char ch : key.toCharArray()) {
      if (ch == '_' || ch == '-' || ch == ' ') {
        upper = out.length() > 0;
        continue;
      }
      if (!Character.isLetterOrDigit(ch)) continue;
      out.append(upper ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
      upper = false;
    }
    if (out.length() == 0) return "field";
    if (!Character.isLowerCase(out.charAt(0))) out.setCharAt(0, Character.toLowerCase(out.charAt(0)));
    if (out.length() == 1) out.append('x');
    return out.toString();
  }

  private static String digest(String value) {
    return sha256(value);
  }

  private static String sha256(String value) {
    try {
      byte[] hash = MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder out = new StringBuilder(hash.length * 2);
      for (byte item : hash) out.append(String.format("%02x", item));
      return out.toString();
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  private static String escape(String value) {
    return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace("\"", "&quot;");
  }

  public record Generated(JsonNode artifact, List<JsonNode> assets, List<String> warnings) {
  }

  private record TaskDef(String key, String name, ObjectNode assignee) {
  }
}
