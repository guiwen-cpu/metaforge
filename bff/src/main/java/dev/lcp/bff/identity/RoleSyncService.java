package dev.lcp.bff.identity;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.tenant.TenantContext;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** 把发布件 artifacts.roles 同步为租户内可查询的角色定义。 */
@Service
public class RoleSyncService {

  private final NamedParameterJdbcTemplate jdbc;
  private final Set<String> synced = ConcurrentHashMap.newKeySet();

  public RoleSyncService(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void syncIfNeeded(UUID appId, int versionNo, JsonNode bundle) {
    String tenant = TenantContext.tenantId();
    if (tenant == null || appId == null || bundle == null) {
      return;
    }
    String cacheKey = tenant + ":" + appId + ":" + versionNo;
    if (!synced.add(cacheKey)) {
      return;
    }
    sync(appId, bundle);
  }

  public void sync(UUID appId, JsonNode bundle) {
    String tenant = TenantContext.tenantId();
    if (tenant == null || appId == null || bundle == null) {
      return;
    }
    List<String> keys = new ArrayList<>();
    for (JsonNode role : bundle.path("artifacts").path("roles")) {
      String key = role.path("key").asText(null);
      if (key == null || key.isBlank()) {
        continue;
      }
      keys.add(key);
      UUID id = UUID.nameUUIDFromBytes(
          ("lcp-role:" + tenant + ":" + appId + ":" + key).getBytes(StandardCharsets.UTF_8));
      String name = role.path("name").asText(key);
      String level = role.path("level").asText("app");
      String dataScope = role.path("dataScope").asText("self");
      boolean builtin = role.path("builtin").asBoolean(false);
      String customRule = role.has("customRule") ? role.get("customRule").toString() : null;
      jdbc.update("""
          insert into lcp_role
            (id, tenant_id, role_key, name, scope, app_id, data_scope, custom_rule, builtin, enabled)
          values (:id, :tenant, :key, :name, :scope, :app, :data, cast(:rule as jsonb), :builtin, true)
          on conflict (id) do update set
            name = excluded.name,
            scope = excluded.scope,
            app_id = excluded.app_id,
            data_scope = excluded.data_scope,
            custom_rule = excluded.custom_rule,
            builtin = excluded.builtin,
            enabled = true,
            updated_at = now()
          """, new MapSqlParameterSource()
          .addValue("id", id)
          .addValue("tenant", tenant)
          .addValue("key", key)
          .addValue("name", name)
          .addValue("scope", level)
          .addValue("app", appId)
          .addValue("data", dataScope)
          .addValue("rule", customRule)
          .addValue("builtin", builtin));
    }
    if (keys.isEmpty()) {
      jdbc.update("delete from lcp_role where tenant_id = :tenant and app_id = :app",
          new MapSqlParameterSource("tenant", tenant).addValue("app", appId));
    } else {
      jdbc.update("""
          delete from lcp_role
           where tenant_id = :tenant and app_id = :app
             and role_key not in (:keys)
          """, new MapSqlParameterSource("tenant", tenant).addValue("app", appId)
          .addValue("keys", keys));
    }
  }
}