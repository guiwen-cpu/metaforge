// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiOriginGenerator;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * 生成溯源。记录 layout 从何而来，使模板升级与 AI 重生成可幂等重放，同时为 AI 生成质量留可观测数据。
 */
public class UiOrigin {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("generator")
    private UiOriginGenerator generator;

    public UiOriginGenerator getGenerator() {
        return generator;
    }

    public void setGenerator(UiOriginGenerator generator) {
        this.generator = generator;
    }

    @JsonProperty("templateId")
    private String templateId;

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    @JsonProperty("templateVersion")
    private Integer templateVersion;

    public Integer getTemplateVersion() {
        return templateVersion;
    }

    public void setTemplateVersion(Integer templateVersion) {
        this.templateVersion = templateVersion;
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
     * AI 生成时的模型标识
     */
    @JsonProperty("model")
    private String model;

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    /**
     * AI 生成时的原始自然语言输入，用于复现与人工修正回流
     */
    @JsonProperty("prompt")
    private String prompt;

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    /**
     * @format date-time
     */
    @JsonProperty("generatedAt")
    private OffsetDateTime generatedAt;

    public OffsetDateTime getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(OffsetDateTime generatedAt) {
        this.generatedAt = generatedAt;
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
