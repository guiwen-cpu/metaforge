// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicApiRetryBackoff;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;

public class LogicApiRetry {
    /**
     * @minimum 1
     * @maximum 10
     */
    @Min(1L)
    @Max(10L)
    @JsonProperty("maxAttempts")
    private Integer maxAttempts;

    public Integer getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(Integer maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    @JsonProperty("backoff")
    private LogicApiRetryBackoff backoff;

    public LogicApiRetryBackoff getBackoff() {
        return backoff;
    }

    public void setBackoff(LogicApiRetryBackoff backoff) {
        this.backoff = backoff;
    }

    @JsonProperty("retryOn")
    private List<Integer> retryOn;

    public List<Integer> getRetryOn() {
        return retryOn;
    }

    public void setRetryOn(List<Integer> retryOn) {
        this.retryOn = retryOn;
    }
}
