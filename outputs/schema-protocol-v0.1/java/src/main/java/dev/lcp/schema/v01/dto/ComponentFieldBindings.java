// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

/**
 * 字段类型到组件的默认映射。设计器从实体自动生成表单/列表时按此表选组件，出码引擎也读它 —— 这是「内置 CRUD 模板」能自动工作的原因。
 */
public class ComponentFieldBindings {
    /**
     * 适用的 DataSchema FieldType 列表，如 ['string']
     */
    @JsonProperty("forFieldTypes")
    private List<String> forFieldTypes;

    public List<String> getForFieldTypes() {
        return forFieldTypes;
    }

    public void setForFieldTypes(List<String> forFieldTypes) {
        this.forFieldTypes = forFieldTypes;
    }

    /**
     * 适用的 format 细分，如 ['email','phone']
     */
    @JsonProperty("forFormats")
    private List<String> forFormats;

    public List<String> getForFormats() {
        return forFormats;
    }

    public void setForFormats(List<String> forFormats) {
        this.forFormats = forFormats;
    }

    /**
     * 适用的页面类型，如 ['form','list']
     */
    @JsonProperty("forPageKinds")
    private List<String> forPageKinds;

    public List<String> getForPageKinds() {
        return forPageKinds;
    }

    public void setForPageKinds(List<String> forPageKinds) {
        this.forPageKinds = forPageKinds;
    }

    /**
     * 同类型多组件时的优先级，数值小者优先
     * @default 100
     */
    @JsonProperty("priority")
    private Integer priority;

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    /**
     * 是否同时可作为列表列渲染器
     * @default false
     */
    @JsonProperty("listRenderer")
    private Boolean listRenderer;

    public Boolean getListRenderer() {
        return listRenderer;
    }

    public void setListRenderer(Boolean listRenderer) {
        this.listRenderer = listRenderer;
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
