// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.ComponentPropType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 属性定义。bindable 是设计器属性面板的关键开关：为真时出现「绑定数据 / 表达式」切换按钮。
 */
public class ComponentPropDef {
    /**
     * props 的键。camelCase 以匹配 Vue prop 命名
     * 必填字段（required 且无 default）。
     * @pattern ^[a-zA-Z][a-zA-Z0-9]{0,47}$
     */
    @NotNull
    @Pattern(regexp = "^[a-zA-Z][a-zA-Z0-9]{0,47}$")
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
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private ComponentPropType type;

    public ComponentPropType getType() {
        return type;
    }

    public void setType(ComponentPropType type) {
        this.type = type;
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
     * 是否允许赋值表达式而非仅字面量。为假时 L2 校验拒绝 Expr
     * @default false
     */
    @JsonProperty("bindable")
    private Boolean bindable;

    public Boolean getBindable() {
        return bindable;
    }

    public void setBindable(Boolean bindable) {
        this.bindable = bindable;
    }

    /**
     * type=enum 时的候选值
     */
    @JsonProperty("enum")
    private List<JsonNode> enum_;

    public List<JsonNode> getEnum_() {
        return enum_;
    }

    public void setEnum_(List<JsonNode> enum_) {
        this.enum_ = enum_;
    }

    @JsonProperty("enumLabels")
    private Map<String, CommonText> enumLabels;

    public Map<String, CommonText> getEnumLabels() {
        return enumLabels;
    }

    public void setEnumLabels(Map<String, CommonText> enumLabels) {
        this.enumLabels = enumLabels;
    }

    /**
     * 枚举来自共享枚举定义，避免每个组件重复维护选项
     */
    @JsonProperty("enumRef")
    private CommonArtifactRef enumRef;

    public CommonArtifactRef getEnumRef() {
        return enumRef;
    }

    public void setEnumRef(CommonArtifactRef enumRef) {
        this.enumRef = enumRef;
    }

    /**
     * 属性面板分组
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
     * 是否折叠进「高级」区
     * @default false
     */
    @JsonProperty("advanced")
    private Boolean advanced;

    public Boolean getAdvanced() {
        return advanced;
    }

    public void setAdvanced(Boolean advanced) {
        this.advanced = advanced;
    }

    /**
     * 单位提示，如 px / s / %
     */
    @JsonProperty("unit")
    private String unit;

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    @JsonProperty("min")
    private BigDecimal min;

    public BigDecimal getMin() {
        return min;
    }

    public void setMin(BigDecimal min) {
        this.min = min;
    }

    @JsonProperty("max")
    private BigDecimal max;

    public BigDecimal getMax() {
        return max;
    }

    public void setMax(BigDecimal max) {
        this.max = max;
    }

    /**
     * 联动显示条件。属性面板据此显隐，避免无关配置干扰
     */
    @JsonProperty("when")
    private CommonExpr when;

    public CommonExpr getWhen() {
        return when;
    }

    public void setWhen(CommonExpr when) {
        this.when = when;
    }

    /**
     * type=fieldList/columnList/optionList 时的元素类型
     */
    @JsonProperty("itemType")
    private ComponentPropType itemType;

    public ComponentPropType getItemType() {
        return itemType;
    }

    public void setItemType(ComponentPropType itemType) {
        this.itemType = itemType;
    }

    /**
     * 复合属性的元素字段定义
     */
    @JsonProperty("itemProps")
    private List<ComponentPropDef> itemProps;

    public List<ComponentPropDef> getItemProps() {
        return itemProps;
    }

    public void setItemProps(List<ComponentPropDef> itemProps) {
        this.itemProps = itemProps;
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
