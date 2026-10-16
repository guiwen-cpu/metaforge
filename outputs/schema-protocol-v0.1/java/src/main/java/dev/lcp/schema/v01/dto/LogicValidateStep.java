// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicValidateStepScope;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 触发表单/实体校验。校验规则来自实体字段的 validators 与组件契约，动作层不重复定义规则。
 */
public class LogicValidateStep implements LogicStep {
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
     * @const "validate"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "validate";

    public String getType() {
        return type;
    }

    /**
     * @default "form"
     */
    @JsonProperty("scope")
    private LogicValidateStepScope scope;

    public LogicValidateStepScope getScope() {
        return scope;
    }

    public void setScope(LogicValidateStepScope scope) {
        this.scope = scope;
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
     * 是否同时提交服务端校验（唯一性等只能服务端判定）
     * @default true
     */
    @JsonProperty("server")
    private Boolean server;

    public Boolean getServer() {
        return server;
    }

    public void setServer(Boolean server) {
        this.server = server;
    }

    /**
     * 校验失败提示。运行时文案统一走表达式（$lit 纯文案 / $tpl 拼接 / $if 分支），静态标签才用 Text。与 FailStep.message 同一套规则。
     */
    @JsonProperty("message")
    private CommonExpr message;

    public CommonExpr getMessage() {
        return message;
    }

    public void setMessage(CommonExpr message) {
        this.message = message;
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
