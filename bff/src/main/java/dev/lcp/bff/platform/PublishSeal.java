package dev.lcp.bff.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * 发布件的校验与版本盖章。
 *
 * <p>设计器保存草稿时允许不完整；发布时由平台补齐 snapshot，保证版本表里的 bundle
 * 自身就带完整审计信息（谁、何时、第几版、回滚自哪一版）。
 */
final class PublishSeal {

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  private PublishSeal() {
  }

  /**
   * 统一入口：API 的 bundle 字段传 AppBundle 本体；落库时包成 { bundle: ... } 信封。
   * 兼容客户端直接提交完整信封的写法。
   */
  static JsonNode inner(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (node.isObject()
        && node.get("bundle") instanceof ObjectNode nested
        && !node.has("protocolVersion")) {
      return nested;
    }
    return node;
  }

  static JsonNode envelope(JsonNode bundle) {
    if (bundle == null || bundle.isNull()) {
      return null;
    }
    ObjectNode root = NODES.objectNode();
    root.set("bundle", bundle);
    return root;
  }

  /** 发布前的最小完整性校验：信封、协议版本、app.key 三者必须对得上。 */
  static void validate(JsonNode payload, String appKey) {
    if (payload == null || !payload.isObject()) {
      throw PlatformException.badRequest("bundle_required", "发布内容必须是 JSON 对象");
    }
    JsonNode bundle = payload.get("bundle");
    if (bundle == null || !bundle.isObject()) {
      throw PlatformException.badRequest("bundle_required", "发布内容缺少 bundle 对象");
    }
    JsonNode protocolVersion = bundle.get("protocolVersion");
    if (protocolVersion == null || !protocolVersion.isTextual() || protocolVersion.asText().isBlank()) {
      throw PlatformException.badRequest("protocol_version_required", "bundle.protocolVersion 不能为空");
    }
    JsonNode app = bundle.get("app");
    if (app == null || !app.isObject()) {
      throw PlatformException.badRequest("app_required", "bundle.app 不能为空");
    }
    JsonNode key = app.get("key");
    if (key == null || !key.isTextual() || !key.asText().equals(appKey)) {
      throw PlatformException.badRequest(
          "app_key_mismatch", "bundle.app.key 必须与应用的 key（" + appKey + "）一致");
    }
  }

  static JsonNode stamp(
      JsonNode payload,
      int versionNo,
      String message,
      String userId,
      String rollbackOfSnapshotId,
      String basedOnSnapshotId) {
    ObjectNode bundle = (ObjectNode) payload.get("bundle");
    ObjectNode snapshot = bundle.get("snapshot") instanceof ObjectNode existing
        ? existing
        : bundle.putObject("snapshot");
    String now = OffsetDateTime.now(ZoneOffset.UTC).toString();
    snapshot.put("snapshotId", Ulid.next());
    snapshot.put("version", versionNo);
    snapshot.put("status", "published");
    snapshot.put("message", message);
    snapshot.put("publishedAt", now);
    snapshot.set("publishedBy", actor(userId));
    if (!snapshot.hasNonNull("createdAt")) {
      snapshot.put("createdAt", now);
    }
    if (!snapshot.hasNonNull("author")) {
      snapshot.set("author", actor(userId));
    }
    if (basedOnSnapshotId == null) {
      snapshot.remove("basedOn");
    } else {
      snapshot.put("basedOn", basedOnSnapshotId);
    }
    if (rollbackOfSnapshotId == null) {
      snapshot.remove("rollbackOf");
    } else {
      snapshot.put("rollbackOf", rollbackOfSnapshotId);
    }
    return payload;
  }

  static String snapshotId(JsonNode stamped) {
    JsonNode value = stamped.path("bundle").path("snapshot").get("snapshotId");
    return value == null ? null : value.asText();
  }

  static String text(JsonNode node, String field) {
    JsonNode value = node == null ? null : node.get(field);
    if (value == null || !value.isTextual() || value.asText().isBlank()) {
      return null;
    }
    return value.asText().trim();
  }

  private static ObjectNode actor(String userId) {
    ObjectNode node = NODES.objectNode();
    node.put("id", userId == null || userId.isBlank() ? "anonymous" : userId);
    node.put("type", "user");
    return node;
  }
}