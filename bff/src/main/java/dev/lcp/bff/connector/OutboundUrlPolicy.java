package dev.lcp.bff.connector;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * 出站地址策略。写入连接器与每次运行时请求都会校验，防止 SSRF 与明文外发。
 *
 * <p>即使本地允许私网联调，也始终拦截云元数据与链路本地地址。
 */
@Component
public class OutboundUrlPolicy {

  private final ConnectorProperties properties;

  public OutboundUrlPolicy(ConnectorProperties properties) {
    this.properties = properties;
  }

  public URI validate(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new PolicyViolation("地址不能为空");
    }
    URI uri;
    try {
      uri = URI.create(raw.trim());
    } catch (IllegalArgumentException ex) {
      throw new PolicyViolation("地址格式非法");
    }
    validate(uri);
    return uri;
  }

  public void validate(URI uri) {
    if (uri == null || uri.getScheme() == null) {
      throw new PolicyViolation("地址必须包含协议");
    }
    String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
    if (!"http".equals(scheme) && !"https".equals(scheme)) {
      throw new PolicyViolation("仅允许 http/https 协议");
    }
    if ("http".equals(scheme) && !properties.getConnectors().isAllowInsecureHttp()) {
      throw new PolicyViolation("出站请求必须使用 HTTPS");
    }
    if (uri.getRawUserInfo() != null) {
      throw new PolicyViolation("地址不能包含用户名或密码");
    }
    if (uri.getRawFragment() != null) {
      throw new PolicyViolation("地址不能包含 fragment");
    }
    String host = uri.getHost();
    if (host == null || host.isBlank()) {
      throw new PolicyViolation("地址缺少主机名");
    }
    if (uri.getPort() == 0) {
      throw new PolicyViolation("端口非法");
    }
    String normalized = host.toLowerCase(Locale.ROOT);
    if (normalized.endsWith(".")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if ("metadata.google.internal".equals(normalized)) {
      throw new PolicyViolation("禁止访问云元数据服务");
    }
    InetAddress[] addresses;
    try {
      addresses = InetAddress.getAllByName(normalized);
    } catch (UnknownHostException ex) {
      throw new PolicyViolation("无法解析主机名：" + normalized);
    }
    for (InetAddress address : addresses) {
      if (isMetadata(address)) {
        throw new PolicyViolation("禁止访问云元数据服务");
      }
      if (!properties.getConnectors().isAllowPrivateNetworks() && isRestricted(address)) {
        throw new PolicyViolation("禁止访问回环、私网或链路本地地址");
      }
    }
  }

  private static boolean isMetadata(InetAddress address) {
    byte[] bytes = address.getAddress();
    return address instanceof Inet4Address && bytes.length == 4
        && (bytes[0] & 0xff) == 169 && (bytes[1] & 0xff) == 254
        && (bytes[2] & 0xff) == 169 && (bytes[3] & 0xff) == 254;
  }

  private static boolean isRestricted(InetAddress address) {
    if (address.isAnyLocalAddress() || address.isLoopbackAddress()
        || address.isLinkLocalAddress() || address.isSiteLocalAddress()
        || address.isMulticastAddress()) {
      return true;
    }
    byte[] bytes = address.getAddress();
    if (address instanceof Inet4Address && bytes.length == 4) {
      int first = bytes[0] & 0xff;
      int second = bytes[1] & 0xff;
      return first == 0
          || (first == 100 && second >= 64 && second <= 127)
          || (first == 192 && second == 0 && (bytes[2] & 0xff) == 0)
          || (first == 198 && (second == 18 || second == 19));
    }
    if (address instanceof Inet6Address && bytes.length == 16) {
      return (bytes[0] & 0xfe) == 0xfc;
    }
    return false;
  }

  public static class PolicyViolation extends RuntimeException {

    public PolicyViolation(String message) {
      super(message);
    }
  }
}
