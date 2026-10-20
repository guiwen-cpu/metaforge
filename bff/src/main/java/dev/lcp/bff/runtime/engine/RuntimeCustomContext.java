package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.ZoneId;
import java.util.UUID;

/** 自定义处理器入参。params 已完成表达式求值，处理器不直接读 Bundle 或执行脚本。 */
public record RuntimeCustomContext(
    JsonNode step,
    ObjectNode params,
    String tenantId,
    String userId,
    UUID appId,
    Integer versionNo,
    JsonNode bundle,
    String now,
    ZoneId zone,
    ObjectMapper json) {
}