// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 实体 = 一张业务表 + 一份运行时模型定义。所有实体强制带租户列。
 */
public class DataEntity {
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
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    /**
     * 物理表名。缺省由 key 推导
     * @pattern ^[a-z][a-z0-9_]{0,62}$
     */
    @Pattern(regexp = "^[a-z][a-z0-9_]{0,62}$")
    @JsonProperty("tableName")
    private String tableName;

    public String getTableName() {
        return tableName;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    /**
     * 代表该行人类可读标题的字段，用于引用选择器与流程标题
     */
    @JsonProperty("titleField")
    private String titleField;

    public String getTitleField() {
        return titleField;
    }

    public void setTitleField(String titleField) {
        this.titleField = titleField;
    }

    /**
     * @default true
     */
    @JsonProperty("enabled")
    private Boolean enabled;

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("storage")
    private DataEntityStorage storage;

    public DataEntityStorage getStorage() {
        return storage;
    }

    public void setStorage(DataEntityStorage storage) {
        this.storage = storage;
    }

    /**
     * 必填字段（required 且无 default）。
     * @minItems 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("fields")
    private List<DataField> fields;

    public List<DataField> getFields() {
        return fields;
    }

    public void setFields(List<DataField> fields) {
        this.fields = fields;
    }

    @JsonProperty("relations")
    private List<DataRelation> relations;

    public List<DataRelation> getRelations() {
        return relations;
    }

    public void setRelations(List<DataRelation> relations) {
        this.relations = relations;
    }

    @JsonProperty("indexes")
    private List<DataIndex> indexes;

    public List<DataIndex> getIndexes() {
        return indexes;
    }

    public void setIndexes(List<DataIndex> indexes) {
        this.indexes = indexes;
    }

    @JsonProperty("access")
    private CommonAccess access;

    public CommonAccess getAccess() {
        return access;
    }

    public void setAccess(CommonAccess access) {
        this.access = access;
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
