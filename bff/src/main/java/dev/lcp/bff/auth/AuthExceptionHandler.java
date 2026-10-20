package dev.lcp.bff.auth;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 认证异常统一返回 { code, message, details }，前端据此清理会话。 */
@RestControllerAdvice
public class AuthExceptionHandler {

  @ExceptionHandler(AuthException.class)
  public ResponseEntity<ErrorBody> handle(AuthException ex) {
    return ResponseEntity.status(ex.status())
        .body(new ErrorBody(ex.code(), ex.getMessage(), List.of()));
  }

  public record ErrorBody(String code, String message, List<Detail> details) {
  }

  public record Detail(String field, String message) {
  }
}