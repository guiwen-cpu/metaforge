package dev.lcp.bff.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.ai.AiDtos.AiGenerateRequest;
import dev.lcp.bff.platform.Ulid;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

/**
 * OpenAI 兼容的 Chat Completions 客户端。
 *
 * <p>只依赖 JDK HttpClient，不引入新 SDK。请求成功但产物不合法时由 AiService 回退本地生成；
 * 外部模型只负责语义，组件白名单与 BPMN 交叉校验仍由平台守卫完成。
 */
@Component
public class OpenAiCompatibleClient {

  private final ObjectMapper mapper;
  private final AiProperties properties;
  private final AiComponentRegistry registry;
  private final HttpClient http;

  public OpenAiCompatibleClient(
      ObjectMapper mapper, AiProperties properties, AiComponentRegistry registry) {
    this.mapper = mapper;
    this.properties = properties;
    this.registry = registry;
    this.http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(properties.getTimeoutMs()))
        .build();
  }

  public External generate(AiGenerateRequest request) throws Exception {
    String endpoint = endpoint(properties.getBaseUrl());
    ObjectNode body = mapper.createObjectNode();
    body.put("model", properties.getModel());
    body.put("temperature", 0.2);
    body.put("stream", false);
    ArrayNode messages = mapper.createArrayNode();
    messages.add(message("system", systemPrompt()));
    messages.add(message("user", userPrompt(request)));
    body.set("messages", messages);

    HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
        .timeout(Duration.ofMillis(properties.getTimeoutMs()))
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer " + properties.getApiKey())
        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
        .build();
    HttpResponse<String> response = http.send(
        httpRequest, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      String detail = response.body() == null ? "" : response.body();
      if (detail.length() > 300) detail = detail.substring(0, 300);
      throw new IllegalStateException("模型返回 HTTP " + response.statusCode() + "：" + detail);
    }
    JsonNode root = mapper.readTree(response.body());
    String content = content(root);
    if (content.isBlank()) throw new IllegalStateException("模型响应缺少 choices[0].message.content");
    JsonNode parsed = mapper.readTree(jsonObject(content));
    JsonNode artifact = parsed.path("artifact");
    if (!artifact.isObject()) throw new IllegalStateException("模型响应缺少 artifact 对象");
    normalizeIds("flow".equals(request.kind()), artifact, parsed.path("assets"));
    List<JsonNode> assets = new ArrayList<>();
    for (JsonNode asset : parsed.path("assets")) assets.add(asset);
    List<String> warnings = new ArrayList<>();
    for (JsonNode warning : parsed.path("warnings")) {
      if (warning.isTextual()) warnings.add(warning.asText());
    }
    return new External(artifact, assets, warnings);
  }

  private String systemPrompt() {
    Set<String> names = new TreeSet<>(registry.names());
    return """
        你是 MetaForge 低代码平台的元数据生成器。只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释。
        输出结构：{"artifact": <页面或流程对象>, "assets": [<资产>], "warnings": ["..."]}。
        页面（kind=form/page）要求：
        - 根节点必须是 x-page；页面必填 id、key、title、kind、version、route、layout。
        - id 必须是 26 位 ULID；key 为小写 snake_case；route.path 以 / 开头。
        - 只能使用以下组件：%s。
        - 表单用 x-form，列表用 x-search-form + x-table + x-pagination，详情用 x-descriptions。
        - 节点 props 只能用组件契约里的属性；字段控件使用 x-input/x-textarea/x-number/x-switch/x-select/x-date-picker/x-upload 等已注册组件。
        流程（kind=flow）要求：
        - 输出 Flow 对象（id/key/name/engine=flowable/processKey/bpmnRef），并同时输出 assets 中的内联 BPMN。
        - processKey 必须与 BPMN 的 process id 完全一致。
        - 每个 userTask id 必须出现在 taskForms[].taskKey 中，且 taskForms 不能声明 BPMN 中不存在的节点。
        - 流程变量写在 variables[]，办理意见 commentField 必须在 variables[].name 中声明。
        - BPMN 使用 Flowable 命名空间，包含 lcpTaskListener 的 create/complete 监听器。
        """.formatted(String.join(", ", names));
  }

  private String userPrompt(AiGenerateRequest request) throws Exception {
    ObjectNode payload = mapper.createObjectNode();
    payload.put("kind", request.kind());
    payload.put("prompt", request.prompt());
    if (request.entityKey() != null) payload.put("entity_key", request.entityKey());
    if (request.pageKind() != null) payload.put("page_kind", request.pageKind());
    if (request.context() != null) payload.set("context", request.context());
    return mapper.writeValueAsString(payload);
  }

  private static ObjectNode message(String role, String content) {
    ObjectNode message = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    message.put("role", role);
    message.put("content", content);
    return message;
  }

  private static String endpoint(String baseUrl) {
    String base = baseUrl.trim();
    if (base.endsWith("/chat/completions")) return base;
    if (!base.endsWith("/")) base = base + "/";
    return base + "chat/completions";
  }

  private String content(JsonNode root) {
    JsonNode content = root.path("choices").path(0).path("message").path("content");
    if (content.isTextual()) return content.asText();
    if (content.isArray()) {
      StringBuilder out = new StringBuilder();
      for (JsonNode part : content) {
        String text = part.path("text").asText("");
        if (!text.isBlank()) out.append(text);
      }
      return out.toString();
    }
    return "";
  }

  private static String jsonObject(String content) {
    String text = content.trim();
    if (text.startsWith("```")) {
      int firstLine = text.indexOf('\n');
      if (firstLine >= 0) text = text.substring(firstLine + 1);
      int fence = text.lastIndexOf("```");
      if (fence >= 0) text = text.substring(0, fence);
      text = text.trim();
    }
    int start = text.indexOf('{');
    int end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new IllegalStateException("模型输出不是 JSON 对象");
    }
    return text.substring(start, end + 1);
  }

  private void normalizeIds(boolean flow, JsonNode artifact, JsonNode assets) {
    if (flow) {
      ensureId(artifact);
      for (JsonNode asset : assets) ensureId(asset, "assetId");
      JsonNode ref = artifact.path("bpmnRef");
      if (ref.isObject()) ensureId(ref, "assetId");
      return;
    }
    ensureId(artifact);
    normalizeNode(artifact.path("layout"));
    for (JsonNode dialog : artifact.path("dialogs")) normalizeNode(dialog);
  }

  private void normalizeNode(JsonNode node) {
    if (node == null || !node.isObject()) return;
    ensureId(node);
    for (JsonNode child : node.path("children")) normalizeNode(child);
    JsonNode slots = node.path("slots");
    if (slots.isObject()) {
      for (String key : iterable(slots.fieldNames())) {
        for (JsonNode child : slots.get(key)) normalizeNode(child);
      }
    }
  }

  private static void ensureId(JsonNode node) {
    ensureId(node, "id");
  }

  private static void ensureId(JsonNode node, String field) {
    if (!(node instanceof ObjectNode object)) return;
    String id = node.path(field).asText("");
    if (id.length() != 26) object.put(field, Ulid.next());
  }

  private static List<String> iterable(java.util.Iterator<String> iterator) {
    List<String> result = new ArrayList<>();
    iterator.forEachRemaining(result::add);
    return result;
  }

  public record External(JsonNode artifact, List<JsonNode> assets, List<String> warnings) {
  }
}