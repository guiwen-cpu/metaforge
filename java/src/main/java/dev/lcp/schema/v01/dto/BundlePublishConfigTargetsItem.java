// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.BundlePublishConfigTargetsItemPlatform;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public class BundlePublishConfigTargetsItem {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("platform")
    private BundlePublishConfigTargetsItemPlatform platform;

    public BundlePublishConfigTargetsItemPlatform getPlatform() {
        return platform;
    }

    public void setPlatform(BundlePublishConfigTargetsItemPlatform platform) {
        this.platform = platform;
    }

    /**
     * @default true
     */
    @JsonProperty("enabled")
    private Boolean enabled;

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    @JsonProperty("config")
    private Map<String, JsonNode> config;

    public Map<String, JsonNode> getConfig() {
        return config;
    }

    public void setConfig(Map<String, JsonNode> config) {
        this.config = config;
    }

    @JsonProperty("minVersion")
    private String minVersion;

    public String getMinVersion() {
        return minVersion;
    }

    public void setMinVersion(String minVersion) {
        this.minVersion = minVersion;
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
