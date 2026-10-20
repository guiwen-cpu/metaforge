package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** 复用租户连接器与密钥库的轻量 JSON 出站客户端，供通知投递使用。 */
@Service
public class OutboundHttpClient {

  private final ConnectionService connections;
  private final SecretService secrets;
  private final OutboundUrlPolicy urls;
  private final ObjectMapper json;
  private final HttpClient http;

  public OutboundHttpClient(
      ConnectionService connections,
      SecretService secrets,
      OutboundUrlPolicy urls,
      ObjectMapper json) {
    this.connections = connections;
    this.secrets = secrets;
    this.urls = urls;
    this.json = json;
    this.http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  public DeliveryResult postJson(String connectionRef, String path, JsonNode payload) {
    ConnectionService.RuntimeConnection connection = resolve(connectionRef);
    JsonNode config = connection.config();
    String baseUrl = connection.baseUrl();
    if (baseUrl == null || baseUrl.isBlank()) {
      throw new DeliveryException(0, "连接器 " + connection.key() + " 未配置 baseUrl", false);
    }
    URI uri = uri(baseUrl, path, config.path("auth"));
    try {
      urls.validate(uri);
    } catch (OutboundUrlPolicy.PolicyViolation ex) {
      throw new DeliveryException(0, "出站地址被拒绝：" + ex.getMessage(), false);
    }

    Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    for (JsonNode header : config.path("headers")) {
      String name = header.path("name").asText("");
      if (!name.isBlank()) {
        headers.put(name, header.path("value").asText(""));
      }
    }
    AuthResolution auth = auth(config.path("auth"));
    headers.putAll(auth.headers());
    headers.put("Content-Type", "application/json");
    headers.put("Accept", "application/json");

    long timeout = Math.max(1, Math.min(120_000, config.path("timeoutMs").asLong(10_000)));
    HttpRequest.Builder request = HttpRequest.newBuilder(uri)
        .timeout(Duration.ofMillis(timeout))
        .POST(HttpRequest.BodyPublishers.ofString(
            payload == null ? "{}" : payload.toString(), StandardCharsets.UTF_8));
    headers.forEach(request::setHeader);
    try {
      HttpResponse<String> response = http.send(
          request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      int status = response.statusCode();
      if (status >= 200 && status < 300) {
        return new DeliveryResult(status, response.body());
      }
      boolean retryable = status == 408 || status == 429 || status >= 500;
      throw new DeliveryException(status,
          "远端返回 HTTP " + status + "：" + abbreviate(response.body()), retryable);
    } catch (IOException ex) {
      throw new DeliveryException(0,
          "网络请求失败（" + ex.getClass().getSimpleName() + "）", true);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new DeliveryException(0, "投递被中断", true);
    }
  }

  private ConnectionService.RuntimeConnection resolve(String ref) {
    String value = ref == null ? "" : ref.trim();
    if (value.isBlank()) {
      throw new DeliveryException(0, "外部通知未配置 connectionRef", false);
    }
    ConnectionService.RuntimeConnection connection = connections.runtime(value);
    if (connection == null) {
      throw new DeliveryException(0, "连接器 " + value + " 不存在", false);
    }
    if (!connection.enabled()) {
      throw new DeliveryException(0, "连接器 " + value + " 已停用", false);
    }
    if (!"rest".equals(connection.kind())) {
      throw new DeliveryException(0,
          "连接器 " + value + " 的 kind=" + connection.kind() + " 不支持 HTTP 通知", false);
    }
    return connection;
  }

  private URI uri(String baseUrl, String path, JsonNode auth) {
    StringBuilder url = new StringBuilder(baseUrl.endsWith("/")
        ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
    String relative = path == null ? "" : path.trim();
    if (!relative.isEmpty()) {
      if (!relative.startsWith("/")) {
        url.append('/');
      }
      url.append(relative);
    }
    StringBuilder query = new StringBuilder();
    for (QueryParam param : query(auth)) {
      if (query.length() > 0) {
        query.append('&');
      }
      query.append(URLEncoder.encode(param.name(), StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(param.value(), StandardCharsets.UTF_8));
    }
    if (query.length() > 0) {
      url.append(url.indexOf("?") >= 0 ? '&' : '?').append(query);
    }
    try {
      return URI.create(url.toString());
    } catch (IllegalArgumentException ex) {
      throw new DeliveryException(0, "连接器地址非法", false);
    }
  }

  private AuthResolution auth(JsonNode auth) {
    Map<String, String> headers = new LinkedHashMap<>();
    List<QueryParam> query = new ArrayList<>();
    if (auth == null || auth.isMissingNode() || auth.isNull()) {
      return new AuthResolution(headers, query);
    }
    String type = auth.path("type").asText("none");
    switch (type) {
      case "", "none" -> {
      }
      case "tenant" -> {
        String tenant = TenantContext.tenantId();
        if (tenant == null || tenant.isBlank()) {
          throw new DeliveryException(0, "缺少租户上下文，无法注入租户头", false);
        }
        headers.put(auth.path("headerName").asText("X-Tenant-Id"), tenant);
      }
      case "bearer" -> headers.put("Authorization",
          "Bearer " + secret(auth.path("tokenRef").asText("")));
      case "apiKey" -> {
        String name = auth.path("name").asText("");
        String value = secret(auth.path("valueRef").asText(""));
        if (name.isBlank()) {
          throw new DeliveryException(0, "apiKey 鉴权缺少参数名", false);
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
        String encoded = Base64.getEncoder().encodeToString(
            (user + ":" + password).getBytes(StandardCharsets.UTF_8));
        headers.put("Authorization", "Basic " + encoded);
      }
      default -> throw new DeliveryException(0, "不支持的鉴权方式：" + type, false);
    }
    return new AuthResolution(headers, query);
  }

  private List<QueryParam> query(JsonNode auth) {
    return auth(auth).query();
  }

  private String secret(String ref) {
    if (ref == null || ref.isBlank()) {
      throw new DeliveryException(0, "连接器鉴权缺少密钥引用", false);
    }
    try {
      return secrets.value(ref);
    } catch (PlatformException ex) {
      throw new DeliveryException(0, "读取连接器密钥失败：" + ex.getMessage(), false);
    }
  }

  private static String abbreviate(String value) {
    if (value == null) {
      return "";
    }
    String compact = value.replaceAll("\\s+", " ").trim();
    return compact.length() <= 300 ? compact : compact.substring(0, 300) + "…";
  }

  public record DeliveryResult(int status, String body) {
  }

  private record QueryParam(String name, String value) {
  }

  private record AuthResolution(Map<String, String> headers, List<QueryParam> query) {
  }

  public static class DeliveryException extends RuntimeException {

    private final int status;
    private final boolean retryable;

    public DeliveryException(int status, String message, boolean retryable) {
      super(message);
      this.status = status;
      this.retryable = retryable;
    }

    public int status() {
      return status;
    }

    public boolean retryable() {
      return retryable;
    }
  }
}
