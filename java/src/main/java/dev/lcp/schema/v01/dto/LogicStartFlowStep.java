// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

/**
 * 发起审批流。variables 是业务字段到流程变量的显式映射 —— 流程变量集合属于流程版本，改流程不影响业务表结构。
 */
public class LogicStartFlowStep implements LogicStep {
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

    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
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
     * @default false
     */
    @JsonProperty("disabled")
    private Boolean disabled;

    public Boolean getDisabled() {
        return disabled;
    }

    public void setDisabled(Boolean disabled) {
        this.disabled = disabled;
    }

    @JsonProperty("onError")
    private List<LogicStep> onError;

    public List<LogicStep> getOnError() {
        return onError;
    }

    public void setOnError(List<LogicStep> onError) {
        this.onError = onError;
    }

    /**
     * @default false
     */
    @JsonProperty("continueOnError")
    private Boolean continueOnError;

    public Boolean getContinueOnError() {
        return continueOnError;
    }

    public void setContinueOnError(Boolean continueOnError) {
        this.continueOnError = continueOnError;
    }

    @JsonProperty("note")
    private String note;

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "startFlow"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "startFlow";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("flowRef")
    private CommonArtifactRef flowRef;

    public CommonArtifactRef getFlowRef() {
        return flowRef;
    }

    public void setFlowRef(CommonArtifactRef flowRef) {
        this.flowRef = flowRef;
    }

    /**
     * 业务主键，使 Flowable 实例与业务单据可双向定位
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("businessKey")
    private CommonExpr businessKey;

    public CommonExpr getBusinessKey() {
        return businessKey;
    }

    public void setBusinessKey(CommonExpr businessKey) {
        this.businessKey = businessKey;
    }

    @JsonProperty("variables")
    private Map<String, JsonNode> variables;

    public Map<String, JsonNode> getVariables() {
        return variables;
    }

    public void setVariables(Map<String, JsonNode> variables) {
        this.variables = variables;
    }

    /**
     * 把 processInstanceId 写入该路径
     */
    @JsonProperty("assignTo")
    private String assignTo;

    public String getAssignTo() {
        return assignTo;
    }

    public void setAssignTo(String assignTo) {
        this.assignTo = assignTo;
    }

    @JsonProperty("notify")
    private CommonText notify;

    public CommonText getNotify() {
        return notify;
    }

    public void setNotify(CommonText notify) {
        this.notify = notify;
    }

    /**
     * 同一 businessKey 存在运行中实例时拒绝重复发起
     * @default true
     */
    @JsonProperty("checkDuplicate")
    private Boolean checkDuplicate;

    public Boolean getCheckDuplicate() {
        return checkDuplicate;
    }

    public void setCheckDuplicate(Boolean checkDuplicate) {
        this.checkDuplicate = checkDuplicate;
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
