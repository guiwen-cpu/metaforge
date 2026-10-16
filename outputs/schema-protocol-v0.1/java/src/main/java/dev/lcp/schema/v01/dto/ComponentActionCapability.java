// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.ComponentActionCapabilityKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.Map;

/**
 * 组件暴露的可调用能力。动作编排里通过 targetComponent 调用，设计器据此提供组件方法联想 —— 让「逻辑编排」能真正驱动界面，而不只是发请求。
 */
public class ComponentActionCapability {
    /**
     * 必填字段（required 且无 default）。
     * @pattern ^[a-z][a-zA-Z0-9]{0,47}$
     */
    @NotNull
    @Pattern(regexp = "^[a-z][a-zA-Z0-9]{0,47}$")
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
    }

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * @default "ui"
     */
    @JsonProperty("kind")
    private ComponentActionCapabilityKind kind;

    public ComponentActionCapabilityKind getKind() {
        return kind;
    }

    public void setKind(ComponentActionCapabilityKind kind) {
        this.kind = kind;
    }

    @JsonProperty("params")
    private Map<String, JsonNode> params;

    public Map<String, JsonNode> getParams() {
        return params;
    }

    public void setParams(Map<String, JsonNode> params) {
        this.params = params;
    }

    @JsonProperty("returns")
    private String returns;

    public String getReturns() {
        return returns;
    }

    public void setReturns(String returns) {
        this.returns = returns;
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
