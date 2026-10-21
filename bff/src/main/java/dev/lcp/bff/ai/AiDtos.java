package dev.lcp.bff.ai;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** AI 生成请求与响应。字段用 camelCase，序列化层统一转 snake_case。 */
public final class AiDtos {

  private AiDtos() {
  }

  public record AiGenerateRequest(
      @NotBlank(message = "kind 不能为空")
      @Pattern(regexp = "^(form|page|flow)$", message = "kind 只能是 form/page/flow")
      String kind,
      @NotBlank(message = "prompt 不能为空")
      @Size(max = 4000, message = "prompt 最多 4000 字符")
      String prompt,
      @Pattern(regexp = "^[a-z][a-z0-9_]{0,62}$", message = "entity_key 必须是小写 snake_case")
      String entityKey,
      @Pattern(regexp = "^(form|list|detail)$", message = "page_kind 只能是 form/list/detail")
      String pageKind,
      JsonNode context) {
  }

  public record AiGenerateResponse(
      String provider,
      JsonNode artifact,
      List<JsonNode> assets,
      List<String> warnings) {
  }
}