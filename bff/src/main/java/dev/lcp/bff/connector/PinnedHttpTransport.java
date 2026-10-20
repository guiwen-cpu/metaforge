package dev.lcp.bff.connector;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.springframework.stereotype.Component;

/**
 * HTTP/1.1 传输层，先按 {@link OutboundUrlPolicy} 固定 DNS 结果，再直接连接该地址。
 *
 * <p>不跟随重定向。HTTPS 使用 SNI 并在握手后手动校验证书主机名，避免“校验一次、连接时再解析”
 * 的 DNS rebinding 窗口。仅支持连接器需要的请求/响应形态。
 */
@Component
public class PinnedHttpTransport {

  private static final int MAX_HEADER_BYTES = 64 * 1024;
  private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

  private final OutboundUrlPolicy urls;

  public PinnedHttpTransport(OutboundUrlPolicy urls) {
    this.urls = urls;
  }

  public Response send(
      URI uri,
      String method,
      Map<String, String> headers,
      byte[] body,
      Duration connectTimeout,
      Duration readTimeout) throws IOException {
    OutboundUrlPolicy.PinnedTarget target = urls.resolve(uri);
    String verb = method == null || method.isBlank() ? "GET" : method.toUpperCase(Locale.ROOT);
    if (!verb.matches("[A-Z]{3,8}")) {
      throw new IOException("非法 HTTP 方法");
    }
    Socket socket = new Socket();
    try {
      socket.connect(new InetSocketAddress(target.address(), target.port()),
          millis(connectTimeout, 5000));
      socket.setSoTimeout(millis(readTimeout, 10000));
      if (target.secure()) {
        socket = secure(socket, target);
      }
      OutputStream out = socket.getOutputStream();
      writeRequest(out, uri, verb, target, headers, body == null ? new byte[0] : body);
      return readResponse(new BufferedInputStream(socket.getInputStream()), verb);
    } finally {
      try {
        socket.close();
      } catch (IOException ignored) {
        // 已完成的请求不再关心关闭异常。
      }
    }
  }

  private Socket secure(Socket raw, OutboundUrlPolicy.PinnedTarget target) throws IOException {
    SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
    SSLSocket ssl = (SSLSocket) factory.createSocket(raw, target.host(), target.port(), true);
    SSLParameters parameters = ssl.getSSLParameters();
    parameters.setServerNames(List.of(new SNIHostName(target.host())));
    ssl.setSSLParameters(parameters);
    ssl.startHandshake();
    if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(target.host(), ssl.getSession())) {
      throw new IOException("TLS 证书主机名不匹配：" + target.host());
    }
    return ssl;
  }

  private void writeRequest(
      OutputStream out,
      URI uri,
      String method,
      OutboundUrlPolicy.PinnedTarget target,
      Map<String, String> headers,
      byte[] body) throws IOException {
    String path = uri.getRawPath();
    if (path == null || path.isEmpty()) {
      path = "/";
    }
    if (uri.getRawQuery() != null && !uri.getRawQuery().isEmpty()) {
      path += "?" + uri.getRawQuery();
    }
    if (containsCrlf(path)) {
      throw new IOException("请求路径包含非法字符");
    }
    String hostHeader = target.host().contains(":")
        ? "[" + target.host() + "]"
        : target.host();
    boolean defaultPort = target.secure() ? target.port() == 443 : target.port() == 80;
    if (!defaultPort) {
      hostHeader += ":" + target.port();
    }

    StringBuilder head = new StringBuilder();
    head.append(method).append(' ').append(path).append(" HTTP/1.1\r\n");
    head.append("Host: ").append(hostHeader).append("\r\n");
    head.append("Connection: close\r\n");
    head.append("User-Agent: MetaForge-Connector/1.0\r\n");
    head.append("Accept-Encoding: identity\r\n");
    if (headers != null) {
      for (Map.Entry<String, String> entry : headers.entrySet()) {
        String name = entry.getKey();
        String value = entry.getValue() == null ? "" : entry.getValue();
        if (name == null || name.isBlank() || containsCrlf(name) || containsCrlf(value)) {
          throw new IOException("请求头包含非法字符");
        }
        String lower = name.toLowerCase(Locale.ROOT);
        if ("host".equals(lower) || "connection".equals(lower) || "content-length".equals(lower)
            || "transfer-encoding".equals(lower)) {
          continue;
        }
        head.append(name).append(": ").append(value).append("\r\n");
      }
    }
    head.append("Content-Length: ").append(body.length).append("\r\n\r\n");
    out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
    if (body.length > 0) {
      out.write(body);
    }
    out.flush();
  }

  private Response readResponse(InputStream input, String method) throws IOException {
    String statusLine = readLine(input, MAX_HEADER_BYTES);
    if (statusLine == null || statusLine.isBlank()) {
      throw new EOFException("远端未返回 HTTP 响应");
    }
    String[] parts = statusLine.split(" ", 3);
    if (parts.length < 2 || !parts[0].startsWith("HTTP/")) {
      throw new IOException("HTTP 响应状态行非法");
    }
    int status;
    try {
      status = Integer.parseInt(parts[1]);
    } catch (NumberFormatException ex) {
      throw new IOException("HTTP 状态码非法");
    }
    Map<String, List<String>> headers = new LinkedHashMap<>();
    int headerBytes = statusLine.length();
    while (true) {
      String line = readLine(input, MAX_HEADER_BYTES);
      if (line == null) {
        throw new EOFException("HTTP 响应头未结束");
      }
      headerBytes += line.length();
      if (headerBytes > MAX_HEADER_BYTES) {
        throw new IOException("HTTP 响应头过大");
      }
      if (line.isEmpty()) {
        break;
      }
      int colon = line.indexOf(':');
      if (colon <= 0) {
        continue;
      }
      String name = line.substring(0, colon).trim();
      String value = line.substring(colon + 1).trim();
      headers.computeIfAbsent(name, key -> new ArrayList<>()).add(value);
    }

    byte[] body;
    if ("HEAD".equals(method) || status == 204 || status == 304) {
      body = new byte[0];
    } else if (header(headers, "transfer-encoding").toLowerCase(Locale.ROOT).contains("chunked")) {
      body = readChunked(input);
    } else {
      String length = header(headers, "content-length");
      if (!length.isBlank()) {
        int size;
        try {
          size = Integer.parseInt(length.trim());
        } catch (NumberFormatException ex) {
          throw new IOException("Content-Length 非法");
        }
        if (size < 0 || size > MAX_BODY_BYTES) {
          throw new IOException("响应体过大");
        }
        body = input.readNBytes(size);
      } else {
        body = readLimited(input);
      }
    }
    return new Response(status, headers, new String(body, StandardCharsets.UTF_8));
  }

  private byte[] readChunked(InputStream input) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    while (true) {
      String line = readLine(input, 8192);
      if (line == null) {
        throw new EOFException("分块响应提前结束");
      }
      String hex = line.split(";", 2)[0].trim();
      int size;
      try {
        size = Integer.parseInt(hex, 16);
      } catch (NumberFormatException ex) {
        throw new IOException("分块长度非法");
      }
      if (size == 0) {
        while (true) {
          String trailer = readLine(input, MAX_HEADER_BYTES);
          if (trailer == null || trailer.isEmpty()) {
            break;
          }
        }
        return out.toByteArray();
      }
      if (out.size() + size > MAX_BODY_BYTES) {
        throw new IOException("响应体过大");
      }
      byte[] chunk = input.readNBytes(size);
      if (chunk.length != size) {
        throw new EOFException("分块响应提前结束");
      }
      out.write(chunk);
      readLine(input, 8);
    }
  }

  private byte[] readLimited(InputStream input) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int read;
    while ((read = input.read(buffer)) >= 0) {
      if (out.size() + read > MAX_BODY_BYTES) {
        throw new IOException("响应体过大");
      }
      out.write(buffer, 0, read);
    }
    return out.toByteArray();
  }

  private static String readLine(InputStream input, int limit) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    while (true) {
      int value = input.read();
      if (value < 0) {
        return out.size() == 0 ? null : out.toString(StandardCharsets.ISO_8859_1);
      }
      if (value == '\n') {
        String line = out.toString(StandardCharsets.ISO_8859_1);
        return line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
      }
      if (out.size() >= limit) {
        throw new IOException("响应行过长");
      }
      out.write(value);
    }
  }

  private static String header(Map<String, List<String>> headers, String name) {
    for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
      if (name.equalsIgnoreCase(entry.getKey()) && !entry.getValue().isEmpty()) {
        return String.join(",", entry.getValue());
      }
    }
    return "";
  }

  private static boolean containsCrlf(String value) {
    return value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0;
  }

  private static int millis(Duration duration, int fallback) {
    if (duration == null || duration.isZero() || duration.isNegative()) {
      return fallback;
    }
    return (int) Math.min(Integer.MAX_VALUE, Math.max(1, duration.toMillis()));
  }

  public record Response(int status, Map<String, List<String>> headers, String body) {

    public String firstHeader(String name) {
      return header(headers, name);
    }
  }
}
