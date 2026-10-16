// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.ComponentSlotDefScope;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

public class ComponentSlotDef {
    /**
     * @default "default"
     */
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
     * @default true
     */
    @JsonProperty("multiple")
    private Boolean multiple;

    public Boolean getMultiple() {
        return multiple;
    }

    public void setMultiple(Boolean multiple) {
        this.multiple = multiple;
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

    /**
     * 允许的子组件名白名单；空数组表示不限
     */
    @JsonProperty("accepts")
    private List<String> accepts;

    public List<String> getAccepts() {
        return accepts;
    }

    public void setAccepts(List<String> accepts) {
        this.accepts = accepts;
    }

    /**
     * value 表示插槽接收的是作用域数据而非节点树（如表单字段插槽）
     * @default "node"
     */
    @JsonProperty("scope")
    private ComponentSlotDefScope scope;

    public ComponentSlotDefScope getScope() {
        return scope;
    }

    public void setScope(ComponentSlotDefScope scope) {
        this.scope = scope;
    }

    @JsonProperty("maxItems")
    private Integer maxItems;

    public Integer getMaxItems() {
        return maxItems;
    }

    public void setMaxItems(Integer maxItems) {
        this.maxItems = maxItems;
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
