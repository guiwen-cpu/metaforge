package dev.lcp.bff.auth.wechat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.auth.AuthException;
import dev.lcp.bff.auth.AuthService;
import dev.lcp.bff.auth.AuthService.ExternalIdentity;
import dev.lcp.bff.auth.AuthService.LoginResult;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.stereotype.Service;

/** 微信小程序 code2Session 登录，复用外部身份绑定与账号映射。 */
@Service
public class WechatService {

  public record ConfigView(boolean enabled, String appId, String tenant, String displayName) {
  }

  private final WechatProperties properties;
  private final AuthService auth;
  private final ObjectMapper objectMapper;
  private final HttpClient client;

  public WechatService(
      WechatProperties properties, AuthService auth, ObjectMapper objectMapper) {
    this.properties = properties;
    this.auth = auth;
    this.objectMapper = objectMapper;
    this.client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  public ConfigView config() {
    return new ConfigView(
        properties.enabled(), properties.appId(), properties.tenant(), properties.displayName());
  }

  public LoginResult login(
      String code, String requestedTenant, String ip, String userAgent) {
    requireReady();
    String jsCode = trimToNull(code);
    if (jsCode == null) {
      throw AuthException.badRequest("wechat_code_missing", "微信登录缺少 code");
    }
    String tenant = resolveTenant(requestedTenant);
    WechatIdentity identity = exchange(jsCode);
    return auth.loginExternal(
        new ExternalIdentity(
            tenant, "wechat_miniapp", identity.subject(), null, null,
            "微信用户", properties.linkBy(), properties.autoCreate()),
        "wechat_miniapp", ip, userAgent);
  }

  private WechatIdentity exchange(String code) {
    String url = properties.apiBase() + "/sns/jscode2session"
        + "?appid=" + encode(properties.appId())
        + "&secret=" + encode(properties.appSecret())
        + "&js_code=" + encode(code)
        + "&grant_type=authorization_code";
    URI uri = uri(url);
    String scheme = uri.getScheme();
    if (!"https".equalsIgnoreCase(scheme)
        && !(properties.allowInsecureHttp() && "http".equalsIgnoreCase(scheme))) {
      throw AuthException.badRequest("wechat_insecure_url", "微信接口地址必须使用 HTTPS");
    }
    HttpRequest request = HttpRequest.newBuilder(uri)
        .timeout(Duration.ofSeconds(8))
        .GET()
        .build();
    JsonNode body;
    try {
      HttpResponse<String> response = client.send(
          request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw AuthException.badRequest(
            "wechat_unavailable", "微信接口返回 HTTP " + response.statusCode());
      }
      body = objectMapper.readTree(response.body());
    } catch (AuthException ex) {
      throw ex;
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw AuthException.badRequest("wechat_unavailable", "微信登录请求被中断");
    } catch (Exception ex) {
      throw AuthException.badRequest("wechat_unavailable", "无法连接微信登录服务");
    }
    int errorCode = body.path("errcode").asInt(0);
    if (errorCode != 0) {
      throw AuthException.badRequest(
          "wechat_code_invalid", "微信登录凭证无效（" + errorCode + "），请重新进入小程序");
    }
    String openId = trimToNull(body.path("openid").asText(null));
    String unionId = trimToNull(body.path("unionid").asText(null));
    if (openId == null) {
      throw AuthException.badRequest("wechat_identity_invalid", "微信未返回 openid");
    }
    return new WechatIdentity(unionId == null ? openId : unionId);
  }

  private String resolveTenant(String requestedTenant) {
    String configured = trimToNull(properties.tenant());
    String requested = trimToNull(requestedTenant);
    if (configured != null && requested != null && !configured.equals(requested)) {
      throw AuthException.forbidden("该微信小程序未配置此租户");
    }
    String tenant = configured == null ? requested : configured;
    if (tenant == null) {
      throw AuthException.badRequest("wechat_tenant_required", "微信登录缺少租户配置");
    }
    return tenant;
  }

  private void requireReady() {
    if (!properties.enabled()) {
      throw AuthException.badRequest("wechat_disabled", "微信登录未启用");
    }
    if (properties.appId().isBlank() || properties.appSecret().isBlank()) {
      throw AuthException.badRequest("wechat_misconfigured", "微信登录缺少 AppID 或 AppSecret");
    }
  }

  private static URI uri(String url) {
    try {
      return URI.create(url);
    } catch (IllegalArgumentException ex) {
      throw AuthException.badRequest("wechat_invalid_url", "微信接口地址格式不正确");
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private record WechatIdentity(String subject) {
  }
}