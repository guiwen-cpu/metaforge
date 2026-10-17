// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.DataUiHintsFixed;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 设计器默认值来源。仅影响默认生成，不限制设计器中改选其他组件。
 */
public class DataUiHints {
    /**
     * 优先渲染的组件名，如 el-select / x-upload
     */
    @JsonProperty("widget")
    private String widget;

    public String getWidget() {
        return widget;
    }

    public void setWidget(String widget) {
        this.widget = widget;
    }

    @JsonProperty("placeholder")
    private CommonText placeholder;

    public CommonText getPlaceholder() {
        return placeholder;
    }

    public void setPlaceholder(CommonText placeholder) {
        this.placeholder = placeholder;
    }

    @JsonProperty("help")
    private CommonText help;

    public CommonText getHelp() {
        return help;
    }

    public void setHelp(CommonText help) {
        this.help = help;
    }

    /**
     * 表单分组标题
     */
    @JsonProperty("group")
    private String group;

    public String getGroup() {
        return group;
    }

    public void setGroup(String group) {
        this.group = group;
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
     * 24 栅格
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
     * 多行文本行数
     */
    @JsonProperty("rows")
    private Integer rows;

    public Integer getRows() {
        return rows;
    }

    public void setRows(Integer rows) {
        this.rows = rows;
    }

    @JsonProperty("prefix")
    private String prefix;

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    @JsonProperty("suffix")
    private String suffix;

    public String getSuffix() {
        return suffix;
    }

    public void setSuffix(String suffix) {
        this.suffix = suffix;
    }

    @JsonProperty("options")
    private List<DataEnumValue> options;

    public List<DataEnumValue> getOptions() {
        return options;
    }

    public void setOptions(List<DataEnumValue> options) {
        this.options = options;
    }

    /**
     * @default false
     */
    @JsonProperty("hideInList")
    private Boolean hideInList;

    public Boolean getHideInList() {
        return hideInList;
    }

    public void setHideInList(Boolean hideInList) {
        this.hideInList = hideInList;
    }

    /**
     * @default false
     */
    @JsonProperty("hideInForm")
    private Boolean hideInForm;

    public Boolean getHideInForm() {
        return hideInForm;
    }

    public void setHideInForm(Boolean hideInForm) {
        this.hideInForm = hideInForm;
    }

    /**
     * 列表列宽
     */
    @JsonProperty("width")
    private Integer width;

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    @JsonProperty("fixed")
    private DataUiHintsFixed fixed;

    public DataUiHintsFixed getFixed() {
        return fixed;
    }

    public void setFixed(DataUiHintsFixed fixed) {
        this.fixed = fixed;
    }

    /**
     * @default false
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
     * @default false
     */
    @JsonProperty("sortable")
    private Boolean sortable;

    public Boolean getSortable() {
        return sortable;
    }

    public void setSortable(Boolean sortable) {
        this.sortable = sortable;
    }

    /**
     * 上传配置。provider=oss 时走 STS 临时凭证客户端直传，服务端只收回调与元数据
     */
    @JsonProperty("upload")
    private DataUiHintsUpload upload;

    public DataUiHintsUpload getUpload() {
        return upload;
    }

    public void setUpload(DataUiHintsUpload upload) {
        this.upload = upload;
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
