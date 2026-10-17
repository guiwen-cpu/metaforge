package dev.lcp.generated.leave_approval.api.support;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * 主键生成。ULID = 48 位毫秒时间戳 + 80 位随机数，Crockford Base32，天然按时间有序。
 * idType=bigint / snowflake 需要平台侧发号器 —— 出码侧不臆造，明确抛错。
 */
public final class LcpIds {

  private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
  private static final SecureRandom RANDOM = new SecureRandom();

  private LcpIds() {
  }

  public static String next(String idType) {
    if ("ulid".equals(idType)) {
      return ulid();
    }
    if ("uuid".equals(idType)) {
      return UUID.randomUUID().toString();
    }
    throw new IllegalStateException("idType=" + idType + " 需要平台侧发号器，出码产物不生成该实现");
  }

  public static String ulid() {
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
        int byteIndex = index / 8;
        int bitInByte = 7 - (index % 8);
        value = (value << 1) | ((random[byteIndex] >> bitInByte) & 1);
      }
      out[10 + i] = CROCKFORD[value];
    }
    return new String(out);
  }
}
