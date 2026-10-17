// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 条件分支。cases 按序求值，首个为真者执行；全为假则执行 else。等价 if/else-if/else 链，且分支名会进入运行时诊断与埋点。
 */
public class LogicBranchStep implements LogicStep {
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
     * @const "branch"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "branch";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     * @minItems 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("cases")
    private List<LogicBranchStepCasesItem> cases;

    public List<LogicBranchStepCasesItem> getCases() {
        return cases;
    }

    public void setCases(List<LogicBranchStepCasesItem> cases) {
        this.cases = cases;
    }

    @JsonProperty("else")
    private List<LogicStep> else_;

    public List<LogicStep> getElse_() {
        return else_;
    }

    public void setElse_(List<LogicStep> else_) {
        this.else_ = else_;
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
