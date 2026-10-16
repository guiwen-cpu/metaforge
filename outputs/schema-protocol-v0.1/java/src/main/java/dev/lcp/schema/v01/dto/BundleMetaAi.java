// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.util.List;

/**
 * AI 参与的记录。为生成质量度量与人工修正回流保留数据
 */
public class BundleMetaAi {
    /**
     * 由 AI 生成并保留至今的工件路径
     */
    @JsonProperty("generatedParts")
    private List<String> generatedParts;

    public List<String> getGeneratedParts() {
        return generatedParts;
    }

    public void setGeneratedParts(List<String> generatedParts) {
        this.generatedParts = generatedParts;
    }

    @JsonProperty("model")
    private String model;

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    @JsonProperty("prompt")
    private String prompt;

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    /**
     * @minimum 0
     * @maximum 1
     */
    @DecimalMin("0")
    @DecimalMax("1")
    @JsonProperty("humanEditedRatio")
    private BigDecimal humanEditedRatio;

    public BigDecimal getHumanEditedRatio() {
        return humanEditedRatio;
    }

    public void setHumanEditedRatio(BigDecimal humanEditedRatio) {
        this.humanEditedRatio = humanEditedRatio;
    }

    /**
     * 生成该应用的 AI 服务标识，如 lcp-ai/0.1.0；人工手写填 human
     */
    @JsonProperty("generator")
    private String generator;

    public String getGenerator() {
        return generator;
    }

    public void setGenerator(String generator) {
        this.generator = generator;
    }

    /**
     * 本应用中用到/开放的 AI 生成能力，如 form-from-text
     */
    @JsonProperty("capabilities")
    private List<String> capabilities;

    public List<String> getCapabilities() {
        return capabilities;
    }

    public void setCapabilities(List<String> capabilities) {
        this.capabilities = capabilities;
    }

    @JsonProperty("note")
    private String note;

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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
