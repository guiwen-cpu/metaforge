package dev.lcp.bff.platform;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

/**
 * 元数据 JSON 的规范化与摘要。
 *
 * <p>摘要必须可复现：先按 key 排序重写对象，再紧凑序列化。否则同一份元数据只要键顺序不同，
 * checksum 就会变化，「内容未变不重复发布」的判断会失效。
 */
final class JsonCanonical {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  private JsonCanonical() {
  }

  static JsonNode parse(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return JSON.readTree(raw);
    } catch (JsonProcessingException ex) {
      throw PlatformException.badRequest("invalid_json", "元数据不是合法 JSON：" + ex.getOriginalMessage());
    }
  }

  static String write(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    try {
      return JSON.writeValueAsString(node);
    } catch (JsonProcessingException ex) {
      throw PlatformException.badRequest("invalid_json", "元数据无法序列化：" + ex.getOriginalMessage());
    }
  }

  static String sha256(JsonNode node) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256")
          .digest(write(canonical(node)).getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(digest.length * 2);
      for (byte value : digest) {
        hex.append(Character.forDigit((value >> 4) & 0xF, 16));
        hex.append(Character.forDigit(value & 0xF, 16));
      }
      return hex.toString();
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("JRE 缺少 SHA-256", ex);
    }
  }

  private static JsonNode canonical(JsonNode node) {
    if (node.isObject()) {
      ObjectNode out = NODES.objectNode();
      List<String> names = new ArrayList<>();
      node.fieldNames().forEachRemaining(names::add);
      names.sort(String::compareTo);
      for (String name : names) {
        out.set(name, canonical(node.get(name)));
      }
      return out;
    }
    if (node.isArray()) {
      ArrayNode out = NODES.arrayNode(node.size());
      for (JsonNode item : node) {
        out.add(canonical(item));
      }
      return out;
    }
    return node;
  }
}