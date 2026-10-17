// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.Map;

public class ComponentCapabilities {
    /**
     * 可作为表单字段：参与 $form 模型、必填校验、提交数据收集
     * @default false
     */
    @JsonProperty("formField")
    private Boolean formField;

    public Boolean getFormField() {
        return formField;
    }

    public void setFormField(Boolean formField) {
        this.formField = formField;
    }

    /**
     * 可作为表格列渲染器（配 columnList 使用）
     * @default false
     */
    @JsonProperty("listColumn")
    private Boolean listColumn;

    public Boolean getListColumn() {
        return listColumn;
    }

    public void setListColumn(Boolean listColumn) {
        this.listColumn = listColumn;
    }

    /**
     * 是否允许 bind 数据源
     * @default true
     */
    @JsonProperty("supportsBinding")
    private Boolean supportsBinding;

    public Boolean getSupportsBinding() {
        return supportsBinding;
    }

    public void setSupportsBinding(Boolean supportsBinding) {
        this.supportsBinding = supportsBinding;
    }

    /**
     * 是否自身消费数据源（表格/列表/树）
     * @default false
     */
    @JsonProperty("supportsDataSource")
    private Boolean supportsDataSource;

    public Boolean getSupportsDataSource() {
        return supportsDataSource;
    }

    public void setSupportsDataSource(Boolean supportsDataSource) {
        this.supportsDataSource = supportsDataSource;
    }

    /**
     * 是否允许 loop 配置
     * @default false
     */
    @JsonProperty("supportsLoop")
    private Boolean supportsLoop;

    public Boolean getSupportsLoop() {
        return supportsLoop;
    }

    public void setSupportsLoop(Boolean supportsLoop) {
        this.supportsLoop = supportsLoop;
    }

    /**
     * @default true
     */
    @JsonProperty("supportsVisibility")
    private Boolean supportsVisibility;

    public Boolean getSupportsVisibility() {
        return supportsVisibility;
    }

    public void setSupportsVisibility(Boolean supportsVisibility) {
        this.supportsVisibility = supportsVisibility;
    }

    /**
     * @default true
     */
    @JsonProperty("supportsResponsive")
    private Boolean supportsResponsive;

    public Boolean getSupportsResponsive() {
        return supportsResponsive;
    }

    public void setSupportsResponsive(Boolean supportsResponsive) {
        this.supportsResponsive = supportsResponsive;
    }

    /**
     * @default true
     */
    @JsonProperty("supportsStyle")
    private Boolean supportsStyle;

    public Boolean getSupportsStyle() {
        return supportsStyle;
    }

    public void setSupportsStyle(Boolean supportsStyle) {
        this.supportsStyle = supportsStyle;
    }

    /**
     * @default true
     */
    @JsonProperty("movable")
    private Boolean movable;

    public Boolean getMovable() {
        return movable;
    }

    public void setMovable(Boolean movable) {
        this.movable = movable;
    }

    /**
     * @default true
     */
    @JsonProperty("resizable")
    private Boolean resizable;

    public Boolean getResizable() {
        return resizable;
    }

    public void setResizable(Boolean resizable) {
        this.resizable = resizable;
    }

    /**
     * @default true
     */
    @JsonProperty("copyable")
    private Boolean copyable;

    public Boolean getCopyable() {
        return copyable;
    }

    public void setCopyable(Boolean copyable) {
        this.copyable = copyable;
    }

    /**
     * @default true
     */
    @JsonProperty("deletable")
    private Boolean deletable;

    public Boolean getDeletable() {
        return deletable;
    }

    public void setDeletable(Boolean deletable) {
        this.deletable = deletable;
    }

    /**
     * 是否内置虚拟滚动，大数据量列表的判定依据
     * @default false
     */
    @JsonProperty("virtualScroll")
    private Boolean virtualScroll;

    public Boolean getVirtualScroll() {
        return virtualScroll;
    }

    public void setVirtualScroll(Boolean virtualScroll) {
        this.virtualScroll = virtualScroll;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** x- 扩展键：平台原样透传、不参与校验。 */
    @JsonAnyGetter
    public Map<String, JsonNode> extensions() {
        return extensions;
    }

    @JsonAnySetter
    public void putExtension(String key, JsonNode value) {
        extensions.put(key, value);
    }

    private final Map<String, JsonNode> extensions = new LinkedHashMap<>();
}
