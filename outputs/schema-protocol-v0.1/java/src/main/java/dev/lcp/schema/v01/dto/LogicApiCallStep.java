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
 * 调用已编排的 API（含第三方集成）。不在动作内内联 URL，强行走 Api 工件 —— 便于鉴权集中、限流、留痕、Mock。
 */
public class LogicApiCallStep implements LogicStep {
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
     * @const "apiCall"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "apiCall";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("apiRef")
    private CommonArtifactRef apiRef;

    public CommonArtifactRef getApiRef() {
        return apiRef;
    }

    public void setApiRef(CommonArtifactRef apiRef) {
        this.apiRef = apiRef;
    }

    @JsonProperty("params")
    private Map<String, JsonNode> params;

    public Map<String, JsonNode> getParams() {
        return params;
    }

    public void setParams(Map<String, JsonNode> params) {
        this.params = params;
    }

    /**
     * 响应写入目标，如 $data.dsX 或 $form
     */
    @JsonProperty("assignTo")
    private String assignTo;

    public String getAssignTo() {
        return assignTo;
    }

    public void setAssignTo(String assignTo) {
        this.assignTo = assignTo;
    }

    /**
     * 只取响应中某条路径写入 assignTo
     */
    @JsonProperty("resultPath")
    private String resultPath;

    public String getResultPath() {
        return resultPath;
    }

    public void setResultPath(String resultPath) {
        this.resultPath = resultPath;
    }

    @JsonProperty("confirmToast")
    private CommonText confirmToast;

    public CommonText getConfirmToast() {
        return confirmToast;
    }

    public void setConfirmToast(CommonText confirmToast) {
        this.confirmToast = confirmToast;
    }

    @JsonProperty("retry")
    private LogicApiCallStepRetry retry;

    public LogicApiCallStepRetry getRetry() {
        return retry;
    }

    public void setRetry(LogicApiCallStepRetry retry) {
        this.retry = retry;
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
