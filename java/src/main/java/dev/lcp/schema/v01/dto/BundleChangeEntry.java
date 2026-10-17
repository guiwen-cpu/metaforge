// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.BundleChangeEntryKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class BundleChangeEntry {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("kind")
    private BundleChangeEntryKind kind;

    public BundleChangeEntryKind getKind() {
        return kind;
    }

    public void setKind(BundleChangeEntryKind kind) {
        this.kind = kind;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("artifactKind")
    private String artifactKind;

    public String getArtifactKind() {
        return artifactKind;
    }

    public void setArtifactKind(String artifactKind) {
        this.artifactKind = artifactKind;
    }

    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    @JsonProperty("summary")
    private String summary;

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    /**
     * 破坏性变更需人工确认才能发布
     * @default false
     */
    @JsonProperty("breaking")
    private Boolean breaking;

    public Boolean getBreaking() {
        return breaking;
    }

    public void setBreaking(Boolean breaking) {
        this.breaking = breaking;
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
