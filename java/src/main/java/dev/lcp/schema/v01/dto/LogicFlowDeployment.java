// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicFlowDeploymentHistoryLevel;
import dev.lcp.schema.v01.enums.LogicFlowDeploymentTenantStrategy;
import jakarta.validation.constraints.AssertTrue;

public class LogicFlowDeployment {
    /**
     * 把平台 tenantId 映射为 Flowable 的 tenantId，实现引擎级租户隔离
     * @default "flowableTenantId"
     */
    @JsonProperty("tenantStrategy")
    private LogicFlowDeploymentTenantStrategy tenantStrategy;

    public LogicFlowDeploymentTenantStrategy getTenantStrategy() {
        return tenantStrategy;
    }

    public void setTenantStrategy(LogicFlowDeploymentTenantStrategy tenantStrategy) {
        this.tenantStrategy = tenantStrategy;
    }

    /**
     * @default "audit"
     */
    @JsonProperty("historyLevel")
    private LogicFlowDeploymentHistoryLevel historyLevel;

    public LogicFlowDeploymentHistoryLevel getHistoryLevel() {
        return historyLevel;
    }

    public void setHistoryLevel(LogicFlowDeploymentHistoryLevel historyLevel) {
        this.historyLevel = historyLevel;
    }

    /**
     * @default false
     */
    @JsonProperty("async")
    private Boolean async;

    public Boolean getAsync() {
        return async;
    }

    public void setAsync(Boolean async) {
        this.async = async;
    }

    /**
     * @default true
     */
    @JsonProperty("exclusive")
    private Boolean exclusive;

    public Boolean getExclusive() {
        return exclusive;
    }

    public void setExclusive(Boolean exclusive) {
        this.exclusive = exclusive;
    }

    /**
     * 发布应用时自动部署到 Flowable
     * @default true
     */
    @JsonProperty("autoDeploy")
    private Boolean autoDeploy;

    public Boolean getAutoDeploy() {
        return autoDeploy;
    }

    public void setAutoDeploy(Boolean autoDeploy) {
        this.autoDeploy = autoDeploy;
    }
}
