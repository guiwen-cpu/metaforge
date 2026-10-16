// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;

public class ComponentEventDef {
    /**
     * 事件名，对应 UINode.handlers 的键，也用于生成 emit('name')
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
     * 事件负载结构。动作内的表达式以 $ctx.event.<key> 访问
     */
    @JsonProperty("params")
    private List<ComponentEventDefParamsItem> params;

    public List<ComponentEventDefParamsItem> getParams() {
        return params;
    }

    public void setParams(List<ComponentEventDefParamsItem> params) {
        this.params = params;
    }

    /**
     * @default false
     */
    @JsonProperty("async")
    private Boolean async;

    public Boolean getAsync() {
        return async;
    }

    public void setAsync(Boolean async) {
        this.async = async;
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
