// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.UiSortSpecDirection;
import dev.lcp.schema.v01.enums.UiSortSpecNulls;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class UiSortSpec {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("field")
    private String field;

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    /**
     * @default "asc"
     */
    @JsonProperty("direction")
    private UiSortSpecDirection direction;

    public UiSortSpecDirection getDirection() {
        return direction;
    }

    public void setDirection(UiSortSpecDirection direction) {
        this.direction = direction;
    }

    /**
     * @default "last"
     */
    @JsonProperty("nulls")
    private UiSortSpecNulls nulls;

    public UiSortSpecNulls getNulls() {
        return nulls;
    }

    public void setNulls(UiSortSpecNulls nulls) {
        this.nulls = nulls;
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
