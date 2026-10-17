package dev.lcp.bff.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 控制平面请求体。字段用 camelCase，序列化层统一转 snake_case。 */
public final class AppRequests {

  private AppRequests() {
  }

  public record CreateAppRequest(
      @NotBlank(message = "key 不能为空")
      @Pattern(regexp = "^[a-z][a-z0-9_]{0,62}$",
          message = "key 需为 snake_case：小写字母开头，仅含小写字母、数字、下划线")
      String key,
      @NotBlank(message = "name 不能为空")
      @Size(max = 64, message = "name 最多 64 字符")
      String name,
      @Size(max = 2000, message = "description 最多 2000 字符")
      String description,
      String icon,
      @Pattern(regexp = "^(education|office|business|template|demo)$",
          message = "type 只能是 education/office/business/template/demo")
      String type,
      String category,
      JsonNode semantic) {
  }

  public record UpdateAppRequest(
      @Size(max = 64, message = "name 最多 64 字符")
      String name,
      @Size(max = 2000, message = "description 最多 2000 字符")
      String description,
      String icon,
      @Pattern(regexp = "^(education|office|business|template|demo)$",
          message = "type 只能是 education/office/business/template/demo")
      String type,
      String category,
      JsonNode semantic) {
  }

  /** revision 非空时做乐观锁校验；不传则无条件覆盖。 */
  public record SaveDraftRequest(JsonNode bundle, Long revision) {
  }

  /** bundle 省略时取当前草稿；message 必填，版本管理不能没有变更说明。 */
  public record PublishRequest(
      @NotBlank(message = "message 不能为空")
      @Size(max = 500, message = "message 最多 500 字符")
      String message,
      JsonNode bundle) {
  }

  /** 回滚 = 用历史内容发布一个新版本，必须说明原因。 */
  public record RollbackRequest(
      @NotBlank(message = "message 不能为空")
      @Size(max = 500, message = "message 最多 500 字符")
      String message) {
  }
}