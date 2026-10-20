package dev.lcp.bff.auth.sso;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** SSO 配置。OIDC 与 CAS 共用租户、账号映射与前端回调配置。 */
@ConfigurationProperties(prefix = "lcp.sso")
public record SsoProperties(
    boolean enabled,
    String mode,
    String provider,
    String displayName,
    String tenant,
    String clientId,
    String clientSecret,
    String authorizeUrl,
    String tokenUrl,
    String userinfoUrl,
    String jwksUrl,
    String issuer,
    String scopes,
    String subjectClaim,
    String usernameClaim,
    String emailClaim,
    String nameClaim,
    String redirectUri,
    String frontendBaseUrl,
    String frontendCallback,
    String casServerUrl,
    String casValidatePath,
    boolean casAttributes,
    boolean allowInsecureHttp,
    String linkBy,
    boolean autoCreate,
    int stateTtlMinutes,
    int ticketTtlSeconds) {

  public SsoProperties {
    mode = text(mode, "oidc").toLowerCase();
    provider = text(provider, "sso");
    displayName = text(displayName, "统一身份登录");
    clientId = text(clientId, "");
    clientSecret = text(clientSecret, "");
    authorizeUrl = text(authorizeUrl, "");
    tokenUrl = text(tokenUrl, "");
    userinfoUrl = text(userinfoUrl, "");
    jwksUrl = text(jwksUrl, "");
    issuer = text(issuer, "");
    scopes = text(scopes, "openid profile email");
    subjectClaim = text(subjectClaim, "sub");
    usernameClaim = text(usernameClaim, "preferred_username");
    emailClaim = text(emailClaim, "email");
    nameClaim = text(nameClaim, "name");
    redirectUri = text(redirectUri, "");
    frontendBaseUrl = text(frontendBaseUrl, "");
    frontendCallback = text(frontendCallback, "/sso/callback");
    casServerUrl = text(casServerUrl, "");
    casValidatePath = text(casValidatePath, "/p3/serviceValidate");
    linkBy = text(linkBy, "username").toLowerCase();
    stateTtlMinutes = stateTtlMinutes <= 0 ? 10 : stateTtlMinutes;
    ticketTtlSeconds = ticketTtlSeconds <= 0 ? 60 : ticketTtlSeconds;
  }

  public boolean oidc() {
    return "oidc".equals(mode);
  }

  public boolean cas() {
    return "cas".equals(mode);
  }

  private static String text(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value.trim();
  }
}
