package dev.lcp.bff.connector;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 连接器与密钥库配置。主密钥只在真正读写密钥时解析，未启用连接器的环境可以留空。 */
@ConfigurationProperties(prefix = "lcp")
public class ConnectorProperties {

  private final Secrets secrets = new Secrets();
  private final Connectors connectors = new Connectors();

  public Secrets getSecrets() {
    return secrets;
  }

  public Connectors getConnectors() {
    return connectors;
  }

  public static class Secrets {

    /** Base64 编码的 32 字节 AES 主密钥；也接受 64 位十六进制或 32 字节原始文本。 */
    private String masterKey = "";

    public String getMasterKey() {
      return masterKey;
    }

    public void setMasterKey(String masterKey) {
      this.masterKey = masterKey == null ? "" : masterKey.trim();
    }
  }

  public static class Connectors {

    /** 本地联调可打开；生产默认拒绝回环、私网与链路本地地址。 */
    private boolean allowPrivateNetworks = false;

    /** 生产默认只允许 HTTPS。 */
    private boolean allowInsecureHttp = false;

    public boolean isAllowPrivateNetworks() {
      return allowPrivateNetworks;
    }

    public void setAllowPrivateNetworks(boolean allowPrivateNetworks) {
      this.allowPrivateNetworks = allowPrivateNetworks;
    }

    public boolean isAllowInsecureHttp() {
      return allowInsecureHttp;
    }

    public void setAllowInsecureHttp(boolean allowInsecureHttp) {
      this.allowInsecureHttp = allowInsecureHttp;
    }
  }
}
