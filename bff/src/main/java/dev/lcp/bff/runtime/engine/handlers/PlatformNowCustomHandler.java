package dev.lcp.bff.runtime.engine.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.runtime.engine.RuntimeCustomContext;
import dev.lcp.bff.runtime.engine.RuntimeCustomHandler;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Component;

@Component
public class PlatformNowCustomHandler implements RuntimeCustomHandler {

  @Override
  public String key() {
    return "platform.now";
  }

  @Override
  public JsonNode execute(RuntimeCustomContext context) {
    return context.json().getNodeFactory()
        .textNode(OffsetDateTime.now(context.zone()).toString());
  }
}