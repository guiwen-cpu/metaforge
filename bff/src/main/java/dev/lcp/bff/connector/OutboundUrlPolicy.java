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
 * <p>解析结果通过 {@link PinnedTarget} 交给传输层直接连接，避免校验后再次解析造成 DNS
 * rebinding。即使本地允许私网联调，也始终拦截云元数据与链路本地地址。
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
    resolve(uri);
  }

  /** 解析并校验一次，返回固定目标；调用方必须直连 address，不能按主机名再次解析。 */
  public PinnedTarget resolve(URI uri) {
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
    int port = uri.getPort();
    if (port != -1 && (port < 1 || port > 65535)) {
      throw new PolicyViolation("端口非法");
    }
    if (port == -1) {
      port = "https".equals(scheme) ? 443 : 80;
    }
    return resolveHost(host, port, "https".equals(scheme));
  }

  /** 校验 JDBC authority（host[:port][/database]）并固定解析结果。 */
  public void validateJdbcHost(String authority) {
    if (authority == null || authority.isBlank()) {
      throw new PolicyViolation("JDBC 地址缺少主机名");
    }
    URI uri;
    try {
      uri = URI.create("postgresql://" + authority.trim());
    } catch (IllegalArgumentException ex) {
      throw new PolicyViolation("JDBC 地址格式非法");
    }
    String host = uri.getHost();
    if (host == null || host.isBlank()) {
      throw new PolicyViolation("JDBC 地址缺少主机名");
    }
    int port = uri.getPort() <= 0 ? 5432 : uri.getPort();
    resolveHost(host, port, true);
  }

  public PinnedTarget resolveJdbc(String jdbcUrl) {
    String prefix = "jdbc:postgresql://";
    if (jdbcUrl == null || !jdbcUrl.startsWith(prefix)) {
      throw new PolicyViolation("JDBC 地址必须使用 jdbc:postgresql://");
    }
    String authority = jdbcUrl.substring(prefix.length());
    int slash = authority.indexOf('/');
    if (slash >= 0) {
      authority = authority.substring(0, slash);
    }
    URI uri;
    try {
      uri = URI.create("postgresql://" + authority);
    } catch (IllegalArgumentException ex) {
      throw new PolicyViolation("JDBC 地址格式非法");
    }
    String host = uri.getHost();
    if (host == null || host.isBlank()) {
      throw new PolicyViolation("JDBC 地址缺少主机名");
    }
    int port = uri.getPort() <= 0 ? 5432 : uri.getPort();
    return resolveHost(host, port, true);
  }

  private PinnedTarget resolveHost(String host, int port, boolean secure) {
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
    if (addresses.length == 0) {
      throw new PolicyViolation("主机名没有可用地址：" + normalized);
    }
    for (InetAddress address : addresses) {
      if (isMetadata(address)) {
        throw new PolicyViolation("禁止访问云元数据服务");
      }
      if (!properties.getConnectors().isAllowPrivateNetworks() && isRestricted(address)) {
        throw new PolicyViolation("禁止访问回环、私网或链路本地地址");
      }
    }
    return new PinnedTarget(normalized, port, secure, addresses[0]);
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
      boolean mapped = true;
      for (int i = 0; i < 10; i++) {
        mapped &= bytes[i] == 0;
      }
      mapped &= (bytes[10] & 0xff) == 0xff && (bytes[11] & 0xff) == 0xff;
      if (mapped) {
        return true;
      }
      return (bytes[0] & 0xfe) == 0xfc;
    }
    return false;
  }

  public record PinnedTarget(String host, int port, boolean secure, InetAddress address) {
  }

  public static class PolicyViolation extends RuntimeException {

    public PolicyViolation(String message) {
      super(message);
    }
  }
}
