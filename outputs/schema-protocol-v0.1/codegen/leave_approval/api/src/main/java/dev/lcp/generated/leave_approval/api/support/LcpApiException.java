package dev.lcp.generated.leave_approval.api.support;

import org.springframework.http.HttpStatus;

/** 由 runtime 抛出的业务异常，统一由 LcpExceptionHandler 收敛成 LcpApiError。 */
public class LcpApiException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public LcpApiException(HttpStatus status, String code, String message) {
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

  public static LcpApiException notFound(String message) {
    return new LcpApiException(HttpStatus.NOT_FOUND, "not_found", message);
  }

  public static LcpApiException conflict(String message) {
    return new LcpApiException(HttpStatus.CONFLICT, "conflict", message);
  }

  public static LcpApiException versionConflict(String message) {
    return new LcpApiException(HttpStatus.CONFLICT, "version_conflict", message);
  }

  public static LcpApiException versionRequired(String message) {
    return new LcpApiException(HttpStatus.PRECONDITION_REQUIRED, "version_required", message);
  }

  public static LcpApiException badRequest(String message) {
    return new LcpApiException(HttpStatus.BAD_REQUEST, "bad_request", message);
  }

  public static LcpApiException principalMissing(String message) {
    return new LcpApiException(HttpStatus.INTERNAL_SERVER_ERROR, "principal_missing", message);
  }
}
