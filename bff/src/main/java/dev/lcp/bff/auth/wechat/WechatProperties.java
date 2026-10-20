package dev.lcp.bff.auth.wechat;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 微信小程序登录配置。应用密钥只服务端使用，配置接口不会返回。 */
@ConfigurationProperties(prefix = "lcp.wechat")
public record WechatProperties(
    boolean enabled,
    String appId,
    String appSecret,
    String tenant,
    String displayName,
    String linkBy,
    boolean autoCreate,
    String apiBase,
    boolean allowInsecureHttp) {

  public WechatProperties {
    appId = text(appId, "");
    appSecret = text(appSecret, "");
    tenant = text(tenant, "");
    displayName = text(displayName, "微信登录");
    linkBy = text(linkBy, "username").toLowerCase();
    apiBase = text(apiBase, "https://api.weixin.qq.com");
  }

  private static String text(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}