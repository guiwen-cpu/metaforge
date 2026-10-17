// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.DataFieldStorage;
import dev.lcp.schema.v01.enums.DataFieldType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 字段。storage 是本协议最关键的取舍面：column 字段参与索引/外键/SQL 过滤，jsonb 字段零 DDL 成本但不建索引（除非显式建 GIN 索引）。
 */
public class DataField {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

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
    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private DataFieldType type;

    public DataFieldType getType() {
        return type;
    }

    public void setType(DataFieldType type) {
        this.type = type;
    }

    /**
     * jsonb=默认零成本演进；column=需要索引/唯一/外键/聚合时必须显式声明
     * @default "jsonb"
     */
    @JsonProperty("storage")
    private DataFieldStorage storage;

    public DataFieldStorage getStorage() {
        return storage;
    }

    public void setStorage(DataFieldStorage storage) {
        this.storage = storage;
    }

    /**
     * 仅 storage=column：覆盖默认 DDL 类型，如 varchar(32) / numeric(12,2) / text[]
     */
    @JsonProperty("columnType")
    private String columnType;

    public String getColumnType() {
        return columnType;
    }

    public void setColumnType(String columnType) {
        this.columnType = columnType;
    }

    /**
     * @minimum 1
     */
    @Min(1L)
    @JsonProperty("length")
    private Integer length;

    public Integer getLength() {
        return length;
    }

    public void setLength(Integer length) {
        this.length = length;
    }

    /**
     * @minimum 1
     */
    @Min(1L)
    @JsonProperty("precision")
    private Integer precision;

    public Integer getPrecision() {
        return precision;
    }

    public void setPrecision(Integer precision) {
        this.precision = precision;
    }

    /**
     * @minimum 0
     */
    @Min(0L)
    @JsonProperty("scale")
    private Integer scale;

    public Integer getScale() {
        return scale;
    }

    public void setScale(Integer scale) {
        this.scale = scale;
    }

    /**
     * 服务端强校验。表单必填另由 UI 层 required 控制，二者独立
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
     * 唯一约束作用域为 (tenantColumn, 本字段)
     * @default false
     */
    @JsonProperty("unique")
    private Boolean unique;

    public Boolean getUnique() {
        return unique;
    }

    public void setUnique(Boolean unique) {
        this.unique = unique;
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
     * 创建后不可修改，如学号
     * @default false
     */
    @JsonProperty("immutable")
    private Boolean immutable;

    public Boolean getImmutable() {
        return immutable;
    }

    public void setImmutable(Boolean immutable) {
        this.immutable = immutable;
    }

    /**
     * 标记后默认进入 fieldPolicy=masked，且参与审计与导出脱敏
     * @default false
     */
    @JsonProperty("sensitive")
    private Boolean sensitive;

    public Boolean getSensitive() {
        return sensitive;
    }

    public void setSensitive(Boolean sensitive) {
        this.sensitive = sensitive;
    }

    /**
     * type=enum 时指向枚举定义
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
     * type=enum 且不引用共享枚举时内联定义
     */
    @JsonProperty("enumValues")
    private List<DataEnumValue> enumValues;

    public List<DataEnumValue> getEnumValues() {
        return enumValues;
    }

    public void setEnumValues(List<DataEnumValue> enumValues) {
        this.enumValues = enumValues;
    }

    /**
     * type=ref 时指向目标实体
     */
    @JsonProperty("refEntity")
    private CommonArtifactRef refEntity;

    public CommonArtifactRef getRefEntity() {
        return refEntity;
    }

    public void setRefEntity(CommonArtifactRef refEntity) {
        this.refEntity = refEntity;
    }

    /**
     * type=ref 时目标实体的显示字段，缺省取目标 titleField
     */
    @JsonProperty("refField")
    private String refField;

    public String getRefField() {
        return refField;
    }

    public void setRefField(String refField) {
        this.refField = refField;
    }

    /**
     * type=array 时的元素类型，递归深度上限 3 层（L2 校验）
     */
    @JsonProperty("itemType")
    private DataValueType itemType;

    public DataValueType getItemType() {
        return itemType;
    }

    public void setItemType(DataValueType itemType) {
        this.itemType = itemType;
    }

    /**
     * type=formula 时的计算表达式。编译为生成列或运行时派生，由 storage 决定
     */
    @JsonProperty("formula")
    private CommonExpr formula;

    public CommonExpr getFormula() {
        return formula;
    }

    public void setFormula(CommonExpr formula) {
        this.formula = formula;
    }

    @JsonProperty("validators")
    private List<DataValidator> validators;

    public List<DataValidator> getValidators() {
        return validators;
    }

    public void setValidators(List<DataValidator> validators) {
        this.validators = validators;
    }

    @JsonProperty("uiHints")
    private DataUiHints uiHints;

    public DataUiHints getUiHints() {
        return uiHints;
    }

    public void setUiHints(DataUiHints uiHints) {
        this.uiHints = uiHints;
    }

    @JsonProperty("access")
    private CommonAccess access;

    public CommonAccess getAccess() {
        return access;
    }

    public void setAccess(CommonAccess access) {
        this.access = access;
    }

    /**
     * 是否参与默认全局搜索。为真时 L3 校验要求 storage=column 或存在对应 GIN 索引
     * @default false
     */
    @JsonProperty("searchable")
    private Boolean searchable;

    public Boolean getSearchable() {
        return searchable;
    }

    public void setSearchable(Boolean searchable) {
        this.searchable = searchable;
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
