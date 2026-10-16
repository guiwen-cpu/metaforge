// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 可本地化文本。允许裸字符串（等价于 {default}）以简化手写 Schema。
 * 透传包装：该定义是「裸标量 | 对象」的联合，Java 用 JsonNode 原样收发，取值走下面的便利方法。
 */
public final class CommonText {
    private final JsonNode value;

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public CommonText(JsonNode value) {
        this.value = value;
    }

    /** 原始节点。@JsonValue 保证序列化后仍是原来的标量或对象，不会多出一层包装。 */
    @JsonValue
    public JsonNode raw() {
        return value;
    }

    @JsonIgnore
    public boolean isPlainText() {
        return value != null && value.isTextual();
    }

    /** 标量形态直接返回；对象形态取 default 键；都没有则返回 null。 */
    @JsonIgnore
    public String asText() {
        if (value == null || value.isNull()) return null;
        if (value.isTextual()) return value.textValue();
        return value.path("default").asText(null);
    }

    @JsonIgnore
    public boolean hasI18n() {
        return value != null && value.isObject() && value.has("i18n");
    }

    /** i18n 表（语言标签 -> 文案）。没有 i18n 键时返回空表，不返回 null。 */
    @JsonIgnore
    public Map<String, String> i18n() {
        Map<String, String> out = new LinkedHashMap<>();
        if (!hasI18n()) return out;
        for (Iterator<Map.Entry<String, JsonNode>> it = value.path("i18n").fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> entry = it.next();
            out.put(entry.getKey(), entry.getValue().asText());
        }
        return out;
    }
}
