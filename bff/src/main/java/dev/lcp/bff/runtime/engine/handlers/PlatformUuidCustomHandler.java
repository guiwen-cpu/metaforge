package dev.lcp.bff.runtime.engine.handlers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.runtime.engine.RuntimeCustomContext;
import dev.lcp.bff.runtime.engine.RuntimeCustomHandler;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PlatformUuidCustomHandler implements RuntimeCustomHandler {

  @Override
  public String key() {
    return "platform.uuid";
  }

  @Override
  public JsonNode execute(RuntimeCustomContext context) {
    String prefix = context.params().path("prefix").asText("");
    String id = UUID.randomUUID().toString();
    ObjectNode out = context.json().createObjectNode();
    out.put("id", id);
    out.put("value", prefix + id);
    return out;
  }
}