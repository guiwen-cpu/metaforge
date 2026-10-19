// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 动作结果回写。变量与业务字段的值支持 Value（字面量或表达式），可用 $ctx.result / $ctx.vars / $ctx.error 读取执行结果。
 */
public class LogicActionWriteback {
    /**
     * 流程变量名到值的映射；仅在能解析到流程实例时写入。
     */
    @JsonProperty("variables")
    private Map<String, JsonNode> variables;

    public Map<String, JsonNode> getVariables() {
        return variables;
    }

    public void setVariables(Map<String, JsonNode> variables) {
        this.variables = variables;
    }

    /**
     * 业务实体字段名到值的映射；仅在能解析到业务单据与实体时写入。
     */
    @JsonProperty("business")
    private Map<String, JsonNode> business;

    public Map<String, JsonNode> getBusiness() {
        return business;
    }

    public void setBusiness(Map<String, JsonNode> business) {
        this.business = business;
    }

    /**
     * 动作成功后的流程推进策略；缺省只回写，不自动办理任务。
     */
    @JsonProperty("success")
    private LogicActionAdvance success;

    public LogicActionAdvance getSuccess() {
        return success;
    }

    public void setSuccess(LogicActionAdvance success) {
        this.success = success;
    }

    /**
     * 动作失败后的流程推进策略；缺省保留当前任务。
     */
    @JsonProperty("failure")
    private LogicActionAdvance failure;

    public LogicActionAdvance getFailure() {
        return failure;
    }

    public void setFailure(LogicActionAdvance failure) {
        this.failure = failure;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** x- 扩展键：平台原样透传、不参与校验。 */
    @JsonAnyGetter
    public Map<String, JsonNode> extensions() {
        return extensions;
    }

    @JsonAnySetter
    public void putExtension(String key, JsonNode value) {
        extensions.put(key, value);
    }

    private final Map<String, JsonNode> extensions = new LinkedHashMap<>();
}
