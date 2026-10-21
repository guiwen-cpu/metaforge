package dev.lcp.bff.ai;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.platform.PlatformException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * AI 产物守卫：组件契约与 BPMN 交叉校验。
 *
 * <p>外部模型不可信，页面与流程都必须在进入草稿前通过这里；本地生成器同样走同一道门，
 * 避免两条生成路径行为分叉。
 */
@Component
public class AiArtifactGuard {

  private static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9_]{0,62}$");
  private static final Pattern PROCESS_KEY = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{2,63}$");
  private static final Pattern VARIABLE = Pattern.compile("^[a-z][a-zA-Z0-9]{1,62}$");

  private final AiComponentRegistry registry;

  public AiArtifactGuard(AiComponentRegistry registry) {
    this.registry = registry;
  }

  public List<String> validate(
      String kind, JsonNode artifact, List<JsonNode> assets, JsonNode context, String entityKey) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    if (artifact == null || !artifact.isObject()) {
      throw PlatformException.badRequest("ai_artifact_invalid", "模型未返回合法的 JSON 对象");
    }
    if ("flow".equals(kind)) {
      validateFlow(artifact, assets, context, entityKey, errors, warnings);
    } else {
      validatePage(artifact, context, entityKey, errors, warnings);
    }
    if (!errors.isEmpty()) {
      throw PlatformException.badRequest("ai_artifact_invalid", String.join("；", errors));
    }
    return warnings;
  }

  private void validatePage(
      JsonNode page, JsonNode context, String entityKey, List<String> errors, List<String> warnings) {
    String id = page.path("id").asText("");
    String key = page.path("key").asText("");
    if (id.length() != 26) errors.add("页面 id 必须是 26 位 ULID");
    if (!KEY.matcher(key).matches()) errors.add("页面 key 必须是小写 snake_case");
    if (text(page.get("title")).isBlank()) errors.add("页面标题不能为空");
    if (!page.path("route").path("path").asText("").startsWith("/")) {
      errors.add("页面路由必须以 / 开头");
    }
    JsonNode layout = page.path("layout");
    if (layout.path("component").asText("").isBlank()) {
      errors.add("页面缺少 layout");
      return;
    }
    if (!"x-page".equals(layout.path("component").asText())) {
      errors.add("页面根节点必须是 x-page");
    }
    Set<String> fields = entityFields(context, entityKey);
    registry.validateNode(layout, fields, errors, "页面");
    for (JsonNode source : page.path("dataSources")) {
      if (!"entity".equals(source.path("type").asText())) continue;
      String sourceEntity = source.path("entityRef").path("key").asText("");
      if (sourceEntity.isBlank()) errors.add("实体数据源 " + source.path("id").asText() + " 缺少 entityRef");
      else if (entityKey != null && !entityKey.isBlank() && !entityKey.equals(sourceEntity)) {
        errors.add("数据源引用了非目标实体 " + sourceEntity);
      }
    }
    if (page.path("dataSources").isEmpty()) {
      warnings.add("页面没有数据源，仅适合静态展示");
    }
  }

  private void validateFlow(
      JsonNode flow,
      List<JsonNode> assets,
      JsonNode context,
      String entityKey,
      List<String> errors,
      List<String> warnings) {
    String id = flow.path("id").asText("");
    String key = flow.path("key").asText("");
    String processKey = flow.path("processKey").asText("");
    if (id.length() != 26) errors.add("流程 id 必须是 26 位 ULID");
    if (!KEY.matcher(key).matches()) errors.add("流程 key 必须是小写 snake_case");
    if (flow.path("name").asText("").isBlank()) errors.add("流程名称不能为空");
    if (!"flowable".equals(flow.path("engine").asText())) errors.add("流程 engine 必须是 flowable");
    if (!PROCESS_KEY.matcher(processKey).matches()) errors.add("processKey 格式不合法");

    String entityRef = flow.path("entityRef").path("key").asText("");
    if (entityKey != null && !entityKey.isBlank() && !entityRef.isBlank() && !entityKey.equals(entityRef)) {
      errors.add("流程 entityRef 与请求实体不一致");
    }

    Set<String> varNames = new HashSet<>();
    for (JsonNode variable : flow.path("variables")) {
      String name = variable.path("name").asText("");
      if (!VARIABLE.matcher(name).matches()) errors.add("流程变量 " + name + " 不是合法 camelCase");
      if (!varNames.add(name)) errors.add("流程变量 " + name + " 重复声明");
    }

    Set<String> fields = entityFields(context, entityKey);
    Map<String, JsonNode> forms = new HashMap<>();
    for (JsonNode form : flow.path("taskForms")) {
      String taskKey = form.path("taskKey").asText("");
      if (taskKey.isBlank()) {
        errors.add("taskForms 存在空 taskKey");
        continue;
      }
      if (forms.put(taskKey, form) != null) errors.add("taskForms 重复声明 " + taskKey);
      String commentField = form.path("commentField").asText("");
      if (!commentField.isBlank() && !varNames.contains(commentField)) {
        errors.add("节点 " + taskKey + " 的 commentField " + commentField + " 未在 variables 中声明");
      }
      for (String list : List.of("editableFields", "requiredFields", "readonlyFields")) {
        for (JsonNode field : form.path(list)) {
          String fieldKey = field.asText("");
          if (!fields.isEmpty() && !fields.contains(fieldKey)) {
            errors.add("节点 " + taskKey + " 的 " + list + " 字段 " + fieldKey + " 不在目标实体中");
          }
        }
      }
    }

    String bpmnKey = flow.path("bpmnRef").path("key").asText("");
    JsonNode bpmn = assets.stream()
        .filter(asset -> bpmnKey.equals(asset.path("key").asText()))
        .findFirst()
        .orElse(null);
    if (bpmn == null) {
      errors.add("流程引用的 BPMN 资产 " + bpmnKey + " 不在生成结果中");
      return;
    }
    if (!"bpmn".equals(bpmn.path("kind").asText())) errors.add("bpmnRef 资产类型必须是 bpmn");
    if (!"inline".equals(bpmn.path("storage").asText())) errors.add("BPMN 资产必须使用 inline 存储");
    String xml = bpmn.path("inline").path("content").asText("");
    if (xml.isBlank()) {
      errors.add("BPMN 资产内容为空");
      return;
    }
    BpmnInfo parsed;
    try {
      parsed = parse(xml);
    } catch (Exception ex) {
      errors.add("BPMN 无法解析：" + ex.getMessage());
      return;
    }
    if (parsed.processId().isBlank()) {
      errors.add("BPMN 缺少 process 节点");
      return;
    }
    if (!processKey.equals(parsed.processId())) {
      errors.add("Flow.processKey " + processKey + " 与 BPMN process id " + parsed.processId() + " 不一致");
    }
    if (forms.isEmpty()) errors.add("流程没有声明任何 taskForms，运行时无法解析办理人");
    for (String taskKey : forms.keySet()) {
      if (!parsed.userTasks().contains(taskKey)) {
        errors.add("taskKey " + taskKey + " 在 BPMN 中找不到同名 userTask");
      }
    }
    for (String taskKey : parsed.userTasks()) {
      if (!forms.containsKey(taskKey)) {
        errors.add("BPMN 中的 userTask " + taskKey + " 未在 taskForms 中声明");
      }
    }
    if (parsed.userTasks().isEmpty()) warnings.add("BPMN 没有 userTask，AI 生成的是无人工节点的流程");
  }

  private Set<String> entityFields(JsonNode context, String entityKey) {
    Set<String> fields = new LinkedHashSet<>();
    if (context == null || entityKey == null || entityKey.isBlank()) return fields;
    JsonNode entity = context.path("entity");
    if (entityKey.equals(entity.path("key").asText())) {
      for (JsonNode field : entity.path("fields")) {
        String key = field.path("key").asText("");
        if (!key.isBlank()) fields.add(key);
      }
    }
    for (JsonNode schema : context.path("dataSchemas")) {
      for (JsonNode item : schema.path("entities")) {
        if (!entityKey.equals(item.path("key").asText())) continue;
        for (JsonNode field : item.path("fields")) {
          String key = field.path("key").asText("");
          if (!key.isBlank()) fields.add(key);
        }
      }
    }
    return fields;
  }

  private static BpmnInfo parse(String xml) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    Document document = factory.newDocumentBuilder()
        .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    NodeList processes = document.getElementsByTagNameNS("*", "process");
    if (processes.getLength() == 0) processes = document.getElementsByTagName("process");
    String processId = "";
    if (processes.getLength() > 0) {
      processId = ((Element) processes.item(0)).getAttribute("id");
    }
    Set<String> tasks = new LinkedHashSet<>();
    NodeList userTasks = document.getElementsByTagNameNS("*", "userTask");
    if (userTasks.getLength() == 0) userTasks = document.getElementsByTagName("userTask");
    for (int i = 0; i < userTasks.getLength(); i++) {
      tasks.add(((Element) userTasks.item(i)).getAttribute("id"));
    }
    return new BpmnInfo(processId, tasks);
  }

  private static String text(JsonNode node) {
    if (node == null || node.isNull()) return "";
    if (node.isTextual()) return node.asText();
    return node.path("default").asText("");
  }

  public record BpmnInfo(String processId, Set<String> userTasks) {
  }
}