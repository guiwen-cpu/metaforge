package dev.lcp.bff.auth.sso;

/** SSO 提供方返回的规范化身份。 */
public record SsoIdentity(String subject, String username, String email, String displayName) {
}