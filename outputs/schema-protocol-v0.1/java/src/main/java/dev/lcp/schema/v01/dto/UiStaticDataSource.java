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

public class UiStaticDataSource implements UiDataSource {
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
     * @const "static"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "static";

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
     * 字面量数据，用于下拉选项、仪表盘占位、原型预览
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("data")
    private JsonNode data;

    public JsonNode getData() {
        return data;
    }

    public void setData(JsonNode data) {
        this.data = data;
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
