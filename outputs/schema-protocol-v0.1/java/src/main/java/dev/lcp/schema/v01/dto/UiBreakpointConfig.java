// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.Map;

public class UiBreakpointConfig {
    /**
     * 24 栅格占宽
     * @minimum 1
     * @maximum 24
     */
    @Min(1L)
    @Max(24L)
    @JsonProperty("colSpan")
    private Integer colSpan;

    public Integer getColSpan() {
        return colSpan;
    }

    public void setColSpan(Integer colSpan) {
        this.colSpan = colSpan;
    }

    /**
     * @minimum 0
     * @maximum 23
     */
    @Min(0L)
    @Max(23L)
    @JsonProperty("offset")
    private Integer offset;

    public Integer getOffset() {
        return offset;
    }

    public void setOffset(Integer offset) {
        this.offset = offset;
    }

    @JsonProperty("order")
    private Integer order;

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }

    /**
     * @default false
     */
    @JsonProperty("hidden")
    private Boolean hidden;

    public Boolean getHidden() {
        return hidden;
    }

    public void setHidden(Boolean hidden) {
        this.hidden = hidden;
    }

    /**
     * 断点级 props 覆盖，如移动端把表格切成卡片列表
     */
    @JsonProperty("props")
    private Map<String, JsonNode> props;

    public Map<String, JsonNode> getProps() {
        return props;
    }

    public void setProps(Map<String, JsonNode> props) {
        this.props = props;
    }

    @JsonProperty("style")
    private UiNodeStyle style;

    public UiNodeStyle getStyle() {
        return style;
    }

    public void setStyle(UiNodeStyle style) {
        this.style = style;
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
