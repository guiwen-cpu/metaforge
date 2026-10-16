// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicApiRateLimitScope;
import jakarta.validation.constraints.AssertTrue;
import java.math.BigDecimal;

public class LogicApiRateLimit {
    @JsonProperty("qps")
    private BigDecimal qps;

    public BigDecimal getQps() {
        return qps;
    }

    public void setQps(BigDecimal qps) {
        this.qps = qps;
    }

    @JsonProperty("burst")
    private Integer burst;

    public Integer getBurst() {
        return burst;
    }

    public void setBurst(Integer burst) {
        this.burst = burst;
    }

    /**
     * @default "tenant"
     */
    @JsonProperty("scope")
    private LogicApiRateLimitScope scope;

    public LogicApiRateLimitScope getScope() {
        return scope;
    }

    public void setScope(LogicApiRateLimitScope scope) {
        this.scope = scope;
    }
}
