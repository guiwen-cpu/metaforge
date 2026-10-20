package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;

/** 平台注册的 code 入口；Bundle 只能引用 key，不能提交任意脚本。 */
@FunctionalInterface
public interface RuntimeCodeEntry {

  JsonNode execute(JsonNode step, ExpressionEngine.Scope scope);
}