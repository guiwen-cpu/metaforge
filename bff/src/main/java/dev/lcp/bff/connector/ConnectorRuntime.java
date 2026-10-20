package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/**
 * 连接器运行时：统一处理 HTTP 类鉴权、GraphQL/SOAP 传输与只读数据库查询。
 * 非 REST 连接器的参数求值仍留在动作执行器，本类只接收已经计算好的请求。
 */
@Service
public class ConnectorRuntime {

  private static final Pattern UNSAFE_SQL = Pattern.compile(
      "(?is)\\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|call|do|"
          + "copy|vacuum|analyze|set|reset|show|listen|notify|execute|prepare|deallocate|lock)\\b");
  private static final Pattern LEADING_SELECT = Pattern.compile("(?is)^\\s*(select|with)\\b");
  private static final int MAX_DB_ROWS = 5000;
  private static final long MAX_TOKEN_CACHE_SECONDS = 86_400;

  private final SecretService secrets;
  private final PinnedHttpTransport http;
  private final OutboundUrlPolicy urls;
  private final ObjectMapper json;
  private final ConcurrentHashMap<String, CachedToken> tokens = new ConcurrentHashMap<>();

  public ConnectorRuntime(
      SecretService secrets, PinnedHttpTransport http, OutboundUrlPolicy urls, ObjectMapper json) {
    this.secrets = secrets;
    this.http = http;
    this.urls = urls;
    this.json = json;
  }

  public AuthResult auth(JsonNode auth, String apiKey) {
    Map<String, String> headers = new LinkedHashMap<>();
    List<QueryParam> query = new ArrayList<>();
    if (auth == null || auth.isMissingNode() || auth.isNull()) {
      return new AuthResult(headers, query);
    }
    String type = auth.path("type").asText("none");
    switch (type) {
      case "", "none" -> {
      }
      case "tenant" -> {
        String tenant = TenantContext.tenantId();
        if (tenant == null || tenant.isBlank()) {
          throw new AuthFailure("缺少租户上下文，无法注入租户头");
        }
        headers.put(auth.path("headerName").asText("X-Tenant-Id"), tenant);
      }
      case "bearer" -> headers.put("Authorization",
          "Bearer " + secret(auth.path("tokenRef").asText("")));
      case "apiKey" -> {
        String name = auth.path("name").asText("");
        String value = secret(auth.path("valueRef").asText(""));
        if (name.isBlank()) {
          throw new AuthFailure("apiKey 鉴权缺少参数名");
        }
        if ("query".equals(auth.path("in").asText("header"))) {
          query.add(new QueryParam(name, value));
        } else {
          headers.put(name, value);
        }
      }
      case "basic" -> {
        String user = secret(auth.path("usernameRef").asText(""));
        String password = secret(auth.path("passwordRef").asText(""));
        headers.put("Authorization", "Basic " + base64(user + ":" + password));
      }
      case "oauth2" -> headers.put("Authorization", "Bearer " + oauthToken(auth));
      case "signature" -> {
        // 签名依赖最终 path 与 body，由 sign() 在请求构造完成后注入。
      }
      default -> throw new AuthFailure("不支持的鉴权方式：" + type);
    }
    return new AuthResult(headers, query);
  }

  public void sign(
      JsonNode auth,
      String method,
      String path,
      String query,
      String body,
      Map<String, String> headers) {
    if (auth == null || !"signature".equals(auth.path("type").asText(""))) {
      return;
    }
    String timestamp = String.valueOf("millis".equals(auth.path("timestampUnit").asText("seconds"))
        ? Instant.now().toEpochMilli() : Instant.now().getEpochSecond());
    String template = auth.path("template").asText("{method}\n{path}\n{timestamp}");
    String payload = template
        .replace("{method}", method == null ? "" : method)
        .replace("{path}", path == null ? "" : path)
        .replace("{query}", query == null ? "" : query)
        .replace("{body}", body == null ? "" : body)
        .replace("{timestamp}", timestamp)
        .replace("{tenant}", TenantContext.tenantId() == null ? "" : TenantContext.tenantId());
    String key = secret(auth.path("secretRef").asText(""));
    String algorithm = auth.path("algorithm").asText("hmacSha256");
    byte[] digest;
    try {
      if ("md5".equals(algorithm)) {
        digest = MessageDigest.getInstance("MD5").digest(payload.getBytes(StandardCharsets.UTF_8));
      } else {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      }
    } catch (Exception ex) {
      throw new AuthFailure("签名计算失败：" + ex.getMessage());
    }
    String signature = "base64".equals(auth.path("encoding").asText("hex"))
        ? Base64.getEncoder().encodeToString(digest) : hex(digest);
    headers.put(auth.path("headerName").asText("X-Signature"), signature);
    String timestampHeader = auth.path("timestampHeader").asText("X-Timestamp");
    if (!timestampHeader.isBlank()) {
      headers.put(timestampHeader, timestamp);
    }
  }

  public PinnedHttpTransport.Response send(
      URI uri, String method, Map<String, String> headers, String body, long timeoutMs)
      throws IOException {
    return http.send(uri, method, headers,
        body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8),
        Duration.ofSeconds(5), Duration.ofMillis(Math.max(1, timeoutMs)));
  }

  public JsonNode queryDatabase(
      ConnectionService.RuntimeConnection connection, JsonNode request, String apiKey) {
    JsonNode config = connection.config();
    String query = request.path("query").asText("").trim();
    validateReadOnlySql(query, apiKey);
    JsonNode params = request.path("params");
    int maxRows = Math.max(1, Math.min(MAX_DB_ROWS,
        config.path("maxRows").asInt(MAX_DB_ROWS)));
    int timeout = Math.max(1, Math.min(60, config.path("queryTimeoutSec").asInt(15)));

    Properties properties = new Properties();
    properties.setProperty("user", secret(config.path("usernameRef").asText("")));
    properties.setProperty("password", secret(config.path("passwordRef").asText("")));
    properties.setProperty("socketFactory", PinnedSocketFactory.class.getName());
    OutboundUrlPolicy.PinnedTarget target = urls.resolveJdbc(config.path("jdbcUrl").asText(""));
    PinnedSocketFactory.pin(target.host(), target);
    try (Connection db = DriverManager.getConnection(config.path("jdbcUrl").asText(""), properties)) {
      db.setReadOnly(true);
      db.setAutoCommit(false);
      try (PreparedStatement statement = db.prepareStatement(query)) {
        statement.setQueryTimeout(timeout);
        statement.setMaxRows(maxRows);
        bind(statement, params);
        ArrayNode rows = json.createArrayNode();
        try (ResultSet result = statement.executeQuery()) {
          ResultSetMetaData meta = result.getMetaData();
          int count = meta.getColumnCount();
          while (result.next()) {
            ObjectNode row = json.createObjectNode();
            for (int i = 1; i <= count; i++) {
              row.set(meta.getColumnLabel(i), value(result, i));
            }
            rows.add(row);
          }
        }
        db.commit();
        ObjectNode out = json.createObjectNode();
        out.put("code", 0);
        ObjectNode data = out.putObject("data");
        data.set("rows", rows);
        data.put("rowCount", rows.size());
        return out;
      } catch (SQLException ex) {
        db.rollback();
        throw ex;
      }
    } catch (SQLException ex) {
      throw new DatabaseFailure("数据库查询失败：" + ex.getMessage());
    } finally {
      PinnedSocketFactory.clear();
    }
  }

  private void validateReadOnlySql(String query, String apiKey) {
    if (query.isBlank() || !LEADING_SELECT.matcher(query).find()) {
      throw new DatabaseFailure("API " + apiKey + " 只允许 SELECT / WITH 查询");
    }
    String withoutTrailing = query.strip();
    if (withoutTrailing.endsWith(";")) {
      withoutTrailing = withoutTrailing.substring(0, withoutTrailing.length() - 1);
    }
    if (withoutTrailing.indexOf(';') >= 0) {
      throw new DatabaseFailure("API " + apiKey + " 不允许一次执行多条 SQL");
    }
    String scrubbed = stripSqlLiterals(withoutTrailing);
    if (UNSAFE_SQL.matcher(scrubbed).find()) {
      throw new DatabaseFailure("API " + apiKey + " 的 SQL 含写操作关键字，已拒绝");
    }
  }

  private static String stripSqlLiterals(String sql) {
    StringBuilder out = new StringBuilder(sql.length());
    boolean single = false;
    boolean lineComment = false;
    boolean blockComment = false;
    for (int i = 0; i < sql.length(); i++) {
      char c = sql.charAt(i);
      char next = i + 1 < sql.length() ? sql.charAt(i + 1) : 0;
      if (lineComment) {
        if (c == '\n') {
          lineComment = false;
          out.append(' ');
        }
        continue;
      }
      if (blockComment) {
        if (c == '*' && next == '/') {
          blockComment = false;
          i++;
        }
        continue;
      }
      if (!single && c == '-' && next == '-') {
        lineComment = true;
        i++;
        continue;
      }
      if (!single && c == '/' && next == '*') {
        blockComment = true;
        i++;
        continue;
      }
      if (c == '\'') {
        single = !single;
        out.append(' ');
        continue;
      }
      out.append(single ? ' ' : c);
    }
    return out.toString();
  }

  private void bind(PreparedStatement statement, JsonNode params) throws SQLException {
    if (params == null || !params.isArray()) {
      return;
    }
    for (int i = 0; i < params.size(); i++) {
      JsonNode value = params.get(i);
      if (value == null || value.isNull()) {
        statement.setObject(i + 1, null);
      } else if (value.isInt() || value.isLong()) {
        statement.setLong(i + 1, value.asLong());
      } else if (value.isNumber()) {
        statement.setBigDecimal(i + 1, value.decimalValue());
      } else if (value.isBoolean()) {
        statement.setBoolean(i + 1, value.asBoolean());
      } else if (value.isTextual()) {
        statement.setString(i + 1, value.asText());
      } else {
        statement.setString(i + 1, value.toString());
      }
    }
  }

  private JsonNode value(ResultSet result, int index) throws SQLException {
    Object value = result.getObject(index);
    if (value == null) {
      return json.nullNode();
    }
    if (value instanceof Number number) {
      return json.getNodeFactory().numberNode(new java.math.BigDecimal(number.toString()));
    }
    if (value instanceof Boolean bool) {
      return json.getNodeFactory().booleanNode(bool);
    }
    return json.getNodeFactory().textNode(String.valueOf(value));
  }

  private String oauthToken(JsonNode auth) {
    String tokenUrl = auth.path("tokenUrl").asText("").trim();
    if (tokenUrl.isBlank()) {
      return secret(auth.path("tokenRef").asText(""));
    }
    String grant = auth.path("grant").asText("");
    String clientId = secret(auth.path("clientIdRef").asText(""));
    String scopes = scopes(auth);
    String cacheKey = String.join("|", TenantContext.tenantId() == null ? "" : TenantContext.tenantId(),
        tokenUrl, grant, clientId, scopes);
    CachedToken cached = tokens.get(cacheKey);
    if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return cached.token();
    }
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", switch (grant) {
      case "password" -> "password";
      case "authorizationCode" -> "refresh_token";
      default -> "client_credentials";
    });
    if (!scopes.isBlank()) {
      form.put("scope", scopes);
    }
    if ("password".equals(grant)) {
      form.put("username", secret(auth.path("usernameRef").asText("")));
      form.put("password", secret(auth.path("passwordRef").asText("")));
    }
    if ("authorizationCode".equals(grant)) {
      form.put("refresh_token", secret(auth.path("refreshTokenRef").asText("")));
    }
    Map<String, String> headers = new LinkedHashMap<>();
    headers.put("Content-Type", "application/x-www-form-urlencoded");
    headers.put("Accept", "application/json");
    String clientSecret = secret(auth.path("clientSecretRef").asText(""));
    if ("post".equals(auth.path("clientAuth").asText("basic"))) {
      form.put("client_id", clientId);
      form.put("client_secret", clientSecret);
    } else {
      headers.put("Authorization", "Basic " + base64(clientId + ":" + clientSecret));
    }
    String body = form.entrySet().stream()
        .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
        .reduce((a, b) -> a + "&" + b).orElse("");
    try {
      PinnedHttpTransport.Response response = http.send(
          URI.create(tokenUrl), "POST", headers, body.getBytes(StandardCharsets.UTF_8),
          Duration.ofSeconds(5), Duration.ofSeconds(15));
      JsonNode payload = json.readTree(response.body());
      String accessToken = payload.path("access_token").asText("");
      if (response.status() < 200 || response.status() >= 300 || accessToken.isBlank()) {
        throw new AuthFailure("OAuth2 令牌端点返回失败（HTTP " + response.status() + "）");
      }
      long expiresIn = payload.path("expires_in").asLong(3600);
      long refreshBefore = Math.max(0, auth.path("refreshBeforeSec").asLong(60));
      long ttl = Math.max(1, Math.min(MAX_TOKEN_CACHE_SECONDS, expiresIn - refreshBefore));
      tokens.put(cacheKey, new CachedToken(accessToken, Instant.now().plusSeconds(ttl)));
      return accessToken;
    } catch (IOException | IllegalArgumentException ex) {
      throw new AuthFailure("OAuth2 令牌请求失败：" + ex.getMessage());
    }
  }

  private static String scopes(JsonNode auth) {
    JsonNode scopes = auth.path("scopes");
    if (!scopes.isArray()) {
      return "";
    }
    List<String> values = new ArrayList<>();
    scopes.forEach(scope -> values.add(scope.asText()));
    return String.join(" ", values);
  }

  private String secret(String ref) {
    if (ref == null || ref.isBlank()) {
      throw new AuthFailure("缺少密钥引用");
    }
    try {
      return secrets.value(ref);
    } catch (PlatformException ex) {
      throw new AuthFailure("读取密钥失败：" + ex.getMessage());
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }

  private static String base64(String value) {
    return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private static String hex(byte[] bytes) {
    StringBuilder out = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) {
      out.append(String.format(Locale.ROOT, "%02x", value));
    }
    return out.toString();
  }

  public record AuthResult(Map<String, String> headers, List<QueryParam> query) {
  }

  public record QueryParam(String name, String value) {
  }

  private record CachedToken(String token, Instant expiresAt) {
  }

  public static class AuthFailure extends RuntimeException {

    public AuthFailure(String message) {
      super(message);
    }
  }

  public static class DatabaseFailure extends RuntimeException {

    public DatabaseFailure(String message) {
      super(message);
    }
  }
}
