package dev.lcp.bff.connector;

import java.util.regex.Pattern;

/** 密钥引用格式。Schema 允许裸 key 兼容历史数据，新配置统一写 secret:&lt;key&gt;。 */
public final class SecretRefs {

  private static final Pattern KEY = Pattern.compile("[a-z][a-z0-9_]{0,63}");
  private static final String PREFIX = "secret:";

  private SecretRefs() {
  }

  public static String key(String ref) {
    if (ref == null) {
      throw new IllegalArgumentException("密钥引用不能为空");
    }
    String value = ref.trim();
    if (value.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
      value = value.substring(PREFIX.length());
    }
    if (!KEY.matcher(value).matches()) {
      throw new IllegalArgumentException("密钥引用格式非法：" + value);
    }
    return value;
  }

  public static boolean validKey(String key) {
    return key != null && KEY.matcher(key).matches();
  }
}
