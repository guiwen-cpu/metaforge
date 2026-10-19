package dev.lcp.bff.runtime.engine;

/** 表达式求值错误。code 供 API 与前端分支，message 只用于展示。 */
public class ExpressionException extends RuntimeException {

  private final String code;

  public ExpressionException(String code, String message) {
    super(message);
    this.code = code;
  }

  public ExpressionException(String code, String message, Throwable cause) {
    super(message, cause);
    this.code = code;
  }

  public String code() {
    return code;
  }
}
