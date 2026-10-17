// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiDataSourceParamType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class UiDataSourceParam {
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

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private UiDataSourceParamType type;

    public UiDataSourceParamType getType() {
        return type;
    }

    public void setType(UiDataSourceParamType type) {
        this.type = type;
    }

    /**
     * @default true
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
     * 参数取值表达式，优先级高于 defaultValue。用于把参数绑定到路由、登录用户、表单或其他数据源结果，例如 { "$ref": "$data.ds_task.businessKey" }
     */
    @JsonProperty("source")
    private CommonExpr source;

    public CommonExpr getSource() {
        return source;
    }

    public void setSource(CommonExpr source) {
        this.source = source;
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
