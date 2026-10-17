// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicFailStepLevel;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;

/**
 * 主动中断并抛出业务错误。校验不通过、守卫失败、批量操作需短路时使用。前端表现为表单/页面报错（fields 决定标红位置），后端表现为 BusinessException 并回滚当前事务（rollback=false 为仅告警）。
 */
public class LogicFailStep implements LogicStep {
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
     * @const "fail"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "fail";

    public String getType() {
        return type;
    }

    /**
     * @default "error"
     */
    @JsonProperty("level")
    private LogicFailStepLevel level;

    public LogicFailStepLevel getLevel() {
        return level;
    }

    public void setLevel(LogicFailStepLevel level) {
        this.level = level;
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
     * 机器可读错误码，如 LEAVE_PROOF_REQUIRED；前端据此做 i18n 与埋点，不解析 message 文本
     * @pattern ^[A-Z][A-Z0-9_]{2,63}$
     */
    @Pattern(regexp = "^[A-Z][A-Z0-9_]{2,63}$")
    @JsonProperty("code")
    private String code;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    /**
     * 关联字段列表。既可能是实体字段（snake_case），也可能是动作/页面参数（camelCase），前端按同名表单项标红，故用 Ident 而不是 Key。
     */
    @JsonProperty("fields")
    private List<String> fields;

    public List<String> getFields() {
        return fields;
    }

    public void setFields(List<String> fields) {
        this.fields = fields;
    }

    /**
     * 后端是否回滚当前事务；前端忽略此字段
     * @default true
     */
    @JsonProperty("rollback")
    private Boolean rollback;

    public Boolean getRollback() {
        return rollback;
    }

    public void setRollback(Boolean rollback) {
        this.rollback = rollback;
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
