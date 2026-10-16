// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.CommonSemanticAiHintGenerate;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.util.List;

public class CommonSemanticAiHint {
    @JsonProperty("generate")
    private CommonSemanticAiHintGenerate generate;

    public CommonSemanticAiHintGenerate getGenerate() {
        return generate;
    }

    public void setGenerate(CommonSemanticAiHintGenerate generate) {
        this.generate = generate;
    }

    @JsonProperty("constraints")
    private List<String> constraints;

    public List<String> getConstraints() {
        return constraints;
    }

    public void setConstraints(List<String> constraints) {
        this.constraints = constraints;
    }

    @JsonProperty("avoid")
    private List<String> avoid;

    public List<String> getAvoid() {
        return avoid;
    }

    public void setAvoid(List<String> avoid) {
        this.avoid = avoid;
    }

    /**
     * @minimum 0
     * @maximum 1
     */
    @DecimalMin("0")
    @DecimalMax("1")
    @JsonProperty("confidence")
    private BigDecimal confidence;

    public BigDecimal getConfidence() {
        return confidence;
    }

    public void setConfidence(BigDecimal confidence) {
        this.confidence = confidence;
    }
}
