package dev.lcp.generated.leave_approval.server;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 独立工程的最小 HMAC 令牌：payload = tenant|user|exp，签名使用服务端密钥。 */
@Component
public class AuthTokenService {

  private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

  private final String secret;

  public AuthTokenService(@Value("${lcp.demo.token-secret:change-me-in-production}") String secret) {
    this.secret = secret;
  }

  @PostConstruct
  void ensureSecret() {
    if (secret == null || secret.length() < 16) {
      throw new IllegalStateException("lcp.demo.token-secret 至少 16 个字符");
    }
  }

  public String issue(String tenantId, String userId, Instant expiresAt) {
    String payload = tenantId + "|" + userId + "|" + expiresAt.getEpochSecond();
    String encoded = ENCODER.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    return encoded + "." + ENCODER.encodeToString(sign(encoded));
  }

  public Session verify(String token) {
    if (token == null) return null;
    int dot = token.indexOf('.');
    if (dot <= 0) return null;
    String encoded = token.substring(0, dot);
    String signature = token.substring(dot + 1);
    byte[] expected = sign(encoded);
    byte[] actual;
    try {
      actual = DECODER.decode(signature);
    } catch (IllegalArgumentException ex) {
      return null;
    }
    if (!MessageDigest.isEqual(expected, actual)) return null;
    String payload;
    try {
      payload = new String(DECODER.decode(encoded), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException ex) {
      return null;
    }
    String[] parts = payload.split("\\|", -1);
    if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank()) return null;
    long expires;
    try {
      expires = Long.parseLong(parts[2]);
    } catch (NumberFormatException ex) {
      return null;
    }
    if (Instant.now().getEpochSecond() >= expires) return null;
    return new Session(parts[0], parts[1], Instant.ofEpochSecond(expires));
  }

  private byte[] sign(String payload) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw new IllegalStateException("令牌签名失败", ex);
    }
  }

  public record Session(String tenantId, String userId, Instant expiresAt) {}
}
