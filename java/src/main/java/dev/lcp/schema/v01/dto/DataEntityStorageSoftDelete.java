// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.DataEntityStorageSoftDeleteType;
import jakarta.validation.constraints.AssertTrue;

public class DataEntityStorageSoftDelete {
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
     * @default "deleted_at"
     */
    @JsonProperty("column")
    private String column;

    public String getColumn() {
        return column;
    }

    public void setColumn(String column) {
        this.column = column;
    }

    /**
     * @default "timestamp"
     */
    @JsonProperty("type")
    private DataEntityStorageSoftDeleteType type;

    public DataEntityStorageSoftDeleteType getType() {
        return type;
    }

    public void setType(DataEntityStorageSoftDeleteType type) {
        this.type = type;
    }
}
