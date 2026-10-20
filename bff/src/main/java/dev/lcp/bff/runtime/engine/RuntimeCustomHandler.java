package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;

/** 平台审核并注册的 custom 步骤处理器；实现类由 Spring 收集进注册表。 */
public interface RuntimeCustomHandler {

  String key();

  JsonNode execute(RuntimeCustomContext context);
}