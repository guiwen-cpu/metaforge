package dev.lcp.bff.auth.sso;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.auth.AuthException;
import dev.lcp.bff.auth.AuthService;
import dev.lcp.bff.auth.AuthService.ExternalIdentity;
import dev.lcp.bff.auth.AuthService.LoginResult;
import dev.lcp.bff.identity.IdentityViews.UserView;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.StringJoiner;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/** SSO 编排：state/PKCE、提供方回调、一次性 ticket 换本地 JWT。 */
@Service
public class SsoService {

  private static final String STATE_PREFIX = "lcp:sso:state:";
  private static final String TICKET_PREFIX = "lcp:sso:ticket:";
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

  private final SsoProperties properties;
  private final StringRedisTemplate redis;
  private final ObjectMapper json;
  private final OidcClient oidc;
  private final CasClient cas;
  private final AuthService auth;

  public SsoService(
      SsoProperties properties,
      StringRedisTemplate redis,
      ObjectMapper json,
      OidcClient oidc,
      CasClient cas,
      AuthService auth) {
    this.properties = properties;
    this.redis = redis;
    this.json = json;
    this.oidc = oidc;
    this.cas = cas;
    this.auth = auth;
  }

  public record ConfigView(
      boolean enabled,
      String mode,
      String provider,
      String displayName,
      String startUrl) {
  }

  public record CallbackResult(String ticket, String redirect) {
  }

  public record ExchangeResult(
      String token,
      Instant expiresAt,
      String tenant,
      UserView user,
      String redirect) {
  }

  private record State(
      String mode,
      String redirect,
      String nonce,
      String codeVerifier,
      String redirectUri,
      long createdAt) {
  }

  private record Ticket(
      String tenant,
      String token,
      Instant expiresAt,
      UserView user,
      String redirect) {
  }

  public ConfigView config() {
    return new ConfigView(properties.enabled(), properties.mode(), properties.provider(),
        properties.displayName(), "/api/v1/auth/sso/start");
  }

  public String start(String redirect, HttpServletRequest request) {
    requireEnabled();
    String target = safeRedirect(redirect);
    String redirectUri = redirectUri(request);
    String state = random(24);
    if (properties.oidc()) {
      requireText(properties.authorizeUrl(), "OIDC authorize 端点未配置");
      requireText(properties.tokenUrl(), "OIDC token 端点未配置");
      requireText(properties.clientId(), "OIDC client_id 未配置");
      String nonce = random(18);
      String verifier = random(32);
      saveState(state, new State("oidc", target, nonce, verifier, redirectUri,
          Instant.now().getEpochSecond()));
      Map<String, String> params = new LinkedHashMap<>();
      params.put("response_type", "code");
      params.put("client_id", properties.clientId());
      params.put("redirect_uri", redirectUri);
      params.put("scope", properties.scopes());
      params.put("state", state);
      params.put("nonce", nonce);
      params.put("code_challenge", challenge(verifier));
      params.put("code_challenge_method", "S256");
      return append(properties.authorizeUrl(), params);
    }
    if (properties.cas()) {
      requireText(properties.casServerUrl(), "CAS 服务地址未配置");
      saveState(state, new State("cas", target, null, null, redirectUri,
          Instant.now().getEpochSecond()));
      String service = casService(redirectUri, state);
      return properties.casServerUrl().replaceAll("/+$", "")
          + "/login?service=" + encode(service);
    }
    throw AuthException.badRequest("sso_misconfigured", "不支持的 SSO 模式 " + properties.mode());
  }

  public CallbackResult callback(
      String code, String ticket, String state, String ip, String userAgent) {
    requireEnabled();
    State saved = takeState(state);
    if (saved == null) {
      throw AuthException.badRequest("sso_state_invalid", "SSO 登录状态已过期，请重新登录");
    }
    SsoIdentity external;
    if ("oidc".equals(saved.mode())) {
      if (code == null || code.isBlank()) {
        throw AuthException.badRequest("sso_code_missing", "OIDC 回调缺少 code");
      }
      external = oidc.exchange(code, saved.redirectUri(), saved.nonce(), saved.codeVerifier());
    } else if ("cas".equals(saved.mode())) {
      if (ticket == null || ticket.isBlank()) {
        throw AuthException.badRequest("sso_ticket_missing", "CAS 回调缺少 ticket");
      }
      external = cas.validate(casService(saved.redirectUri(), state), ticket);
    } else {
      throw AuthException.badRequest("sso_state_invalid", "SSO 登录状态无效");
    }
    LoginResult login = auth.loginExternal(
        new ExternalIdentity(properties.tenant(), properties.provider(), external.subject(),
            external.username(), external.email(), external.displayName(),
            properties.linkBy(), properties.autoCreate()),
        "sso_" + saved.mode(), ip, userAgent);
    String oneTime = random(24);
    saveTicket(oneTime, new Ticket(
        properties.tenant(), login.token(), login.expiresAt(), login.user(), saved.redirect()));
    return new CallbackResult(oneTime, saved.redirect());
  }

  public ExchangeResult exchange(String ticket) {
    requireEnabled();
    Ticket saved = takeTicket(ticket);
    if (saved == null) {
      throw AuthException.badRequest("sso_ticket_invalid", "SSO 登录凭证已过期或已使用");
    }
    return new ExchangeResult(saved.token(), saved.expiresAt(), saved.tenant(),
        saved.user(), saved.redirect());
  }

  public String redirectUri(HttpServletRequest request) {
    if (!properties.redirectUri().isBlank()) {
      return properties.redirectUri();
    }
    String scheme = first(request.getHeader("X-Forwarded-Proto"), request.getScheme());
    String host = first(request.getHeader("X-Forwarded-Host"), request.getHeader("Host"));
    if (host == null || host.isBlank()) {
      throw AuthException.badRequest("sso_misconfigured", "无法推导 SSO 回调地址");
    }
    return scheme + "://" + host + "/api/v1/auth/sso/callback";
  }

  public String frontendBase(HttpServletRequest request) {
    if (!properties.frontendBaseUrl().isBlank()) {
      return properties.frontendBaseUrl().replaceAll("/+$", "");
    }
    URI uri = URI.create(redirectUri(request));
    return uri.getScheme() + "://" + uri.getAuthority();
  }

  public String frontendCallback() {
    String path = properties.frontendCallback();
    return path.startsWith("/") ? path : "/" + path;
  }

  private void requireEnabled() {
    if (!properties.enabled()) {
      throw AuthException.badRequest("sso_disabled", "统一身份登录未启用");
    }
    requireText(properties.tenant(), "SSO 租户未配置");
  }

  private void requireText(String value, String message) {
    if (value == null || value.isBlank()) {
      throw AuthException.badRequest("sso_misconfigured", message);
    }
  }

  private void saveState(String state, State payload) {
    try {
      redis.opsForValue().set(STATE_PREFIX + state, json.writeValueAsString(payload),
          Duration.ofMinutes(properties.stateTtlMinutes()));
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_unavailable", "SSO 状态存储不可用");
    }
  }

  private State takeState(String state) {
    if (state == null || state.isBlank()) {
      return null;
    }
    try {
      String value = redis.opsForValue().getAndDelete(STATE_PREFIX + state);
      return value == null ? null : json.readValue(value, State.class);
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_unavailable", "SSO 状态存储不可用");
    }
  }

  private void saveTicket(String ticket, Ticket payload) {
    try {
      redis.opsForValue().set(TICKET_PREFIX + ticket, json.writeValueAsString(payload),
          Duration.ofSeconds(properties.ticketTtlSeconds()));
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_unavailable", "SSO 登录凭证存储不可用");
    }
  }

  private Ticket takeTicket(String ticket) {
    if (ticket == null || ticket.isBlank()) {
      return null;
    }
    try {
      String value = redis.opsForValue().getAndDelete(TICKET_PREFIX + ticket);
      return value == null ? null : json.readValue(value, Ticket.class);
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_unavailable", "SSO 登录凭证存储不可用");
    }
  }

  private static String casService(String redirectUri, String state) {
    return redirectUri + (redirectUri.contains("?") ? "&" : "?") + "state=" + encode(state);
  }

  private static String safeRedirect(String redirect) {
    if (redirect == null || redirect.isBlank()) {
      return "/";
    }
    String value = redirect.trim();
    if (value.length() > 2048 || !value.startsWith("/") || value.startsWith("//")
        || value.contains("\\")) {
      return "/";
    }
    return value;
  }

  private static String append(String url, Map<String, String> params) {
    StringJoiner query = new StringJoiner("&");
    params.forEach((key, value) -> query.add(encode(key) + "=" + encode(value)));
    return url + (url.contains("?") ? "&" : "?") + query;
  }

  private static String challenge(String verifier) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256")
          .digest(verifier.getBytes(StandardCharsets.US_ASCII));
      return ENCODER.encodeToString(digest);
    } catch (Exception ex) {
      throw new IllegalStateException("PKCE 计算失败", ex);
    }
  }

  private static String random(int bytes) {
    byte[] value = new byte[bytes];
    RANDOM.nextBytes(value);
    return ENCODER.encodeToString(value);
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }

  private static String first(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.split(",", 2)[0].trim();
  }
}