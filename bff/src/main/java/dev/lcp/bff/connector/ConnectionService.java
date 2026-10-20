package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.connector.ConnectorDtos.ConnectionAuditView;
import dev.lcp.bff.connector.ConnectorDtos.ConnectionView;
import dev.lcp.bff.connector.ConnectorDtos.CreateConnectionRequest;
import dev.lcp.bff.connector.ConnectorDtos.UpdateConnectionRequest;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** 租户级连接器注册表。Bundle 只保存连接 key，外部地址与默认鉴权由本服务维护。 */
@Service
public class ConnectionService {

  private static final Pattern KEY = Pattern.compile("[a-z][a-z0-9_]{0,63}");
  private static final Pattern HEADER = Pattern.compile("[!#$%&'*+.0-9A-Z^_`|a-z~-]+");
  private static final Pattern QUERY_NAME = Pattern.compile("[A-Za-z0-9_.~-]+");
  private static final Set<String> RESERVED_HEADERS = Set.of(
      "authorization", "proxy-authorization", "cookie", "set-cookie", "host",
      "content-length", "transfer-encoding", "x-api-key", "api-key");
  private static final Set<String> KINDS =
      Set.of("rest", "graphql", "soap", "database", "internal");
  private static final Set<String> AUTH_TYPES = Set.of(
      "none", "tenant", "bearer", "apiKey", "basic", "oauth2", "signature");
  private static final Set<String> GRANTS = Set.of(
      "clientCredentials", "authorizationCode", "password");
  private static final Set<String> CONFIG_FIELDS = Set.of(
      "timeoutMs", "headers", "auth", "jdbcUrl", "driver", "usernameRef", "passwordRef",
      "maxRows", "queryTimeoutSec", "soapAction");
  private static final String COLUMNS =
      "id, connection_key, name, kind, base_url, config, enabled, created_by, updated_by,"
          + " created_at, updated_at";

  private final NamedParameterJdbcTemplate jdbc;
  private final IdentityService identity;
  private final OutboundUrlPolicy urls;
  private final ObjectMapper json;

  public ConnectionService(
      NamedParameterJdbcTemplate jdbc,
      IdentityService identity,
      OutboundUrlPolicy urls,
      ObjectMapper json) {
    this.jdbc = jdbc;
    this.identity = identity;
    this.urls = urls;
    this.json = json;
  }

  public List<ConnectionView> list() {
    return jdbc.query(
        "select " + COLUMNS + " from lcp_connection where tenant_id = :tenant"
            + " order by updated_at desc, connection_key",
        params(), (rs, rowNum) -> view(rs));
  }

  @Transactional
  public ConnectionView create(CreateConnectionRequest request) {
    identity.requireAdmin();
    String key = requireKey(request.key());
    String name = required(request.name(), "连接器名称");
    String kind = kind(request.kind());
    String baseUrl = validateBaseUrl(request.baseUrl(), kind);
    JsonNode config = normalizeConfig(request.config(), kind);
    UUID id = UUID.randomUUID();
    boolean enabled = request.enabled() == null || request.enabled();
    try {
      jdbc.update("""
          insert into lcp_connection
            (id, tenant_id, connection_key, name, kind, base_url, config, enabled,
             created_by, updated_by)
          values
            (:id, :tenant, :key, :name, :kind, :baseUrl, cast(:config as jsonb), :enabled,
             :user, :user)
          """, params()
          .addValue("id", id)
          .addValue("key", key)
          .addValue("name", name)
          .addValue("kind", kind)
          .addValue("baseUrl", baseUrl)
          .addValue("config", config.toString())
          .addValue("enabled", enabled));
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("CONNECTION_KEY_EXISTS", "连接器 key 已存在：" + key);
    }
    ConnectionView created = get(id);
    audit(id, key, "create", null, created);
    return created;
  }

  @Transactional
  public ConnectionView patch(UUID id, UpdateConnectionRequest request) {
    identity.requireAdmin();
    ConnectionRow current = row(id);
    String name = request.name() == null ? current.name() : required(request.name(), "连接器名称");
    String baseUrl = request.baseUrl() == null
        ? current.baseUrl() : validateBaseUrl(request.baseUrl(), current.kind);
    JsonNode config = request.config() == null
        ? current.config() : normalizeConfig(request.config(), current.kind);
    boolean enabled = request.enabled() == null ? current.enabled() : request.enabled();
    jdbc.update("""
        update lcp_connection
           set name = :name,
               base_url = :baseUrl,
               config = cast(:config as jsonb),
               enabled = :enabled,
               updated_by = :user,
               updated_at = now()
         where tenant_id = :tenant and id = :id
        """, params()
        .addValue("id", id)
        .addValue("name", name)
        .addValue("baseUrl", baseUrl)
        .addValue("config", config.toString())
        .addValue("enabled", enabled));
    ConnectionView updated = get(id);
    audit(id, current.key, "update", current.view(), updated);
    return updated;
  }

  @Transactional
  public void delete(UUID id) {
    identity.requireAdmin();
    ConnectionRow current = row(id);
    int changed = jdbc.update(
        "delete from lcp_connection where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
    if (changed == 0) {
      throw PlatformException.notFound("连接器 " + id + " 不存在");
    }
    audit(id, current.key, "delete", current.view(), null);
  }

  public List<ConnectionAuditView> audits(UUID id) {
    identity.requireAdmin();
    row(id);
    return jdbc.query("""
        select id, connection_id, connection_key, action, actor, before_state, after_state,
               created_at
          from lcp_connection_audit
         where tenant_id = :tenant and connection_id = :id
         order by created_at desc
         limit 200
        """, params().addValue("id", id), (rs, rowNum) -> new ConnectionAuditView(
            rs.getObject("id", UUID.class).toString(),
            rs.getObject("connection_id", UUID.class).toString(),
            rs.getString("connection_key"), rs.getString("action"), rs.getString("actor"),
            readJson(rs.getString("before_state")), readJson(rs.getString("after_state")),
            rs.getObject("created_at", OffsetDateTime.class)));
  }

  public ConnectionView get(UUID id) {
    return jdbc.query(
        "select " + COLUMNS + " from lcp_connection"
            + " where tenant_id = :tenant and id = :id",
        params().addValue("id", id), (rs, rowNum) -> view(rs))
        .stream().findFirst()
        .orElseThrow(() -> PlatformException.notFound("连接器 " + id + " 不存在"));
  }

  /** 运行时按 key（兼容 secret:<key>）或 id 查找；不存在返回 null，由执行器给业务错误码。 */
  public RuntimeConnection runtime(String ref) {
    if (!StringUtils.hasText(ref)) {
      return null;
    }
    String key = ref.trim();
    if (key.regionMatches(true, 0, "secret:", 0, 7)) {
      key = key.substring(7);
    }
    List<ConnectionRow> byKey = jdbc.query(
        "select " + COLUMNS + " from lcp_connection"
            + " where tenant_id = :tenant and connection_key = :key",
        params().addValue("key", key), (rs, rowNum) -> row(rs));
    if (!byKey.isEmpty()) {
      return byKey.get(0).runtime();
    }
    try {
      UUID id = UUID.fromString(key);
      List<ConnectionRow> byId = jdbc.query(
          "select " + COLUMNS + " from lcp_connection"
              + " where tenant_id = :tenant and id = :id",
          params().addValue("id", id), (rs, rowNum) -> row(rs));
      return byId.isEmpty() ? null : byId.get(0).runtime();
    } catch (IllegalArgumentException ignored) {
      return null;
    }
  }

  private ConnectionRow row(UUID id) {
    return jdbc.query(
        "select " + COLUMNS + " from lcp_connection"
            + " where tenant_id = :tenant and id = :id",
        params().addValue("id", id), (rs, rowNum) -> row(rs))
        .stream().findFirst()
        .orElseThrow(() -> PlatformException.notFound("连接器 " + id + " 不存在"));
  }

  private String validateBaseUrl(String raw, String kind) {
    String value = trimToNull(raw);
    if ("database".equals(kind) || "internal".equals(kind)) {
      if (value != null) {
        throw PlatformException.badRequest(
            "CONNECTION_URL_INVALID", kind + " 连接器不使用 baseUrl，请在 config 中配置");
      }
      return null;
    }
    if (value == null) {
      return null;
    }
    try {
      urls.validate(value);
      return value;
    } catch (OutboundUrlPolicy.PolicyViolation ex) {
      throw PlatformException.badRequest("CONNECTION_URL_BLOCKED", ex.getMessage());
    }
  }

  private JsonNode normalizeConfig(JsonNode config, String kind) {
    if (config == null || config.isNull()) {
      return json.createObjectNode();
    }
    if (!config.isObject()) {
      throw PlatformException.badRequest("CONNECTION_CONFIG_INVALID", "config 必须是对象");
    }
    ObjectNode out = ((ObjectNode) config).deepCopy();
    Iterator<String> fields = out.fieldNames();
    while (fields.hasNext()) {
      String field = fields.next();
      if (!field.startsWith("x-") && !CONFIG_FIELDS.contains(field)) {
        throw PlatformException.badRequest(
            "CONNECTION_CONFIG_INVALID", "不支持的连接器配置字段：" + field);
      }
    }
    JsonNode timeout = out.get("timeoutMs");
    if (timeout != null && (!timeout.isInt() || timeout.asInt() < 1 || timeout.asInt() > 120_000)) {
      throw PlatformException.badRequest(
          "CONNECTION_TIMEOUT_INVALID", "timeoutMs 需为 1-120000 的整数");
    }
    JsonNode headers = out.get("headers");
    if (headers != null) {
      validateHeaders(headers);
    }
    JsonNode auth = out.get("auth");
    if (auth != null && !auth.isNull()) {
      if ("database".equals(kind) || "internal".equals(kind)) {
        throw PlatformException.badRequest(
            "CONNECTION_AUTH_INVALID", kind + " 连接器不支持 HTTPS 鉴权配置");
      }
      validateAuth(auth);
    }
    if ("database".equals(kind)) {
      validateDatabaseConfig(out);
    }
    if ("soap".equals(kind)) {
      JsonNode action = out.get("soapAction");
      if (action != null && (!action.isTextual() || action.asText().length() > 512
          || action.asText().indexOf('\r') >= 0 || action.asText().indexOf('\n') >= 0)) {
        throw PlatformException.badRequest(
            "CONNECTION_CONFIG_INVALID", "soapAction 必须是单行文本");
      }
    }
    return out;
  }

  private void validateDatabaseConfig(ObjectNode config) {
    String jdbcUrl = config.path("jdbcUrl").asText("");
    if (!jdbcUrl.startsWith("jdbc:postgresql://") || jdbcUrl.length() > 2048
        || jdbcUrl.indexOf('\r') >= 0 || jdbcUrl.indexOf('\n') >= 0) {
      throw PlatformException.badRequest(
          "CONNECTION_DATABASE_INVALID", "database 连接器仅支持 jdbc:postgresql:// 地址");
    }
    if (jdbcUrl.indexOf('?') >= 0 || jdbcUrl.indexOf(';') >= 0) {
      throw PlatformException.badRequest(
          "CONNECTION_DATABASE_INVALID", "jdbcUrl 不允许附加连接参数");
    }
    String driver = config.path("driver").asText("org.postgresql.Driver");
    if (!"org.postgresql.Driver".equals(driver)) {
      throw PlatformException.badRequest(
          "CONNECTION_DATABASE_INVALID", "database 连接器仅允许 PostgreSQL 驱动");
    }
    secretRef(config, "usernameRef");
    secretRef(config, "passwordRef");
    JsonNode maxRows = config.get("maxRows");
    if (maxRows != null && (!maxRows.isInt() || maxRows.asInt() < 1 || maxRows.asInt() > 5000)) {
      throw PlatformException.badRequest(
          "CONNECTION_DATABASE_INVALID", "maxRows 需为 1-5000 的整数");
    }
    JsonNode timeout = config.get("queryTimeoutSec");
    if (timeout != null && (!timeout.isInt() || timeout.asInt() < 1 || timeout.asInt() > 60)) {
      throw PlatformException.badRequest(
          "CONNECTION_DATABASE_INVALID", "queryTimeoutSec 需为 1-60 的整数");
    }
    try {
      urls.validateJdbcHost(jdbcUrl.substring("jdbc:postgresql://".length()));
    } catch (OutboundUrlPolicy.PolicyViolation ex) {
      throw PlatformException.badRequest("CONNECTION_URL_BLOCKED", ex.getMessage());
    }
  }

  private void validateHeaders(JsonNode headers) {
    if (!headers.isArray() || headers.size() > 50) {
      throw PlatformException.badRequest(
          "CONNECTION_HEADERS_INVALID", "headers 必须是不超过 50 项的数组");
    }
    for (JsonNode header : headers) {
      String name = header.path("name").asText("");
      String value = header.path("value").asText("");
      if (!HEADER.matcher(name).matches()) {
        throw PlatformException.badRequest("CONNECTION_HEADERS_INVALID", "请求头名称非法：" + name);
      }
      if (RESERVED_HEADERS.contains(name.toLowerCase(Locale.ROOT))) {
        throw PlatformException.badRequest(
            "CONNECTION_HEADER_RESERVED", "鉴权类请求头请使用 auth + secretRef：" + name);
      }
      if (value.length() > 2048 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
        throw PlatformException.badRequest("CONNECTION_HEADERS_INVALID", "请求头值非法：" + name);
      }
    }
  }

  private void validateAuth(JsonNode auth) {
    if (!auth.isObject()) {
      throw PlatformException.badRequest("CONNECTION_AUTH_INVALID", "auth 必须是对象");
    }
    String type = auth.path("type").asText("");
    if (!AUTH_TYPES.contains(type)) {
      throw PlatformException.badRequest(
          "CONNECTION_AUTH_UNSUPPORTED",
          "当前支持 none / tenant / bearer / apiKey / basic / oauth2 / signature");
    }
    switch (type) {
      case "bearer" -> secretRef(auth, "tokenRef");
      case "apiKey" -> {
        if (auth.path("name").asText("").isBlank()) {
          throw PlatformException.badRequest("CONNECTION_AUTH_INVALID", "apiKey.name 不能为空");
        }
        String in = auth.path("in").asText("");
        if (!"header".equals(in) && !"query".equals(in)) {
          throw PlatformException.badRequest("CONNECTION_AUTH_INVALID", "apiKey.in 只能是 header 或 query");
        }
        if ("header".equals(in)) {
          headerName(auth.path("name").asText(""), "apiKey.name");
        } else {
          queryName(auth.path("name").asText(""), "apiKey.name");
        }
        secretRef(auth, "valueRef");
      }
      case "tenant" -> {
        String tenantHeader = auth.path("headerName").asText("X-Tenant-Id");
        headerName(tenantHeader, "tenant.headerName");
      }
      case "basic" -> {
        secretRef(auth, "usernameRef");
        secretRef(auth, "passwordRef");
      }
      case "oauth2" -> {
        String grant = auth.path("grant").asText("");
        if (!GRANTS.contains(grant)) {
          throw PlatformException.badRequest(
              "CONNECTION_AUTH_INVALID", "oauth2.grant 只能是 clientCredentials / authorizationCode / password");
        }
        String tokenUrl = trimToNull(auth.path("tokenUrl").asText(""));
        if (tokenUrl == null) {
          secretRef(auth, "tokenRef");
        } else {
          try {
            urls.validate(tokenUrl);
          } catch (OutboundUrlPolicy.PolicyViolation ex) {
            throw PlatformException.badRequest("CONNECTION_AUTH_INVALID",
                "oauth2.tokenUrl 非法：" + ex.getMessage());
          }
          if ("clientCredentials".equals(grant) || "authorizationCode".equals(grant)) {
            secretRef(auth, "clientIdRef");
            secretRef(auth, "clientSecretRef");
          }
          if ("password".equals(grant)) {
            secretRef(auth, "usernameRef");
            secretRef(auth, "passwordRef");
            secretRef(auth, "clientIdRef");
            secretRef(auth, "clientSecretRef");
          }
          if ("authorizationCode".equals(grant)) {
            secretRef(auth, "refreshTokenRef");
          }
        }
        JsonNode scopes = auth.get("scopes");
        if (scopes != null && (!scopes.isArray() || scopes.size() > 30)) {
          throw PlatformException.badRequest(
              "CONNECTION_AUTH_INVALID", "oauth2.scopes 必须是不超过 30 项的数组");
        }
        if (scopes != null) {
          for (JsonNode scope : scopes) {
            if (!scope.isTextual() || scope.asText().length() > 200) {
              throw PlatformException.badRequest(
                  "CONNECTION_AUTH_INVALID", "oauth2.scopes 每项必须是短文本");
            }
          }
        }
        JsonNode refresh = auth.get("refreshBeforeSec");
        if (refresh != null && (!refresh.isInt() || refresh.asInt() < 0 || refresh.asInt() > 3600)) {
          throw PlatformException.badRequest(
              "CONNECTION_AUTH_INVALID", "oauth2.refreshBeforeSec 需为 0-3600 的整数");
        }
      }
      case "signature" -> {
        String algorithm = auth.path("algorithm").asText("");
        if (!"hmacSha256".equals(algorithm) && !"md5".equals(algorithm)) {
          throw PlatformException.badRequest(
              "CONNECTION_AUTH_INVALID", "signature.algorithm 只能是 hmacSha256 或 md5");
        }
        secretRef(auth, "secretRef");
        String header = headerName(auth.path("headerName").asText("X-Signature"),
            "signature.headerName");
        String timestampHeader = auth.path("timestampHeader").asText("X-Timestamp");
        if (!timestampHeader.isBlank()) {
          headerName(timestampHeader, "signature.timestampHeader");
        }
        String template = auth.path("template").asText("{method}\n{path}\n{timestamp}");
        if (template.length() > 2048) {
          throw PlatformException.badRequest(
              "CONNECTION_AUTH_INVALID", "signature.template 不能超过 2048 字符");
        }
      }
      default -> {
      }
    }
  }

  private void secretRef(JsonNode auth, String field) {
    try {
      SecretRefs.key(auth.path(field).asText(null));
    } catch (IllegalArgumentException ex) {
      throw PlatformException.badRequest(
          "CONNECTION_AUTH_INVALID", field + " 必须是 secret:<key> 引用");
    }
  }

  private static String headerName(String value, String label) {
    String name = value == null ? "" : value.trim();
    if (name.isEmpty() || name.length() > 128 || !HEADER.matcher(name).matches()) {
      throw PlatformException.badRequest(
          "CONNECTION_AUTH_INVALID", label + " 不是合法的请求头名称");
    }
    return name;
  }

  private static String queryName(String value, String label) {
    String name = value == null ? "" : value.trim();
    if (name.isEmpty() || name.length() > 128 || !QUERY_NAME.matcher(name).matches()) {
      throw PlatformException.badRequest(
          "CONNECTION_AUTH_INVALID", label + " 不是合法的查询参数名称");
    }
    return name;
  }

  private static String requireKey(String value) {
    String key = trimToNull(value);
    if (key == null || !KEY.matcher(key).matches()) {
      throw PlatformException.badRequest(
          "CONNECTION_KEY_INVALID", "连接器 key 需为小写字母开头的 1-64 位小写字母、数字或下划线");
    }
    return key;
  }

  private static String required(String value, String label) {
    String text = trimToNull(value);
    if (text == null) {
      throw PlatformException.badRequest("FIELD_REQUIRED", label + "不能为空");
    }
    return text;
  }

  private static String kind(String value) {
    String kind = trimToNull(value);
    if (kind == null) {
      return "rest";
    }
    if (!KINDS.contains(kind)) {
      throw PlatformException.badRequest("CONNECTION_KIND_INVALID", "连接器类型非法：" + kind);
    }
    return kind;
  }

  private static String trimToNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private void audit(UUID id, String key, String action, ConnectionView before, ConnectionView after) {
    jdbc.update("""
        insert into lcp_connection_audit
          (id, tenant_id, connection_id, connection_key, action, actor, before_state, after_state)
        values
          (:id, :tenant, :connectionId, :key, :action, :user,
           cast(:before as jsonb), cast(:after as jsonb))
        """, params()
        .addValue("id", UUID.randomUUID())
        .addValue("connectionId", id)
        .addValue("key", key)
        .addValue("action", action)
        .addValue("before", snapshotJson(before), Types.OTHER)
        .addValue("after", snapshotJson(after), Types.OTHER));
  }

  private String snapshotJson(ConnectionView view) {
    JsonNode snapshot = snapshot(view);
    return snapshot == null ? null : snapshot.toString();
  }

  private JsonNode snapshot(ConnectionView view) {
    if (view == null) {
      return null;
    }
    ObjectNode out = json.createObjectNode();
    out.put("id", view.id());
    out.put("key", view.key());
    out.put("name", view.name());
    out.put("kind", view.kind());
    out.put("base_url", view.baseUrl());
    out.set("config", redactedConfig(view.config()));
    out.put("enabled", view.enabled());
    return out;
  }

  private JsonNode redactedConfig(JsonNode config) {
    if (config == null || !config.isObject()) {
      return json.createObjectNode();
    }
    ObjectNode copy = ((ObjectNode) config).deepCopy();
    JsonNode headers = copy.get("headers");
    if (headers instanceof ArrayNode list) {
      for (JsonNode item : list) {
        if (item instanceof ObjectNode header && !header.path("value").asText("").isBlank()) {
          header.put("value", "***");
        }
      }
    }
    return copy;
  }

  private JsonNode readJson(String raw) {
    if (!StringUtils.hasText(raw)) {
      return null;
    }
    try {
      return json.readTree(raw);
    } catch (Exception ex) {
      return json.getNodeFactory().textNode("<invalid json>");
    }
  }

  private ConnectionView view(ResultSet rs) throws SQLException {
    return row(rs).view();
  }

  private ConnectionRow row(ResultSet rs) throws SQLException {
    JsonNode config;
    try {
      config = json.readTree(rs.getString("config"));
    } catch (Exception ex) {
      throw new SQLException("连接器配置 JSON 损坏", ex);
    }
    return new ConnectionRow(
        rs.getObject("id", UUID.class), rs.getString("connection_key"), rs.getString("name"),
        rs.getString("kind"), rs.getString("base_url"), config,
        rs.getBoolean("enabled"), rs.getString("created_by"), rs.getString("updated_by"),
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class));
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (!StringUtils.hasText(tenant)) {
      throw new IllegalStateException("缺少租户上下文");
    }
    return tenant;
  }

  private static String user() {
    String user = TenantContext.userId();
    return StringUtils.hasText(user) ? user : "anonymous";
  }

  private static MapSqlParameterSource params() {
    return new MapSqlParameterSource("tenant", tenant()).addValue("user", user());
  }

  private record ConnectionRow(
      UUID id,
      String key,
      String name,
      String kind,
      String baseUrl,
      JsonNode config,
      boolean enabled,
      String createdBy,
      String updatedBy,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {

    ConnectionView view() {
      return new ConnectionView(
          id.toString(), key, name, kind, baseUrl, config, enabled, createdBy, updatedBy,
          createdAt, updatedAt);
    }

    RuntimeConnection runtime() {
      return new RuntimeConnection(id.toString(), key, name, kind, baseUrl, config, enabled);
    }
  }

  public record RuntimeConnection(
      String id,
      String key,
      String name,
      String kind,
      String baseUrl,
      JsonNode config,
      boolean enabled) {
  }
}
