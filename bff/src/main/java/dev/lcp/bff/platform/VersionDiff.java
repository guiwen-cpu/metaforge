package dev.lcp.bff.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.platform.dto.AppViews.ChecksumPair;
import dev.lcp.bff.platform.dto.AppViews.DiffEntry;
import dev.lcp.bff.platform.dto.AppViews.DiffSummary;
import dev.lcp.bff.platform.dto.AppViews.VersionDiffView;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 版本内容对比。
 *
 * <p>只比较“内容”（bundle 去掉 snapshot）：发布人、发布时间、版本号天然不同，
 * 纳入比较只会制造噪音。数组优先按 key（其次 id、name）配对，界面因此可以按工件
 * 而不是数组下标展示差异；配对失败时退回下标比较。
 */
final class VersionDiff {

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
  private static final int MAX_CHANGES = 200;
  private static final int INLINE_LIMIT = 2000;
  private static final List<String> KEY_FIELDS = List.of("key", "id", "name");

  private VersionDiff() {
  }

  static VersionDiffView compare(
      int fromVersion,
      JsonNode fromEnvelope,
      String fromChecksum,
      int toVersion,
      JsonNode toEnvelope,
      String toChecksum) {
    JsonNode from = PublishSeal.content(fromEnvelope);
    JsonNode to = PublishSeal.content(toEnvelope);
    boolean identical = from != null && to != null && from.equals(to);
    Builder builder = new Builder();
    if (!identical) {
      compareNode(from, to, "", builder);
    }
    int added = 0;
    int removed = 0;
    int changed = 0;
    for (DiffEntry entry : builder.changes) {
      switch (entry.kind()) {
        case "added" -> added++;
        case "removed" -> removed++;
        default -> changed++;
      }
    }
    return new VersionDiffView(
        fromVersion,
        toVersion,
        identical,
        new ChecksumPair(fromChecksum, toChecksum),
        new DiffSummary(added, removed, changed, builder.changes.size()),
        List.copyOf(builder.changes),
        builder.truncated);
  }

  private static void compareNode(JsonNode left, JsonNode right, String path, Builder out) {
    if (out.full()) {
      return;
    }
    JsonNode from = left == null ? NullNode.instance : left;
    JsonNode to = right == null ? NullNode.instance : right;
    if (from.equals(to)) {
      return;
    }
    if (from.isNull() || to.isNull()) {
      out.add(path, from.isNull() ? "added" : "removed", from, to);
      return;
    }
    if (from.isObject() && to.isObject()) {
      Set<String> names = new LinkedHashSet<>();
      from.fieldNames().forEachRemaining(names::add);
      to.fieldNames().forEachRemaining(names::add);
      for (String name : names) {
        compareNode(from.get(name), to.get(name), join(path, name), out);
        if (out.full()) {
          return;
        }
      }
      return;
    }
    if (from.isArray() && to.isArray()) {
      String keyField = keyField(from, to);
      if (keyField != null) {
        Map<String, JsonNode> leftById = index(from, keyField);
        Map<String, JsonNode> rightById = index(to, keyField);
        Set<String> keys = new LinkedHashSet<>(leftById.keySet());
        keys.addAll(rightById.keySet());
        for (String key : keys) {
          compareNode(leftById.get(key), rightById.get(key), path + "[" + key + "]", out);
          if (out.full()) {
            return;
          }
        }
      } else {
        int size = Math.max(from.size(), to.size());
        for (int index = 0; index < size; index++) {
          compareNode(from.get(index), to.get(index), path + "[" + index + "]", out);
          if (out.full()) {
            return;
          }
        }
      }
      return;
    }
    out.add(path, "changed", from, to);
  }

  /** 只有两侧数组都能按同一字段唯一配对时才使用键匹配，否则退回下标比较。 */
  private static String keyField(JsonNode left, JsonNode right) {
    for (String field : KEY_FIELDS) {
      if (allKeyed(left, field) && allKeyed(right, field)) {
        return field;
      }
    }
    return null;
  }

  private static boolean allKeyed(JsonNode array, String field) {
    Set<String> seen = new LinkedHashSet<>();
    for (JsonNode item : array) {
      if (!item.isObject()) {
        return false;
      }
      JsonNode value = item.get(field);
      if (value == null || !value.isTextual() || value.asText().isBlank()) {
        return false;
      }
      if (!seen.add(value.asText())) {
        return false;
      }
    }
    return true;
  }

  private static Map<String, JsonNode> index(JsonNode array, String field) {
    Map<String, JsonNode> result = new LinkedHashMap<>();
    for (JsonNode item : array) {
      result.put(item.get(field).asText(), item);
    }
    return result;
  }

  private static String join(String path, String name) {
    return path.isEmpty() ? name : path + "." + name;
  }

  private static String singular(String collection) {
    return switch (collection) {
      case "dataSchemas" -> "dataSchema";
      case "uiSchemas" -> "uiSchema";
      case "logicSchemas" -> "logicSchema";
      case "components" -> "component";
      case "enums" -> "enum";
      case "roles" -> "role";
      case "permissions" -> "permission";
      default -> collection;
    };
  }

  /** 超长节点只回传定位信息，避免 diff 响应被整棵子页面撑爆。 */
  private static JsonNode present(JsonNode node) {
    if (node == null) {
      return NullNode.instance;
    }
    String text = JsonCanonical.write(node);
    if (text == null || text.length() <= INLINE_LIMIT) {
      return node;
    }
    ObjectNode summary = NODES.objectNode();
    summary.put("_truncated", true);
    summary.put("_chars", text.length());
    if (node.isObject()) {
      for (String field : List.of("id", "key", "name", "title", "type")) {
        JsonNode value = node.get(field);
        if (value != null && value.isValueNode()) {
          summary.set(field, value);
        }
      }
    }
    return summary;
  }

  static final class Builder {

    final List<DiffEntry> changes = new ArrayList<>();
    boolean truncated;

    boolean full() {
      if (changes.size() >= MAX_CHANGES) {
        truncated = true;
        return true;
      }
      return false;
    }

    void add(String path, String kind, JsonNode before, JsonNode after) {
      if (full()) {
        return;
      }
      String artifactKind = null;
      String artifactKey = null;
      if (path.startsWith("artifacts.")) {
        String rest = path.substring("artifacts.".length());
        int dot = rest.indexOf('.');
        String collection = dot < 0 ? rest : rest.substring(0, dot);
        artifactKind = singular(collection);
        if (dot > 0) {
          String segment = rest.substring(dot + 1);
          int bracket = segment.indexOf('[');
          int end = bracket > 0 ? bracket : segment.length();
          int nextDot = segment.indexOf('.');
          if (nextDot > 0 && nextDot < end) {
            end = nextDot;
          }
          artifactKey = segment.substring(0, end);
        }
      }
      changes.add(new DiffEntry(path, kind, artifactKind, artifactKey, present(before), present(after)));
    }
  }
}