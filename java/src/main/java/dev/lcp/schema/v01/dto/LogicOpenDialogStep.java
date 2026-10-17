// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicOpenDialogStepMode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class LogicOpenDialogStep implements LogicStep {
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
     * @const "openDialog"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "openDialog";

    public String getType() {
        return type;
    }

    /**
     * 对应 UISchema.dialogs 的键
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("dialogKey")
    private String dialogKey;

    public String getDialogKey() {
        return dialogKey;
    }

    public void setDialogKey(String dialogKey) {
        this.dialogKey = dialogKey;
    }

    @JsonProperty("title")
    private CommonText title;

    public CommonText getTitle() {
        return title;
    }

    public void setTitle(CommonText title) {
        this.title = title;
    }

    @JsonProperty("width")
    private JsonNode width;

    public JsonNode getWidth() {
        return width;
    }

    public void setWidth(JsonNode width) {
        this.width = width;
    }

    /**
     * @default "dialog"
     */
    @JsonProperty("mode")
    private LogicOpenDialogStepMode mode;

    public LogicOpenDialogStepMode getMode() {
        return mode;
    }

    public void setMode(LogicOpenDialogStepMode mode) {
        this.mode = mode;
    }

    /**
     * 传入弹窗的初始数据，弹窗内以 $ctx.dialogData 引用
     */
    @JsonProperty("data")
    private CommonExpr data;

    public CommonExpr getData() {
        return data;
    }

    public void setData(CommonExpr data) {
        this.data = data;
    }

    /**
     * 是否等待弹窗关闭后再继续后续步骤
     * @default true
     */
    @JsonProperty("await")
    private Boolean await;

    public Boolean getAwait() {
        return await;
    }

    public void setAwait(Boolean await) {
        this.await = await;
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
