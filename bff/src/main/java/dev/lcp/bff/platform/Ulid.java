package dev.lcp.bff.platform;

import java.security.SecureRandom;

/**
 * 26 位 Crockford Base32 ULID。
 *
 * <p>协议里的 Id（snapshotId）要求 ULID，不能复用数据库 uuid；这里保留一份平台侧实现，
 * 避免控制面反向依赖某个出码应用的生成代码。
 */
public final class Ulid {

  private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
  private static final SecureRandom RANDOM = new SecureRandom();

  private Ulid() {
  }

  public static String next() {
    long time = System.currentTimeMillis();
    byte[] random = new byte[10];
    RANDOM.nextBytes(random);
    char[] out = new char[26];
    for (int i = 9; i >= 0; i--) {
      out[i] = CROCKFORD[(int) (time & 0x1F)];
      time >>>= 5;
    }
    for (int i = 0; i < 16; i++) {
      int offset = i * 5;
      int value = 0;
      for (int bit = 0; bit < 5; bit++) {
        int index = offset + bit;
        value = (value << 1) | ((random[index / 8] >> (7 - (index % 8))) & 1);
      }
      out[10 + i] = CROCKFORD[value];
    }
    return new String(out);
  }
}
