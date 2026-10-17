// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicApiParamType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class LogicApiParam {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private LogicApiParamType type;

    public LogicApiParamType getType() {
        return type;
    }

    public void setType(LogicApiParamType type) {
        this.type = type;
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

    /**
     * 取值来源；缺省取同名入参
     */
    @JsonProperty("source")
    private CommonExpr source;

    public CommonExpr getSource() {
        return source;
    }

    public void setSource(CommonExpr source) {
        this.source = source;
    }

    /**
     * 联调示例值
     */
    @JsonProperty("test")
    private JsonNode test;

    public JsonNode getTest() {
        return test;
    }

    public void setTest(JsonNode test) {
        this.test = test;
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
