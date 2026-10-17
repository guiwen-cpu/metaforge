// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicFlowListenerEvent;
import dev.lcp.schema.v01.enums.LogicFlowListenerOn;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * 流程事件监听，把流程推进与业务副作用解耦（如审批通过后同步学籍状态）。
 */
public class LogicFlowListener {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("event")
    private LogicFlowListenerEvent event;

    public LogicFlowListenerEvent getEvent() {
        return event;
    }

    public void setEvent(LogicFlowListenerEvent event) {
        this.event = event;
    }

    /**
     * @default "task"
     */
    @JsonProperty("on")
    private LogicFlowListenerOn on;

    public LogicFlowListenerOn getOn() {
        return on;
    }

    public void setOn(LogicFlowListenerOn on) {
        this.on = on;
    }

    @JsonProperty("taskKey")
    private String taskKey;

    public String getTaskKey() {
        return taskKey;
    }

    public void setTaskKey(String taskKey) {
        this.taskKey = taskKey;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("actionRef")
    private CommonArtifactRef actionRef;

    public CommonArtifactRef getActionRef() {
        return actionRef;
    }

    public void setActionRef(CommonArtifactRef actionRef) {
        this.actionRef = actionRef;
    }

    /**
     * 默认异步 —— 监听器失败不应阻塞流程推进
     * @default true
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
     * @default 0
     */
    @JsonProperty("order")
    private Integer order;

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }

    @JsonProperty("when")
    private CommonExpr when;

    public CommonExpr getWhen() {
        return when;
    }

    public void setWhen(CommonExpr when) {
        this.when = when;
    }

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

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }
}
