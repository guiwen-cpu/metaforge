package dev.lcp.bff.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** HS256 JWT 签发与校验。令牌只承载身份，不承载权限，权限每次请求从组织模型重算。 */
@Component
public class JwtService {

  private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
  private static final String HMAC = "HmacSHA256";

  private final ObjectMapper json;
  private final byte[] secret;
  private final String issuer;
  private final Duration ttl;

  public JwtService(
      ObjectMapper json,
      @Value("${lcp.auth.jwt-secret:metaforge-dev-secret-change-me}") String secret,
      @Value("${lcp.auth.issuer:metaforge}") String issuer,
      @Value("${lcp.auth.ttl-hours:12}") long ttlHours) {
    this.json = json;
    this.secret = (secret == null || secret.isBlank()
        ? "metaforge-dev-secret-change-me" : secret).getBytes(StandardCharsets.UTF_8);
    this.issuer = issuer == null || issuer.isBlank() ? "metaforge" : issuer;
    this.ttl = Duration.ofHours(Math.max(1, ttlHours));
  }

  public record Claims(String tenantId, String userId, String displayName, Instant expiresAt) {
  }

  public String issue(String tenantId, String userId, String displayName) {
    Instant now = Instant.now();
    ObjectNode header = json.createObjectNode();
    header.put("alg", "HS256");
    header.put("typ", "JWT");
    ObjectNode payload = json.createObjectNode();
    payload.put("iss", issuer);
    payload.put("sub", userId);
    payload.put("tenant", tenantId);
    payload.put("name", displayName == null || displayName.isBlank() ? userId : displayName);
    payload.put("iat", now.getEpochSecond());
    payload.put("exp", now.plus(ttl).getEpochSecond());
    payload.put("jti", UUID.randomUUID().toString());
    String head = encode(header.toString());
    String body = encode(payload.toString());
    String signingInput = head + "." + body;
    return signingInput + "." + sign(signingInput);
  }

  public Claims verify(String token) {
    if (token == null || token.isBlank()) {
      throw AuthException.unauthorized("缺少访问令牌");
    }
    String[] parts = token.split("\\.");
    if (parts.length != 3) {
      throw AuthException.unauthorized("访问令牌格式不正确");
    }
    String signingInput = parts[0] + "." + parts[1];
    byte[] expected = sign(signingInput).getBytes(StandardCharsets.US_ASCII);
    byte[] actual = parts[2].getBytes(StandardCharsets.US_ASCII);
    if (!MessageDigest.isEqual(expected, actual)) {
      throw AuthException.unauthorized("访问令牌签名无效");
    }
    JsonNode payload;
    try {
      payload = json.readTree(new String(DECODER.decode(parts[1]), StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw AuthException.unauthorized("访问令牌内容无法解析");
    }
    if (!issuer.equals(payload.path("iss").asText())) {
      throw AuthException.unauthorized("访问令牌签发方不匹配");
    }
    String tenantId = payload.path("tenant").asText(null);
    String userId = payload.path("sub").asText(null);
    if (tenantId == null || tenantId.isBlank() || userId == null || userId.isBlank()) {
      throw AuthException.unauthorized("访问令牌缺少租户或用户");
    }
    long exp = payload.path("exp").asLong(0);
    Instant expiresAt = Instant.ofEpochSecond(exp);
    if (exp <= 0 || expiresAt.isBefore(Instant.now())) {
      throw AuthException.unauthorized("访问令牌已过期");
    }
    return new Claims(tenantId, userId, payload.path("name").asText(userId), expiresAt);
  }

  public Duration ttl() {
    return ttl;
  }

  private String sign(String input) {
    try {
      Mac mac = Mac.getInstance(HMAC);
      mac.init(new SecretKeySpec(secret, HMAC));
      return ENCODER.encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception ex) {
      throw new IllegalStateException("JWT 签名失败", ex);
    }
  }

  private static String encode(String value) {
    return ENCODER.encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }
}