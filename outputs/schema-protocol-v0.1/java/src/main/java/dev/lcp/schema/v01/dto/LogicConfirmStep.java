// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class LogicConfirmStep implements LogicStep {
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
     * @const "confirm"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "confirm";

    public String getType() {
        return type;
    }

    @JsonProperty("title")
    private CommonText title;

    public CommonText getTitle() {
        return title;
    }

    public void setTitle(CommonText title) {
        this.title = title;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("message")
    private CommonExpr message;

    public CommonExpr getMessage() {
        return message;
    }

    public void setMessage(CommonExpr message) {
        this.message = message;
    }

    /**
     * @default false
     */
    @JsonProperty("danger")
    private Boolean danger;

    public Boolean getDanger() {
        return danger;
    }

    public void setDanger(Boolean danger) {
        this.danger = danger;
    }

    @JsonProperty("confirmText")
    private CommonText confirmText;

    public CommonText getConfirmText() {
        return confirmText;
    }

    public void setConfirmText(CommonText confirmText) {
        this.confirmText = confirmText;
    }

    @JsonProperty("cancelText")
    private CommonText cancelText;

    public CommonText getCancelText() {
        return cancelText;
    }

    public void setCancelText(CommonText cancelText) {
        this.cancelText = cancelText;
    }

    @JsonProperty("onConfirm")
    private List<LogicStep> onConfirm;

    public List<LogicStep> getOnConfirm() {
        return onConfirm;
    }

    public void setOnConfirm(List<LogicStep> onConfirm) {
        this.onConfirm = onConfirm;
    }

    @JsonProperty("onCancel")
    private List<LogicStep> onCancel;

    public List<LogicStep> getOnCancel() {
        return onCancel;
    }

    public void setOnCancel(List<LogicStep> onCancel) {
        this.onCancel = onCancel;
    }

    /**
     * 要求填写原因并写入 $ctx.reason。审批驳回场景必备
     * @default false
     */
    @JsonProperty("reasonRequired")
    private Boolean reasonRequired;

    public Boolean getReasonRequired() {
        return reasonRequired;
    }

    public void setReasonRequired(Boolean reasonRequired) {
        this.reasonRequired = reasonRequired;
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
