package dev.lcp.bff.auth.sso;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.auth.AuthException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/** OIDC 授权码换取身份：校验 ID Token 签名/声明，并可用 userinfo 补齐资料。 */
@Component
public class OidcClient {

  private static final long JWKS_TTL_SECONDS = 600;
  private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

  private final SsoProperties properties;
  private final SsoHttp http;
  private final ObjectMapper json;
  private volatile JwksCache jwksCache;

  public OidcClient(SsoProperties properties, SsoHttp http, ObjectMapper json) {
    this.properties = properties;
    this.http = http;
    this.json = json;
  }

  public SsoIdentity exchange(String code, String redirectUri, String nonce, String verifier) {
    if (properties.tokenUrl().isBlank()) {
      throw AuthException.badRequest("sso_misconfigured", "OIDC token 端点未配置");
    }
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "authorization_code");
    form.put("code", code == null ? "" : code);
    form.put("redirect_uri", redirectUri);
    form.put("client_id", properties.clientId());
    if (!properties.clientSecret().isBlank()) {
      form.put("client_secret", properties.clientSecret());
    }
    if (verifier != null && !verifier.isBlank()) {
      form.put("code_verifier", verifier);
    }
    JsonNode token = read(http.postForm(properties.tokenUrl(), form), "sso_token_invalid");
    String accessToken = token.path("access_token").asText("");
    String idToken = token.path("id_token").asText("");

    JsonNode claims = null;
    if (!idToken.isBlank()) {
      claims = verifyIdToken(idToken, nonce);
    }
    JsonNode userinfo = null;
    if (!properties.userinfoUrl().isBlank() && !accessToken.isBlank()) {
      userinfo = read(http.get(properties.userinfoUrl(), accessToken), "sso_userinfo_invalid");
    }
    if (claims == null && userinfo == null) {
      throw AuthException.badRequest("sso_token_invalid", "OIDC 未返回可用的身份信息");
    }
    if (claims != null && userinfo != null) {
      String tokenSubject = text(claims, "sub");
      String userinfoSubject = text(userinfo, "sub");
      if (tokenSubject != null && userinfoSubject != null && !tokenSubject.equals(userinfoSubject)) {
        throw AuthException.badRequest("sso_token_invalid", "ID Token 与 userinfo 的用户不一致");
      }
    }

    JsonNode merged = merge(claims, userinfo);
    String subject = text(merged, properties.subjectClaim());
    if (subject == null) {
      subject = text(merged, "sub");
    }
    if (subject == null) {
      throw AuthException.badRequest("sso_token_invalid", "OIDC 身份缺少 subject");
    }
    String username = text(merged, properties.usernameClaim());
    if (username == null) {
      username = subject;
    }
    return new SsoIdentity(
        subject,
        username,
        text(merged, properties.emailClaim()),
        text(merged, properties.nameClaim()));
  }

  private JsonNode verifyIdToken(String token, String nonce) {
    if (properties.jwksUrl().isBlank()) {
      throw AuthException.badRequest("sso_misconfigured", "OIDC jwks 端点未配置");
    }
    String[] parts = token.split("\\.");
    if (parts.length != 3) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 格式不正确");
    }
    JsonNode header = decodePart(parts[0]);
    JsonNode payload = decodePart(parts[1]);
    String algorithm = header.path("alg").asText("");
    String javaAlgorithm = switch (algorithm) {
      case "RS256" -> "SHA256withRSA";
      case "RS384" -> "SHA384withRSA";
      case "RS512" -> "SHA512withRSA";
      default -> throw AuthException.badRequest("sso_token_invalid",
          "不支持的 ID Token 签名算法 " + algorithm);
    };
    String kid = header.path("kid").asText(null);
    try {
      Signature signature = Signature.getInstance(javaAlgorithm);
      signature.initVerify(publicKey(kid));
      signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
      if (!signature.verify(DECODER.decode(parts[2]))) {
        throw AuthException.badRequest("sso_token_invalid", "ID Token 签名无效");
      }
    } catch (AuthException ex) {
      throw ex;
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 签名校验失败");
    }

    String issuer = properties.issuer();
    if (!issuer.isBlank() && !issuer.equals(payload.path("iss").asText(""))) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 签发方不匹配");
    }
    if (!audienceContains(payload.path("aud"))) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 受众不匹配");
    }
    long expiresAt = payload.path("exp").asLong(0);
    if (expiresAt <= Instant.now().getEpochSecond()) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 已过期");
    }
    if (nonce != null && !nonce.isBlank()
        && !nonce.equals(payload.path("nonce").asText(""))) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token nonce 不匹配");
    }
    return payload;
  }

  private java.security.PublicKey publicKey(String kid) throws Exception {
    JsonNode jwks = jwks();
    JsonNode key = findKey(jwks, kid);
    if (key == null) {
      jwksCache = null;
      key = findKey(jwks(), kid);
    }
    if (key == null) {
      throw AuthException.badRequest("sso_token_invalid", "未找到 ID Token 对应的公钥");
    }
    if (!"RSA".equals(key.path("kty").asText())) {
      throw AuthException.badRequest("sso_token_invalid", "仅支持 RSA 公钥");
    }
    BigInteger modulus = new BigInteger(1, DECODER.decode(key.path("n").asText()));
    BigInteger exponent = new BigInteger(1, DECODER.decode(key.path("e").asText()));
    return KeyFactory.getInstance("RSA")
        .generatePublic(new RSAPublicKeySpec(modulus, exponent));
  }

  private JsonNode jwks() {
    JwksCache cache = jwksCache;
    long now = Instant.now().getEpochSecond();
    if (cache != null && cache.expiresAt() > now) {
      return cache.node();
    }
    JsonNode node = read(http.get(properties.jwksUrl(), null), "sso_jwks_invalid");
    jwksCache = new JwksCache(node, now + JWKS_TTL_SECONDS);
    return node;
  }

  private static JsonNode findKey(JsonNode jwks, String kid) {
    for (JsonNode key : jwks.path("keys")) {
      if (kid == null || kid.isBlank() || kid.equals(key.path("kid").asText())) {
        return key;
      }
    }
    return null;
  }

  private boolean audienceContains(JsonNode audience) {
    if (audience.isTextual()) {
      return properties.clientId().equals(audience.asText());
    }
    for (JsonNode item : audience) {
      if (properties.clientId().equals(item.asText())) {
        return true;
      }
    }
    return false;
  }

  private JsonNode decodePart(String part) {
    try {
      return json.readTree(new String(DECODER.decode(part), StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_token_invalid", "ID Token 内容无法解析");
    }
  }

  private JsonNode read(String body, String code) {
    try {
      return json.readTree(body);
    } catch (Exception ex) {
      throw AuthException.badRequest(code, "SSO 返回内容不是合法 JSON");
    }
  }

  private static JsonNode merge(JsonNode claims, JsonNode userinfo) {
    ObjectNode merged = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
    if (claims != null) {
      merged.setAll((ObjectNode) claims);
    }
    if (userinfo != null && userinfo.isObject()) {
      merged.setAll((ObjectNode) userinfo);
    }
    return merged;
  }

  private static String text(JsonNode node, String field) {
    if (node == null || field == null || field.isBlank()) {
      return null;
    }
    JsonNode value = node.path(field);
    if (value.isArray() && value.size() > 0) {
      value = value.get(0);
    }
    if (value.isValueNode() && !value.isNull()) {
      String text = value.asText().trim();
      return text.isEmpty() ? null : text;
    }
    return null;
  }

  private record JwksCache(JsonNode node, long expiresAt) {
  }
}