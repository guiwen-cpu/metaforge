// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/**
 * 事件处理：引用具名动作（推荐，可复用可测试）、内联步骤（仅适合一次性简单逻辑），或沙箱代码钩子（页面生命周期专用）。
 * 扁平联合：3 个分支的字段并列，用 is<分支>() 与 head() 判断命中的形态。
 */
public class UiHandlerRef {
    @JsonProperty("actionRef")
    private CommonArtifactRef actionRef;

    public CommonArtifactRef getActionRef() {
        return actionRef;
    }

    public void setActionRef(CommonArtifactRef actionRef) {
        this.actionRef = actionRef;
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
     * @minItems 1
     */
    @Size(min = 1)
    @JsonProperty("steps")
    private List<LogicStep> steps;

    public List<LogicStep> getSteps() {
        return steps;
    }

    public void setSteps(List<LogicStep> steps) {
        this.steps = steps;
    }

    @JsonProperty("code")
    private LogicCodeHook code;

    public LogicCodeHook getCode() {
        return code;
    }

    public void setCode(LogicCodeHook code) {
        this.code = code;
    }

    /** 分支 1 命中判断：需要同时提供 actionRef。 */
    @JsonIgnore
    public boolean isActionRef() {
        return actionRef != null;
    }

    /** 分支 2 命中判断：需要同时提供 steps。 */
    @JsonIgnore
    public boolean isSteps() {
        return steps != null;
    }

    /** 分支 3 命中判断：需要同时提供 code。 */
    @JsonIgnore
    public boolean isCode() {
        return code != null;
    }

    /** 命中的分支名（第一个满足的分支），都不满足时返回 null。Java 表达不了联合类型，这里用分支谓词 + head() 替代 TS 的窄化。 */
    @JsonIgnore
    public String head() {
        if (isActionRef()) return "ActionRef";
        if (isSteps()) return "Steps";
        if (isCode()) return "Code";
        return null;
    }
}
