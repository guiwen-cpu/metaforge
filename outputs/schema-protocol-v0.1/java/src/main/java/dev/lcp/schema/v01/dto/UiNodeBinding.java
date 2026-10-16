// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiNodeBindingScope;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 节点与数据的关联声明。这是元数据驱动在页面层最直接的体现：组件不自己发请求，只声明它消费哪个数据源。
 */
public class UiNodeBinding {
    /**
     * 引用本页 dataSources[].id
     */
    @JsonProperty("dataSourceId")
    private String dataSourceId;

    public String getDataSourceId() {
        return dataSourceId;
    }

    public void setDataSourceId(String dataSourceId) {
        this.dataSourceId = dataSourceId;
    }

    /**
     * @default "page"
     */
    @JsonProperty("scope")
    private UiNodeBindingScope scope;

    public UiNodeBindingScope getScope() {
        return scope;
    }

    public void setScope(UiNodeBindingScope scope) {
        this.scope = scope;
    }

    /**
     * 绑定实体，使列表与表单能自动派生列与字段
     */
    @JsonProperty("entityRef")
    private CommonArtifactRef entityRef;

    public CommonArtifactRef getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(CommonArtifactRef entityRef) {
        this.entityRef = entityRef;
    }

    @JsonProperty("fieldKey")
    private String fieldKey;

    public String getFieldKey() {
        return fieldKey;
    }

    public void setFieldKey(String fieldKey) {
        this.fieldKey = fieldKey;
    }

    /**
     * 数据源内取值路径，如 rows[0].name
     */
    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    /**
     * 双向绑定目标，如 $form.name 或 $page.state.checkedIds
     */
    @JsonProperty("model")
    private String model;

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    /**
     * 值字段名，用于 select/tree 的 value 取值
     */
    @JsonProperty("valueKey")
    private String valueKey;

    public String getValueKey() {
        return valueKey;
    }

    public void setValueKey(String valueKey) {
        this.valueKey = valueKey;
    }

    /**
     * 显示字段名
     */
    @JsonProperty("labelKey")
    private String labelKey;

    public String getLabelKey() {
        return labelKey;
    }

    public void setLabelKey(String labelKey) {
        this.labelKey = labelKey;
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
