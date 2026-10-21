// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 页面生命周期代码钩子。与 CodeStep 共用沙箱策略、输入输出契约与执行边界，但不属于逻辑步骤序列；只能在浏览器沙箱 iframe 内执行。
 */
public class LogicCodeHook {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "ts"
     * @default "ts"
     */
    @JsonProperty("lang")
    private String lang = "ts";

    public String getLang() {
        return lang;
    }

    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "browser"
     * @default "browser"
     */
    @JsonProperty("runtime")
    private String runtime = "browser";

    public String getRuntime() {
        return runtime;
    }

    /**
     * TypeScript 源码，必须导出默认函数 (ctx) => output
     * 必填字段（required 且无 default）。
     * @minLength 1
     * @maxLength 200000
     */
    @NotNull
    @Size(min = 1, max = 200000)
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
     * 从运行态上下文取值的输入声明；空数组合法
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("inputs")
    private List<LogicCodeHookInputsItem> inputs;

    public List<LogicCodeHookInputsItem> getInputs() {
        return inputs;
    }

    public void setInputs(List<LogicCodeHookInputsItem> inputs) {
        this.inputs = inputs;
    }

    /**
     * 返回值声明；空数组合法
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("outputs")
    private List<LogicCodeHookOutputsItem> outputs;

    public List<LogicCodeHookOutputsItem> getOutputs() {
        return outputs;
    }

    public void setOutputs(List<LogicCodeHookOutputsItem> outputs) {
        this.outputs = outputs;
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
