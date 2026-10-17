// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BundleAppBundle {
    /**
     * 本包遵循的协议版本。运行时拒绝加载高于自身支持版本的主版本号
     * 必填字段（required 且无 default）。
     * @pattern ^\d+\.\d+$
     */
    @NotNull
    @Pattern(regexp = "^\\d+\\.\\d+$")
    @JsonProperty("protocolVersion")
    private String protocolVersion;

    public String getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(String protocolVersion) {
        this.protocolVersion = protocolVersion;
    }

    /**
     * 租户标识。仅出现在信封层，避免每个工件重复携带导致漂移
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("tenantId")
    private String tenantId;

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("app")
    private BundleAppMeta app;

    public BundleAppMeta getApp() {
        return app;
    }

    public void setApp(BundleAppMeta app) {
        this.app = app;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("snapshot")
    private BundleSnapshot snapshot;

    public BundleSnapshot getSnapshot() {
        return snapshot;
    }

    public void setSnapshot(BundleSnapshot snapshot) {
        this.snapshot = snapshot;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("artifacts")
    private BundleArtifacts artifacts;

    public BundleArtifacts getArtifacts() {
        return artifacts;
    }

    public void setArtifacts(BundleArtifacts artifacts) {
        this.artifacts = artifacts;
    }

    @JsonProperty("assets")
    private List<CommonAssetRef> assets;

    public List<CommonAssetRef> getAssets() {
        return assets;
    }

    public void setAssets(List<CommonAssetRef> assets) {
        this.assets = assets;
    }

    @JsonProperty("navigation")
    private BundleNavigation navigation;

    public BundleNavigation getNavigation() {
        return navigation;
    }

    public void setNavigation(BundleNavigation navigation) {
        this.navigation = navigation;
    }

    @JsonProperty("publish")
    private BundlePublishConfig publish;

    public BundlePublishConfig getPublish() {
        return publish;
    }

    public void setPublish(BundlePublishConfig publish) {
        this.publish = publish;
    }

    /**
     * 工件路径 -> 校验和。用于完整性校验与「内容未变不重复发布」判定
     */
    @JsonProperty("checksums")
    private Map<String, CommonChecksum> checksums;

    public Map<String, CommonChecksum> getChecksums() {
        return checksums;
    }

    public void setChecksums(Map<String, CommonChecksum> checksums) {
        this.checksums = checksums;
    }

    @JsonProperty("meta")
    private BundleMeta meta;

    public BundleMeta getMeta() {
        return meta;
    }

    public void setMeta(BundleMeta meta) {
        this.meta = meta;
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
