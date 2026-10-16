// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 语义描述层。面向 AI 生成与自然语言检索，运行时忽略。所有可寻址节点都必须预留此字段。
 */
public class CommonSemantic {
    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * 该节点「想干什么」的业务意图，供 AI 理解与生成时对齐
     * @maxLength 500
     */
    @Size(max = 500)
    @JsonProperty("intent")
    private String intent;

    public String getIntent() {
        return intent;
    }

    public void setIntent(String intent) {
        this.intent = intent;
    }

    /**
     * few-shot 样例：值本身，或 {input, output} 结构
     * @maxItems 20
     */
    @Size(max = 20)
    @JsonProperty("examples")
    private List<JsonNode> examples;

    public List<JsonNode> getExamples() {
        return examples;
    }

    public void setExamples(List<JsonNode> examples) {
        this.examples = examples;
    }

    /**
     * 同义词，用于模糊检索与 NL 匹配
     * @maxItems 30
     */
    @Size(max = 30)
    @JsonProperty("synonyms")
    private List<String> synonyms;

    public List<String> getSynonyms() {
        return synonyms;
    }

    public void setSynonyms(List<String> synonyms) {
        this.synonyms = synonyms;
    }

    /**
     * @maxItems 30
     */
    @Size(max = 30)
    @JsonProperty("tags")
    private List<String> tags;

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    /**
     * 业务域，如 学籍 / 排课 / 考勤 / 报销 / 招聘
     */
    @JsonProperty("businessDomain")
    private String businessDomain;

    public String getBusinessDomain() {
        return businessDomain;
    }

    public void setBusinessDomain(String businessDomain) {
        this.businessDomain = businessDomain;
    }

    @JsonProperty("aiHint")
    private CommonSemanticAiHint aiHint;

    public CommonSemanticAiHint getAiHint() {
        return aiHint;
    }

    public void setAiHint(CommonSemanticAiHint aiHint) {
        this.aiHint = aiHint;
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
