package dev.lcp.generated.leave_approval.api.support;

import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 把 runtime 异常与请求体校验失败收敛成同一份错误体，前端只需认 code。 */
@RestControllerAdvice
public class LcpExceptionHandler {

  @ExceptionHandler(LcpApiException.class)
  public ResponseEntity<LcpApiError> handleApi(LcpApiException ex) {
    return ResponseEntity.status(ex.status()).body(LcpApiError.of(ex.code(), ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<LcpApiError> handleValidation(MethodArgumentNotValidException ex) {
    List<LcpApiError.Detail> details = new ArrayList<>();
    ex.getBindingResult().getFieldErrors().forEach((error) ->
        details.add(new LcpApiError.Detail(error.getField(), error.getDefaultMessage())));
    return ResponseEntity.badRequest().body(new LcpApiError("validation_failed", "请求参数校验未通过", details));
  }

  @ExceptionHandler(DuplicateKeyException.class)
  public ResponseEntity<LcpApiError> handleDuplicate(DuplicateKeyException ex) {
    return ResponseEntity.status(409)
        .body(LcpApiError.of("conflict", "唯一约束冲突：" + ex.getMostSpecificCause().getMessage()));
  }
}
