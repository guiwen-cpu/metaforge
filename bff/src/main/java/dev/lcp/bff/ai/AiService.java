package dev.lcp.bff.ai;

import dev.lcp.bff.ai.AiDtos.AiGenerateRequest;
import dev.lcp.bff.ai.AiDtos.AiGenerateResponse;
import dev.lcp.bff.ai.LocalArtifactGenerator.Generated;
import dev.lcp.bff.platform.PlatformException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * AI 生成编排：外部模型优先，失败回退本地。
 *
 * <p>回退不是静默降级 —— 响应里保留 provider=local 与 warning，让设计器明确知道当前结果
 * 来自确定性生成器，而不是外部模型。
 */
@Service
public class AiService {

  private final AiProperties properties;
  private final OpenAiCompatibleClient client;
  private final LocalArtifactGenerator local;
  private final AiArtifactGuard guard;

  public AiService(
      AiProperties properties,
      OpenAiCompatibleClient client,
      LocalArtifactGenerator local,
      AiArtifactGuard guard) {
    this.properties = properties;
    this.client = client;
    this.local = local;
    this.guard = guard;
  }

  public AiGenerateResponse generate(AiGenerateRequest request) {
    if (request.prompt() == null || request.prompt().trim().length() < 4) {
      throw PlatformException.badRequest("ai_prompt_too_short", "请至少输入 4 个字符描述要生成的内容");
    }
    List<String> warnings = new ArrayList<>();
    if (properties.isEnabled()) {
      if (properties.configured()) {
        try {
          OpenAiCompatibleClient.External external = client.generate(request);
          guard.validate(
              request.kind(), external.artifact(), external.assets(), request.context(), request.entityKey());
          warnings.addAll(external.warnings());
          return new AiGenerateResponse(
              "openai-compatible", external.artifact(), external.assets(), warnings);
        } catch (Exception ex) {
          warnings.add("外部模型调用失败，已回退本地生成：" + safeMessage(ex));
        }
      } else {
        warnings.add("外部模型未配置完整（base-url / api-key / model），已使用本地生成");
      }
    } else {
      warnings.add("AI 外部模型未启用，已使用本地确定性生成器");
    }

    Generated generated = local.generate(request);
    warnings.addAll(guard.validate(
        request.kind(), generated.artifact(), generated.assets(), request.context(), request.entityKey()));
    warnings.addAll(generated.warnings());
    return new AiGenerateResponse("local", generated.artifact(), generated.assets(), warnings);
  }

  private static String safeMessage(Exception ex) {
    String message = ex.getMessage();
    if (message == null || message.isBlank()) message = ex.getClass().getSimpleName();
    return message.length() > 240 ? message.substring(0, 240) : message;
  }
}