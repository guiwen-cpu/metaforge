// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class DataEndpoint {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("entityRef")
    private CommonArtifactRef entityRef;

    public CommonArtifactRef getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(CommonArtifactRef entityRef) {
        this.entityRef = entityRef;
    }

    /**
     * 参与关联的字段 key，必须是 storage=column
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("fieldKey")
    private String fieldKey;

    public String getFieldKey() {
        return fieldKey;
    }

    public void setFieldKey(String fieldKey) {
        this.fieldKey = fieldKey;
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
