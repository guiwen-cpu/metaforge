package dev.lcp.bff.auth;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** PBKDF2-HMAC-SHA256 密码哈希，格式：pbkdf2-sha256$迭代次数$盐$哈希。 */
public final class PasswordHasher {

  private static final String PREFIX = "pbkdf2-sha256";
  private static final int ITERATIONS = 120_000;
  private static final int SALT_BYTES = 16;
  private static final int KEY_BITS = 256;
  private static final SecureRandom RANDOM = new SecureRandom();

  private PasswordHasher() {
  }

  public static String hash(String password) {
    if (password == null || password.isBlank()) {
      throw new IllegalArgumentException("密码不能为空");
    }
    byte[] salt = new byte[SALT_BYTES];
    RANDOM.nextBytes(salt);
    byte[] derived = derive(password, salt, ITERATIONS);
    return PREFIX + "$" + ITERATIONS + "$"
        + Base64.getEncoder().encodeToString(salt) + "$"
        + Base64.getEncoder().encodeToString(derived);
  }

  public static boolean verify(String password, String encoded) {
    if (password == null || encoded == null || encoded.isBlank()) {
      return false;
    }
    String[] parts = encoded.split("\\$");
    if (parts.length != 4 || !PREFIX.equals(parts[0])) {
      return false;
    }
    try {
      int iterations = Integer.parseInt(parts[1]);
      byte[] salt = Base64.getDecoder().decode(parts[2]);
      byte[] expected = Base64.getDecoder().decode(parts[3]);
      byte[] actual = derive(password, salt, iterations);
      return MessageDigest.isEqual(expected, actual);
    } catch (RuntimeException ex) {
      return false;
    }
  }

  private static byte[] derive(String password, byte[] salt, int iterations) {
    try {
      PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
      return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
          .generateSecret(spec).getEncoded();
    } catch (Exception ex) {
      throw new IllegalStateException("密码哈希失败", ex);
    }
  }
}