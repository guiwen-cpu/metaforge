package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;

/**
 * Seam between the step engine and the runtime services. Keeping this interface
 * free of Spring dependencies makes the step semantics unit-testable.
 */
public interface RuntimeActionGateway {

  JsonNode invokeInternalApi(
      JsonNode bundle,
      String apiKey,
      String method,
      String pathTemplate,
      Map<String, String> pathValues,
      JsonNode params);

  String startFlow(
      UUID appId,
      String flowKey,
      String businessKey,
      Map<String, Object> variables);

  JsonNode completeTask(
      UUID appId,
      String taskId,
      String outcome,
      String comment,
      String nextAssignee,
      Map<String, Object> variables);
}
