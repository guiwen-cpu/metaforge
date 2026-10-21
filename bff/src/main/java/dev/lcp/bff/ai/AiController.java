package dev.lcp.bff.ai;

import dev.lcp.bff.ai.AiDtos.AiGenerateRequest;
import dev.lcp.bff.ai.AiDtos.AiGenerateResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** AI 辅助生成：只产出候选元数据，不保存草稿、不发布。 */
@RestController
@RequestMapping("/api/v1/platform/ai")
public class AiController {

  private final AiService service;

  public AiController(AiService service) {
    this.service = service;
  }

  @PostMapping("/generate")
  public AiGenerateResponse generate(@Valid @RequestBody AiGenerateRequest body) {
    return service.generate(body);
  }
}