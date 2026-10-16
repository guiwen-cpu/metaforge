// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public class DataValidatorRange implements DataValidator {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "range"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "range";

    public String getType() {
        return type;
    }

    @JsonProperty("min")
    private BigDecimal min;

    public BigDecimal getMin() {
        return min;
    }

    public void setMin(BigDecimal min) {
        this.min = min;
    }

    @JsonProperty("max")
    private BigDecimal max;

    public BigDecimal getMax() {
        return max;
    }

    public void setMax(BigDecimal max) {
        this.max = max;
    }

    @JsonProperty("message")
    private CommonText message;

    public CommonText getMessage() {
        return message;
    }

    public void setMessage(CommonText message) {
        this.message = message;
    }
}
