// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicVariableMappingDirection;
import dev.lcp.schema.v01.enums.LogicVariableMappingType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 业务字段 ↔ 流程变量映射。name 必须是合法 Java 标识符（Flowable 变量限制），故用 camelCase，与实体字段的 snake_case 解耦。
 */
public class LogicVariableMapping {
    /**
     * 必填字段（required 且无 default）。
     * @pattern ^[a-z][a-zA-Z0-9]{1,62}$
     */
    @NotNull
    @Pattern(regexp = "^[a-z][a-zA-Z0-9]{1,62}$")
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    /**
     * @default "in"
     */
    @JsonProperty("direction")
    private LogicVariableMappingDirection direction;

    public LogicVariableMappingDirection getDirection() {
        return direction;
    }

    public void setDirection(LogicVariableMappingDirection direction) {
        this.direction = direction;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("source")
    private CommonExpr source;

    public CommonExpr getSource() {
        return source;
    }

    public void setSource(CommonExpr source) {
        this.source = source;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private LogicVariableMappingType type;

    public LogicVariableMappingType getType() {
        return type;
    }

    public void setType(LogicVariableMappingType type) {
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

    @JsonProperty("defaultValue")
    private JsonNode defaultValue;

    public JsonNode getDefaultValue() {
        return defaultValue;
    }

    public void setDefaultValue(JsonNode defaultValue) {
        this.defaultValue = defaultValue;
    }
}
