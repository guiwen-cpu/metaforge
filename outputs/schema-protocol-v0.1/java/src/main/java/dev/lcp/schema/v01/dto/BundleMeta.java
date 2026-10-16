// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BundleMeta {
    /**
     * 产出该包的工具与版本，如 lcp-designer/0.1.0
     */
    @JsonProperty("generator")
    private String generator;

    public String getGenerator() {
        return generator;
    }

    public void setGenerator(String generator) {
        this.generator = generator;
    }

    @JsonProperty("createdWith")
    private String createdWith;

    public String getCreatedWith() {
        return createdWith;
    }

    public void setCreatedWith(String createdWith) {
        this.createdWith = createdWith;
    }

    @JsonProperty("docs")
    private String docs;

    public String getDocs() {
        return docs;
    }

    public void setDocs(String docs) {
        this.docs = docs;
    }

    @JsonProperty("changelog")
    private List<String> changelog;

    public List<String> getChangelog() {
        return changelog;
    }

    public void setChangelog(List<String> changelog) {
        this.changelog = changelog;
    }

    /**
     * AI 参与的记录。为生成质量度量与人工修正回流保留数据
     */
    @JsonProperty("ai")
    private BundleMetaAi ai;

    public BundleMetaAi getAi() {
        return ai;
    }

    public void setAi(BundleMetaAi ai) {
        this.ai = ai;
    }

    /**
     * 模板市场元数据。安装时以快照为源，安装后与原模板解耦（可选择接收升级）
     */
    @JsonProperty("marketplace")
    private BundleMetaMarketplace marketplace;

    public BundleMetaMarketplace getMarketplace() {
        return marketplace;
    }

    public void setMarketplace(BundleMetaMarketplace marketplace) {
        this.marketplace = marketplace;
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
