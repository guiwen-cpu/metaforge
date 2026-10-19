package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** 读取应用的线上发布件。运行时只认 current_version，不读草稿。 */
@Service
public class PublishedBundleService {

  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper json;

  public PublishedBundleService(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public PublishedBundle load(UUID appId) {
    Map<String, Object> app = jdbc.queryForMap(
        "select app_key, name, current_version from lcp_application"
            + " where tenant_id = :tenant and id = :id and deleted_at is null",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", appId));
    Integer version = app.get("current_version") == null
        ? null : ((Number) app.get("current_version")).intValue();
    if (version == null) {
      throw PlatformException.badRequest("app_not_published", "应用尚未发布，没有可运行的版本");
    }
    String raw = jdbc.queryForObject(
        "select bundle::text from lcp_app_version"
            + " where tenant_id = :tenant and app_id = :app and version_no = :version",
        new MapSqlParameterSource("tenant", tenant()).addValue("app", appId)
            .addValue("version", version), String.class);
    JsonNode root = parse(raw, "发布件不是合法 JSON");
    JsonNode content = root != null && root.has("bundle") ? root.get("bundle") : root;
    if (content == null || !content.isObject()) {
      throw PlatformException.badRequest("bundle_invalid", "发布件缺少 bundle 内容");
    }
    return new PublishedBundle(appId, String.valueOf(app.get("app_key")),
        String.valueOf(app.get("name")), version, content);
  }

  public List<JsonNode> flows(JsonNode bundle) {
    List<JsonNode> out = new ArrayList<>();
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode flow : logic.path("flows")) {
        if (flow.isObject()) {
          out.add(flow);
        }
      }
    }
    return out;
  }

  public JsonNode flow(JsonNode bundle, String flowKey) {
    for (JsonNode flow : flows(bundle)) {
      if (flowKey == null || flowKey.isBlank() || flowKey.equals(flow.path("key").asText())) {
        return flow;
      }
    }
    throw PlatformException.notFound("流程 " + (flowKey == null ? "" : flowKey) + " 不存在");
  }

  public JsonNode entity(JsonNode bundle, String entityKey) {
    for (JsonNode schema : bundle.path("artifacts").path("dataSchemas")) {
      for (JsonNode entity : schema.path("entities")) {
        if (entityKey != null && entityKey.equals(entity.path("key").asText())) {
          return entity;
        }
      }
    }
    return null;
  }

  public JsonNode api(JsonNode bundle, String apiKey) {
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode api : logic.path("apis")) {
        if (apiKey != null && apiKey.equals(api.path("key").asText())) {
          return api;
        }
      }
    }
    return null;
  }

  public JsonNode action(JsonNode bundle, String actionKey) {
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode action : logic.path("actions")) {
        if (actionKey != null && actionKey.equals(action.path("key").asText())) {
          return action;
        }
      }
    }
    return null;
  }

  public JsonNode asset(JsonNode bundle, String assetKey) {
    for (JsonNode asset : bundle.path("assets")) {
      if (assetKey != null && assetKey.equals(asset.path("key").asText())) {
        return asset;
      }
    }
    return null;
  }

  private JsonNode parse(String raw, String message) {
    try {
      return raw == null || raw.isBlank() ? null : json.readTree(raw);
    } catch (Exception ex) {
      throw PlatformException.badRequest("invalid_json", message);
    }
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return tenant;
  }

  public record PublishedBundle(
      UUID appId, String appKey, String appName, int versionNo, JsonNode content) {
  }
}
