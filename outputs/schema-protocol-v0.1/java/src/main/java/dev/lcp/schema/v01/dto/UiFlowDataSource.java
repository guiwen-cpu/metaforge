// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiFlowDataSourceKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 审批流页面数据源：待办、已办、我发起的、审批历史、流程变量。
 */
public class UiFlowDataSource implements UiDataSource {
    /**
     * 必填字段（required 且无 default）。
     * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
     */
    @NotNull
    @Pattern(regexp = "^[A-Za-z_][A-Za-z0-9_]{0,31}$")
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "flow"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "flow";

    public String getType() {
        return type;
    }

    @JsonProperty("name")
    private CommonText name;

    public CommonText getName() {
        return name;
    }

    public void setName(CommonText name) {
        this.name = name;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("flowRef")
    private CommonArtifactRef flowRef;

    public CommonArtifactRef getFlowRef() {
        return flowRef;
    }

    public void setFlowRef(CommonArtifactRef flowRef) {
        this.flowRef = flowRef;
    }

    /**
     * @default "todoTasks"
     */
    @JsonProperty("kind")
    private UiFlowDataSourceKind kind;

    public UiFlowDataSourceKind getKind() {
        return kind;
    }

    public void setKind(UiFlowDataSourceKind kind) {
        this.kind = kind;
    }

    @JsonProperty("variables")
    private Map<String, JsonNode> variables;

    public Map<String, JsonNode> getVariables() {
        return variables;
    }

    public void setVariables(Map<String, JsonNode> variables) {
        this.variables = variables;
    }

    /**
     * @default true
     */
    @JsonProperty("immediate")
    private Boolean immediate;

    public Boolean getImmediate() {
        return immediate;
    }

    public void setImmediate(Boolean immediate) {
        this.immediate = immediate;
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
