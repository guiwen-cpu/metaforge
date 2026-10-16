// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicNavigateStepTarget;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

/**
 * 页面跳转。优先用 pageRef 而不是硬编码路径 —— 路径属于页面版本，改路由时不应全库搜字符串。表单提交成功回列表、审批完成后跳待办、登录失效回登录页都走这一步。
 */
public class LogicNavigateStep implements LogicStep {
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
     * @const "navigate"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "navigate";

    public String getType() {
        return type;
    }

    /**
     * 目标路径，支持 :param 占位（如 /leave/requests/:id）与外部 URL
     */
    @JsonProperty("to")
    private JsonNode to;

    public JsonNode getTo() {
        return to;
    }

    public void setTo(JsonNode to) {
        this.to = to;
    }

    /**
     * 按页面引用跳转，实际路径由 UISchema.route.path 推导
     */
    @JsonProperty("pageRef")
    private CommonArtifactRef pageRef;

    public CommonArtifactRef getPageRef() {
        return pageRef;
    }

    public void setPageRef(CommonArtifactRef pageRef) {
        this.pageRef = pageRef;
    }

    @JsonProperty("params")
    private Map<String, JsonNode> params;

    public Map<String, JsonNode> getParams() {
        return params;
    }

    public void setParams(Map<String, JsonNode> params) {
        this.params = params;
    }

    @JsonProperty("query")
    private Map<String, JsonNode> query;

    public Map<String, JsonNode> getQuery() {
        return query;
    }

    public void setQuery(Map<String, JsonNode> query) {
        this.query = query;
    }

    /**
     * @default false
     */
    @JsonProperty("replace")
    private Boolean replace;

    public Boolean getReplace() {
        return replace;
    }

    public void setReplace(Boolean replace) {
        this.replace = replace;
    }

    /**
     * @default "self"
     */
    @JsonProperty("target")
    private LogicNavigateStepTarget target;

    public LogicNavigateStepTarget getTarget() {
        return target;
    }

    public void setTarget(LogicNavigateStepTarget target) {
        this.target = target;
    }

    /**
     * 回退层数。与 to / pageRef 三者互斥
     * @minimum 1
     */
    @Min(1L)
    @JsonProperty("back")
    private Integer back;

    public Integer getBack() {
        return back;
    }

    public void setBack(Integer back) {
        this.back = back;
    }

    /**
     * 跳转后关闭当前页签（多页签布局下使用）
     * @default false
     */
    @JsonProperty("closeCurrent")
    private Boolean closeCurrent;

    public Boolean getCloseCurrent() {
        return closeCurrent;
    }

    public void setCloseCurrent(Boolean closeCurrent) {
        this.closeCurrent = closeCurrent;
    }

    /**
     * 返回非空文案时弹出离开确认，用于未保存表单拦截
     */
    @JsonProperty("confirmLeave")
    private CommonExpr confirmLeave;

    public CommonExpr getConfirmLeave() {
        return confirmLeave;
    }

    public void setConfirmLeave(CommonExpr confirmLeave) {
        this.confirmLeave = confirmLeave;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** 至少提供一组字段：to 或 pageRef 或 back（对齐 Schema 的 anyOf 约束）。 */
    @AssertTrue(message = "至少提供一组字段：to 或 pageRef 或 back")
    @JsonIgnore
    public boolean isConstraintSatisfied() {
        return (to != null) || (pageRef != null) || (back != null);
    }
}
