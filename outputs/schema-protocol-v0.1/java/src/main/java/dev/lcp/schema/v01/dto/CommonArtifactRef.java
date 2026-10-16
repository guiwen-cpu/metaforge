// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.CommonArtifactRefKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 跨工件引用。version 缺省时解析到所属 snapshot 内该工件的版本 —— 这是「一次发布 = 一个原子快照」的实现基础。
 */
public class CommonArtifactRef {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("kind")
    private CommonArtifactRefKind kind;

    public CommonArtifactRefKind getKind() {
        return kind;
    }

    public void setKind(CommonArtifactRefKind kind) {
        this.kind = kind;
    }

    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    @JsonProperty("version")
    private Integer version;

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    /**
     * 跨快照引用。仅模板市场导入 / 应用市场安装场景允许；运行时一律拒绝。L1 校验强制。
     */
    @JsonProperty("snapshotId")
    private String snapshotId;

    public String getSnapshotId() {
        return snapshotId;
    }

    public void setSnapshotId(String snapshotId) {
        this.snapshotId = snapshotId;
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

    /** 至少提供一组字段：id 或 key（对齐 Schema 的 anyOf 约束）。 */
    @AssertTrue(message = "至少提供一组字段：id 或 key")
    @JsonIgnore
    public boolean isConstraintSatisfied() {
        return (id != null) || (key != null);
    }
}
