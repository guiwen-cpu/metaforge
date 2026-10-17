package dev.lcp.generated.leave_approval.api.support;

import java.util.List;

/**
 * 统一错误体。前端只认 code：
 * not_found / conflict / version_conflict / version_required / bad_request / validation_failed / principal_missing
 */
public record LcpApiError(String code, String message, List<Detail> details) {

  /** 字段级错误明细。 */
  public record Detail(String field, String message) {
  }

  public static LcpApiError of(String code, String message) {
    return new LcpApiError(code, message, List.of());
  }
}
