package dev.lcp.bff.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 内置组件契约的唯一运行时快照。
 *
 * <p>AI 生成的页面必须落在注册表内，否则设计器能预览但运行时无法渲染。这里递归检查组件名、
 * 节点 id、属性名与字段控件，并把错误一次性返回，避免生成物“看起来能打开”。
 */
@Component
public class AiComponentRegistry {

  private static final String REGISTRY = "registry/builtin-components.json";
  private static final Set<String> COLLECTIONS = Set.of("fieldList", "columnList", "searchFieldList");

  private final Map<String, ComponentInfo> components = new LinkedHashMap<>();

  public AiComponentRegistry(ObjectMapper mapper) {
    try (InputStream in = new ClassPathResource(REGISTRY).getInputStream()) {
      JsonNode root = mapper.readTree(in);
      for (JsonNode item : root.path("components")) {
        String name = item.path("name").asText("");
        if (name.isBlank()) continue;
        Set<String> props = new LinkedHashSet<>();
        Set<String> required = new LinkedHashSet<>();
        for (JsonNode prop : item.path("props")) {
          String key = prop.path("key").asText("");
          if (key.isBlank()) continue;
          props.add(key);
          if (prop.path("required").asBoolean(false)) required.add(key);
        }
        components.put(name, new ComponentInfo(
            name,
            item.path("kind").asText(""),
            item.path("container").asBoolean(false),
            props,
            required));
      }
    } catch (Exception ex) {
      throw new IllegalStateException("无法读取组件注册表 " + REGISTRY, ex);
    }
    if (components.isEmpty()) {
      throw new IllegalStateException("组件注册表为空：" + REGISTRY);
    }
  }

  public Set<String> names() {
    return components.keySet();
  }

  public ComponentInfo info(String name) {
    return components.get(name);
  }

  public void validateNode(
      JsonNode node, Set<String> entityFields, List<String> issues, String where) {
    if (node == null || !node.isObject()) {
      issues.add(where + " 节点不是对象");
      return;
    }
    String component = node.path("component").asText("");
    String id = node.path("id").asText("");
    String at = where + "/" + (component.isBlank() ? "?" : component);
    if (id.length() != 26) issues.add(at + " 节点 id 必须是 26 位 ULID");
    ComponentInfo info = components.get(component);
    if (info == null) {
      issues.add(at + " 使用了未注册组件 " + component);
      return;
    }
    JsonNode props = node.path("props");
    if (props.isObject()) {
      for (String key : iterable(props.fieldNames())) {
        if (key.startsWith("x-") || "semantic".equals(key)) continue;
        if (!info.props().contains(key)) issues.add(at + " 属性 " + key + " 不在组件契约中");
      }
      for (String required : info.requiredProps()) {
        JsonNode value = props.get(required);
        if (value == null || value.isNull() || (value.isTextual() && value.asText().isBlank())) {
          issues.add(at + " 缺少必填属性 " + required);
        }
      }
      for (String collection : COLLECTIONS) {
        JsonNode items = props.get(collection);
        if (items == null || !items.isArray()) continue;
        int index = 0;
        for (JsonNode item : items) {
          String itemAt = at + "/" + collection + "[" + index + "]";
          if (!item.isObject()) {
            issues.add(itemAt + " 必须是对象");
          } else {
            String widget = item.path("widget").asText("");
            if (!widget.isBlank()) {
              ComponentInfo widgetInfo = components.get(widget);
              if (widgetInfo == null || !"field".equals(widgetInfo.kind())) {
                issues.add(itemAt + " 控件 " + widget + " 不是已注册的字段组件");
              }
            }
            String field = item.path("field").asText("");
            if (!field.isBlank()
                && !entityFields.isEmpty()
                && !"actions".equals(field)
                && !entityFields.contains(field)) {
              issues.add(itemAt + " 字段 " + field + " 不在目标实体中");
            }
          }
          index += 1;
        }
      }
    }
    JsonNode children = node.path("children");
    if (children.isArray()) {
      for (JsonNode child : children) validateNode(child, entityFields, issues, at);
    }
    JsonNode slots = node.path("slots");
    if (slots.isObject()) {
      for (String slot : iterable(slots.fieldNames())) {
        JsonNode list = slots.get(slot);
        if (!list.isArray()) continue;
        for (JsonNode child : list) validateNode(child, entityFields, issues, at + "@" + slot);
      }
    }
  }

  private static List<String> iterable(java.util.Iterator<String> iterator) {
    List<String> result = new ArrayList<>();
    iterator.forEachRemaining(result::add);
    return result;
  }

  public record ComponentInfo(
      String name,
      String kind,
      boolean container,
      Set<String> props,
      Set<String> requiredProps) {
  }
}