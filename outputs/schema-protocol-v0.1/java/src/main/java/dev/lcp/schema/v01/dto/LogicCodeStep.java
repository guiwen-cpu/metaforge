// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicCodeStepLang;
import dev.lcp.schema.v01.enums.LogicCodeStepRuntime;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 代码扩展点。强制声明 inputs/outputs —— 既是沙箱契约，也是 AI 生成与人工审查的边界。ts 在沙箱 iframe/Worker 内执行，java 在服务端受限类加载器内执行。
 */
public class LogicCodeStep implements LogicStep {
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
     * @const "code"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "code";

    public String getType() {
        return type;
    }

    /**
     * @default "ts"
     */
    @JsonProperty("lang")
    private LogicCodeStepLang lang;

    public LogicCodeStepLang getLang() {
        return lang;
    }

    public void setLang(LogicCodeStepLang lang) {
        this.lang = lang;
    }

    /**
     * @default "browser"
     */
    @JsonProperty("runtime")
    private LogicCodeStepRuntime runtime;

    public LogicCodeStepRuntime getRuntime() {
        return runtime;
    }

    public void setRuntime(LogicCodeStepRuntime runtime) {
        this.runtime = runtime;
    }

    /**
     * 源码，必须导出默认函数 (input) => output
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("source")
    private String source;

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    /**
     * @default "default"
     */
    @JsonProperty("entry")
    private String entry;

    public String getEntry() {
        return entry;
    }

    public void setEntry(String entry) {
        this.entry = entry;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("inputs")
    private List<LogicCodeStepInputsItem> inputs;

    public List<LogicCodeStepInputsItem> getInputs() {
        return inputs;
    }

    public void setInputs(List<LogicCodeStepInputsItem> inputs) {
        this.inputs = inputs;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("outputs")
    private List<LogicCodeStepOutputsItem> outputs;

    public List<LogicCodeStepOutputsItem> getOutputs() {
        return outputs;
    }

    public void setOutputs(List<LogicCodeStepOutputsItem> outputs) {
        this.outputs = outputs;
    }

    @JsonProperty("assignTo")
    private String assignTo;

    public String getAssignTo() {
        return assignTo;
    }

    public void setAssignTo(String assignTo) {
        this.assignTo = assignTo;
    }

    /**
     * @default 3000
     * @maximum 60000
     */
    @Max(60000L)
    @JsonProperty("timeoutMs")
    private Integer timeoutMs;

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    @JsonProperty("sandbox")
    private LogicSandboxPolicy sandbox;

    public LogicSandboxPolicy getSandbox() {
        return sandbox;
    }

    public void setSandbox(LogicSandboxPolicy sandbox) {
        this.sandbox = sandbox;
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
