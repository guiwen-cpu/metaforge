package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.connector.ConnectorDtos.ConnectionView;
import dev.lcp.bff.connector.ConnectorDtos.CreateConnectionRequest;
import dev.lcp.bff.connector.ConnectorDtos.UpdateConnectionRequest;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
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
  private static final Set<String> AUTH_TYPES = Set.of("none", "tenant", "bearer", "apiKey", "basic");
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

  public ConnectionView create(CreateConnectionRequest request) {
    identity.requireAdmin();
    String key = requireKey(request.key());
    String name = required(request.name(), "连接器名称");
    String kind = kind(request.kind());
    String baseUrl = validateBaseUrl(request.baseUrl());
    JsonNode config = normalizeConfig(request.config());
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
    return get(id);
  }

  public ConnectionView patch(UUID id, UpdateConnectionRequest request) {
    identity.requireAdmin();
    ConnectionRow current = row(id);
    String name = request.name() == null ? current.name() : required(request.name(), "连接器名称");
    String baseUrl = request.baseUrl() == null
        ? current.baseUrl() : validateBaseUrl(request.baseUrl());
    JsonNode config = request.config() == null
        ? current.config() : normalizeConfig(request.config());
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
    return get(id);
  }

  public void delete(UUID id) {
    identity.requireAdmin();
    int changed = jdbc.update(
        "delete from lcp_connection where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
    if (changed == 0) {
      throw PlatformException.notFound("连接器 " + id + " 不存在");
    }
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

  private String validateBaseUrl(String raw) {
    String value = trimToNull(raw);
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

  private JsonNode normalizeConfig(JsonNode config) {
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
      if (!field.startsWith("x-")
          && !"timeoutMs".equals(field) && !"headers".equals(field) && !"auth".equals(field)) {
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
      validateAuth(auth);
    }
    return out;
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
          "CONNECTION_AUTH_UNSUPPORTED", "当前仅支持 none / tenant / bearer / apiKey / basic");
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
