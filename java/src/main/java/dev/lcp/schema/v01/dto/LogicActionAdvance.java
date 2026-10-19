// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 按任务按钮 outcome 自动办理当前任务；仅在 context.taskId 可解析且任务归属当前用户时生效。
 */
public class LogicActionAdvance {
    /**
     * 目标任务的按钮 outcome，如 approve / reject / return。
     * 必填字段（required 且无 default）。
     * @minLength 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("outcome")
    private String outcome;

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    /**
     * 办理意见，需满足任务按钮的 comment_required 约束。
     */
    @JsonProperty("comment")
    private JsonNode comment;

    public JsonNode getComment() {
        return comment;
    }

    public void setComment(JsonNode comment) {
        this.comment = comment;
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
