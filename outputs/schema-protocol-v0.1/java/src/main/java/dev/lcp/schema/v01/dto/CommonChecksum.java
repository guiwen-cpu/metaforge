// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.CommonChecksumAlgo;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public class CommonChecksum {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("algo")
    private CommonChecksumAlgo algo;

    public CommonChecksumAlgo getAlgo() {
        return algo;
    }

    public void setAlgo(CommonChecksumAlgo algo) {
        this.algo = algo;
    }

    /**
     * 必填字段（required 且无 default）。
     * @pattern ^[a-f0-9]{64}$
     */
    @NotNull
    @Pattern(regexp = "^[a-f0-9]{64}$")
    @JsonProperty("value")
    private String value;

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }
}
