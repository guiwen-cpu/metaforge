package dev.lcp.bff.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** AI 生成配置。默认关闭外部模型，本地确定性生成器始终可用。 */
@ConfigurationProperties(prefix = "lcp.ai")
public class AiProperties {

  private boolean enabled = false;
  private String baseUrl = "";
  private String apiKey = "";
  private String model = "";
  private long timeoutMs = 20000;

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = trim(baseUrl);
  }

  public String getApiKey() {
    return apiKey;
  }

  public void setApiKey(String apiKey) {
    this.apiKey = trim(apiKey);
  }

  public String getModel() {
    return model;
  }

  public void setModel(String model) {
    this.model = trim(model);
  }

  public long getTimeoutMs() {
    return timeoutMs;
  }

  public void setTimeoutMs(long timeoutMs) {
    this.timeoutMs = timeoutMs <= 0 ? 20000 : timeoutMs;
  }

  public boolean configured() {
    return !baseUrl.isBlank() && !apiKey.isBlank() && !model.isBlank();
  }

  private static String trim(String value) {
    return value == null ? "" : value.trim();
  }
}