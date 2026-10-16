// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiStateVarPersist;
import dev.lcp.schema.v01.enums.UiStateVarType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class UiStateVar {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private UiStateVarType type;

    public UiStateVarType getType() {
        return type;
    }

    public void setType(UiStateVarType type) {
        this.type = type;
    }

    @JsonProperty("initial")
    private JsonNode initial;

    public JsonNode getInitial() {
        return initial;
    }

    public void setInitial(JsonNode initial) {
        this.initial = initial;
    }

    /**
     * query 表示与 URL 同步，保证刷新与分享可复现筛选条件
     * @default "none"
     */
    @JsonProperty("persist")
    private UiStateVarPersist persist;

    public UiStateVarPersist getPersist() {
        return persist;
    }

    public void setPersist(UiStateVarPersist persist) {
        this.persist = persist;
    }

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
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
