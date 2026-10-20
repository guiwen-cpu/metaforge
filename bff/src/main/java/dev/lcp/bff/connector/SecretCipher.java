package dev.lcp.bff.connector;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/** AES-256-GCM。随机 96 位 nonce，AAD 绑定租户与密钥 key，密文跨租户搬运会认证失败。 */
@Component
public class SecretCipher {

  private static final int IV_BYTES = 12;
  private static final int TAG_BITS = 128;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final ConnectorProperties properties;
  private volatile SecretKeySpec key;

  public SecretCipher(ConnectorProperties properties) {
    this.properties = properties;
  }

  public Encrypted encrypt(String tenantId, String secretKey, String value) {
    if (value == null || value.isEmpty()) {
      throw new IllegalArgumentException("密钥值不能为空");
    }
    byte[] iv = new byte[IV_BYTES];
    RANDOM.nextBytes(iv);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, secretKey(), new GCMParameterSpec(TAG_BITS, iv));
      cipher.updateAAD(aad(tenantId, secretKey));
      return new Encrypted(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), iv, 1);
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException("密钥加密失败", ex);
    }
  }

  public String decrypt(String tenantId, String secretKey, byte[] ciphertext, byte[] iv) {
    if (ciphertext == null || iv == null || iv.length != IV_BYTES) {
      throw new CipherFailure("密钥密文损坏");
    }
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(TAG_BITS, iv));
      cipher.updateAAD(aad(tenantId, secretKey));
      return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    } catch (AEADBadTagException ex) {
      throw new CipherFailure("密钥认证失败，密文可能已损坏或主密钥不匹配");
    } catch (GeneralSecurityException ex) {
      throw new CipherFailure("密钥解密失败");
    }
  }

  private SecretKeySpec secretKey() {
    SecretKeySpec cached = key;
    if (cached != null) {
      return cached;
    }
    synchronized (this) {
      if (key == null) {
        key = parse(properties.getSecrets().getMasterKey());
      }
      return key;
    }
  }

  private static SecretKeySpec parse(String configured) {
    if (configured == null || configured.isBlank()) {
      throw new CipherFailure("未配置 LCP_SECRET_MASTER_KEY，无法使用租户密钥库");
    }
    byte[] bytes = decode(configured.trim());
    if (bytes == null || bytes.length != 32) {
      throw new CipherFailure("LCP_SECRET_MASTER_KEY 必须是 32 字节（推荐 Base64 编码）");
    }
    return new SecretKeySpec(bytes, "AES");
  }

  private static byte[] decode(String value) {
    try {
      byte[] decoded = Base64.getDecoder().decode(value);
      if (decoded.length == 32) {
        return decoded;
      }
    } catch (IllegalArgumentException ignored) {
      // 继续尝试十六进制与原始文本。
    }
    if (value.matches("[0-9a-fA-F]{64}")) {
      byte[] bytes = new byte[32];
      for (int i = 0; i < bytes.length; i++) {
        bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    byte[] raw = value.getBytes(StandardCharsets.UTF_8);
    return raw.length == 32 ? raw : null;
  }

  private static byte[] aad(String tenantId, String secretKey) {
    return (tenantId + ":" + secretKey).getBytes(StandardCharsets.UTF_8);
  }

  public record Encrypted(byte[] ciphertext, byte[] iv, int keyVersion) {
  }

  public static class CipherFailure extends RuntimeException {

    public CipherFailure(String message) {
      super(message);
    }
  }
}
