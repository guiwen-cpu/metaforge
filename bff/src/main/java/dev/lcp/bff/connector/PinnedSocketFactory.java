package dev.lcp.bff.connector;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import javax.net.SocketFactory;

/**
 * PostgreSQL JDBC 的 socketFactory 扩展：按线程固定已校验的 DNS 结果，避免驱动再次解析。
 * 仅由 {@link ConnectorRuntime} 在数据库查询期间设置。
 */
public class PinnedSocketFactory extends SocketFactory {

  private static final ThreadLocal<OutboundUrlPolicy.PinnedTarget> TARGET = new ThreadLocal<>();

  static void pin(String host, OutboundUrlPolicy.PinnedTarget target) {
    TARGET.set(target);
  }

  static void clear() {
    TARGET.remove();
  }

  @Override
  public Socket createSocket(String host, int port) throws IOException {
    OutboundUrlPolicy.PinnedTarget target = TARGET.get();
    if (target == null || !target.host().equalsIgnoreCase(host)) {
      throw new IOException("数据库目标未被固定，拒绝连接");
    }
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(target.address(), target.port()), 5000);
    return socket;
  }

  @Override
  public Socket createSocket(String host, int port, java.net.InetAddress localHost, int localPort)
      throws IOException {
    return createSocket(host, port);
  }

  @Override
  public Socket createSocket(java.net.InetAddress host, int port) throws IOException {
    OutboundUrlPolicy.PinnedTarget target = TARGET.get();
    if (target == null) {
      throw new IOException("数据库目标未被固定，拒绝连接");
    }
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(target.address(), target.port()), 5000);
    return socket;
  }

  @Override
  public Socket createSocket(
      java.net.InetAddress address, int port, java.net.InetAddress localAddress, int localPort)
      throws IOException {
    return createSocket(address, port);
  }
}
