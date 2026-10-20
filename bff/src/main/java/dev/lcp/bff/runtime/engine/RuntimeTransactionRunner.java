package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.function.Supplier;

/** 步骤引擎与事务基础设施的接缝；单元测试可注入立即执行的实现。 */
public interface RuntimeTransactionRunner {

  JsonNode execute(String isolation, boolean readOnly, Supplier<JsonNode> work);
}
