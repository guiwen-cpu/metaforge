package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * 非纯表达式函数的宿主扩展点。BFF 只实现与请求上下文无关的纯函数；
 * entityField / 外部文件 URL 等需要数据访问的函数由运行时按租户注入。
 */
public interface RuntimeFunctionProvider {

  boolean supports(String function);

  JsonNode invoke(String function, List<JsonNode> args, ExpressionEngine.Scope scope);
}