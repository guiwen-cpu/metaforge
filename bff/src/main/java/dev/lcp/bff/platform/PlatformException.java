package dev.lcp.bff.platform;

import org.springframework.http.HttpStatus;

/**
 * 控制平面业务异常。错误体与出码运行时保持一致：{ code, message, details }。
 *
 * <p>code 是前端唯一需要分支判断的字段；message 只用于展示。
 */
public class PlatformException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public PlatformException(HttpStatus status, String code, String message) {
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

  public static PlatformException notFound(String message) {
    return new PlatformException(HttpStatus.NOT_FOUND, "not_found", message);
  }

  public static PlatformException badRequest(String code, String message) {
    return new PlatformException(HttpStatus.BAD_REQUEST, code, message);
  }

  public static PlatformException conflict(String code, String message) {
    return new PlatformException(HttpStatus.CONFLICT, code, message);
  }
}
