// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicCompleteTaskStepOutcome;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

/**
 * 完成当前审批任务。outcome 映射到 BPMN 出线条件（网关的 condition 表达式），因此流程分支与页面按钮天然一致。
 */
public class LogicCompleteTaskStep implements LogicStep {
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
     * @const "completeTask"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "completeTask";

    public String getType() {
        return type;
    }

    @JsonProperty("taskId")
    private CommonExpr taskId;

    public CommonExpr getTaskId() {
        return taskId;
    }

    public void setTaskId(CommonExpr taskId) {
        this.taskId = taskId;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("outcome")
    private LogicCompleteTaskStepOutcome outcome;

    public LogicCompleteTaskStepOutcome getOutcome() {
        return outcome;
    }

    public void setOutcome(LogicCompleteTaskStepOutcome outcome) {
        this.outcome = outcome;
    }

    /**
     * outcome=custom 时的自定义变量值
     */
    @JsonProperty("outcomeKey")
    private String outcomeKey;

    public String getOutcomeKey() {
        return outcomeKey;
    }

    public void setOutcomeKey(String outcomeKey) {
        this.outcomeKey = outcomeKey;
    }

    @JsonProperty("comment")
    private CommonExpr comment;

    public CommonExpr getComment() {
        return comment;
    }

    public void setComment(CommonExpr comment) {
        this.comment = comment;
    }

    /**
     * @default false
     */
    @JsonProperty("commentRequired")
    private Boolean commentRequired;

    public Boolean getCommentRequired() {
        return commentRequired;
    }

    public void setCommentRequired(Boolean commentRequired) {
        this.commentRequired = commentRequired;
    }

    @JsonProperty("variables")
    private Map<String, JsonNode> variables;

    public Map<String, JsonNode> getVariables() {
        return variables;
    }

    public void setVariables(Map<String, JsonNode> variables) {
        this.variables = variables;
    }

    @JsonProperty("nextAssignee")
    private LogicAssigneeSpec nextAssignee;

    public LogicAssigneeSpec getNextAssignee() {
        return nextAssignee;
    }

    public void setNextAssignee(LogicAssigneeSpec nextAssignee) {
        this.nextAssignee = nextAssignee;
    }

    @JsonProperty("afterComplete")
    private List<LogicStep> afterComplete;

    public List<LogicStep> getAfterComplete() {
        return afterComplete;
    }

    public void setAfterComplete(List<LogicStep> afterComplete) {
        this.afterComplete = afterComplete;
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
