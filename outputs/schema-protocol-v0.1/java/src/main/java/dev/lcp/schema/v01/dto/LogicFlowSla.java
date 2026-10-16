// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicFlowSlaOnTimeout;
import jakarta.validation.constraints.AssertTrue;
import java.math.BigDecimal;

/**
 * 流程时限与超时策略。到时只产生事件/通知，不改业务数据。
 */
public class LogicFlowSla {
    /**
     * 承诺办结时长（小时），从流程开始计
     */
    @JsonProperty("dueDateHours")
    private BigDecimal dueDateHours;

    public BigDecimal getDueDateHours() {
        return dueDateHours;
    }

    public void setDueDateHours(BigDecimal dueDateHours) {
        this.dueDateHours = dueDateHours;
    }

    /**
     * 剩余多少小时开始预警
     */
    @JsonProperty("warningHours")
    private BigDecimal warningHours;

    public BigDecimal getWarningHours() {
        return warningHours;
    }

    public void setWarningHours(BigDecimal warningHours) {
        this.warningHours = warningHours;
    }

    /**
     * 超期多少小时后升级
     */
    @JsonProperty("escalateAfterHours")
    private BigDecimal escalateAfterHours;

    public BigDecimal getEscalateAfterHours() {
        return escalateAfterHours;
    }

    public void setEscalateAfterHours(BigDecimal escalateAfterHours) {
        this.escalateAfterHours = escalateAfterHours;
    }

    @JsonProperty("escalateTo")
    private LogicAssigneeSpec escalateTo;

    public LogicAssigneeSpec getEscalateTo() {
        return escalateTo;
    }

    public void setEscalateTo(LogicAssigneeSpec escalateTo) {
        this.escalateTo = escalateTo;
    }

    /**
     * @default "notify"
     */
    @JsonProperty("onTimeout")
    private LogicFlowSlaOnTimeout onTimeout;

    public LogicFlowSlaOnTimeout getOnTimeout() {
        return onTimeout;
    }

    public void setOnTimeout(LogicFlowSlaOnTimeout onTimeout) {
        this.onTimeout = onTimeout;
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
