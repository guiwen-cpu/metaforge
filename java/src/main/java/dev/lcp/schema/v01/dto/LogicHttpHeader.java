// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicHttpHeaderType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * 外部请求头。名字是 HTTP token（可含连字符），值支持表达式以便注入 token。
 */
public class LogicHttpHeader {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @JsonProperty("type")
    private LogicHttpHeaderType type;

    public LogicHttpHeaderType getType() {
        return type;
    }

    public void setType(LogicHttpHeaderType type) {
        this.type = type;
    }

    @JsonProperty("value")
    private CommonExpr value;

    public CommonExpr getValue() {
        return value;
    }

    public void setValue(CommonExpr value) {
        this.value = value;
    }

    /**
     * @default false
     */
    @JsonProperty("required")
    private Boolean required;

    public Boolean getRequired() {
        return required;
    }

    public void setRequired(Boolean required) {
        this.required = required;
    }

    @JsonProperty("defaultValue")
    private JsonNode defaultValue;

    public JsonNode getDefaultValue() {
        return defaultValue;
    }

    public void setDefaultValue(JsonNode defaultValue) {
        this.defaultValue = defaultValue;
    }

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }
}
