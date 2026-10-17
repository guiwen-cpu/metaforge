package dev.lcp.bff.platform;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 只处理控制平面自己的异常；Bean Validation 仍由出码侧的 advice 统一收敛。 */
@RestControllerAdvice
public class PlatformExceptionHandler {

  @ExceptionHandler(PlatformException.class)
  public ResponseEntity<ApiError> handle(PlatformException ex) {
    return ResponseEntity.status(ex.status())
        .body(new ApiError(ex.code(), ex.getMessage(), List.of()));
  }

  public record ApiError(String code, String message, List<Detail> details) {
  }

  public record Detail(String field, String message) {
  }
}
