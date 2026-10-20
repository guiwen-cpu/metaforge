package dev.lcp.bff.auth.sso;

import dev.lcp.bff.auth.AuthException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.StringJoiner;
import org.springframework.stereotype.Component;

/** SSO 出站请求。默认只允许 HTTPS，开发环境可显式放行 HTTP。 */
@Component
public class SsoHttp {

  private final SsoProperties properties;
  private final HttpClient client;

  public SsoHttp(SsoProperties properties) {
    this.properties = properties;
    this.client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  public String get(String url, String bearer) {
    HttpRequest.Builder request = request(url);
    if (bearer != null && !bearer.isBlank()) {
      request.header("Authorization", "Bearer " + bearer);
    }
    return send(request.GET().build());
  }

  public String postForm(String url, Map<String, String> form) {
    StringJoiner body = new StringJoiner("&");
    form.forEach((key, value) -> body.add(encode(key) + "=" + encode(value)));
    HttpRequest request = request(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
        .build();
    return send(request);
  }

  private HttpRequest.Builder request(String url) {
    URI uri = uri(url);
    String scheme = uri.getScheme();
    if (!"https".equalsIgnoreCase(scheme)
        && !(properties.allowInsecureHttp() && "http".equalsIgnoreCase(scheme))) {
      throw AuthException.badRequest("sso_insecure_url", "SSO 地址必须使用 HTTPS");
    }
    return HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10));
  }

  private String send(HttpRequest request) {
    try {
      HttpResponse<String> response = client.send(
          request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw AuthException.badRequest("sso_http_error",
            "SSO 提供方返回 HTTP " + response.statusCode());
      }
      return response.body();
    } catch (AuthException ex) {
      throw ex;
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw AuthException.badRequest("sso_unavailable", "SSO 请求被中断");
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_unavailable", "无法连接 SSO 提供方");
    }
  }

  private static URI uri(String url) {
    try {
      return URI.create(url);
    } catch (IllegalArgumentException ex) {
      throw AuthException.badRequest("sso_invalid_url", "SSO 地址格式不正确");
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }
}
