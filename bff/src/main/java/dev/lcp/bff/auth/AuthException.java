package dev.lcp.bff.auth;

import org.springframework.http.HttpStatus;

/** 认证 / 授权失败。401 表示未登录或令牌失效，403 表示已登录但无权访问。 */
public class AuthException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public AuthException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public static AuthException unauthorized(String message) {
    return new AuthException(HttpStatus.UNAUTHORIZED, "unauthorized", message);
  }

  public static AuthException forbidden(String message) {
    return new AuthException(HttpStatus.FORBIDDEN, "forbidden", message);
  }
}