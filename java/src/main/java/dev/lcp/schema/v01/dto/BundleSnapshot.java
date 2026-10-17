// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.BundleSnapshotStatus;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 快照元数据。version 单调递增，回滚不覆盖历史（rollbackOf 指向被回滚到的版本），使审计链完整。
 */
public class BundleSnapshot {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("snapshotId")
    private String snapshotId;

    public String getSnapshotId() {
        return snapshotId;
    }

    public void setSnapshotId(String snapshotId) {
        this.snapshotId = snapshotId;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("version")
    private Integer version;

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    /**
     * 父快照 id。首版缺省
     */
    @JsonProperty("basedOn")
    private String basedOn;

    public String getBasedOn() {
        return basedOn;
    }

    public void setBasedOn(String basedOn) {
        this.basedOn = basedOn;
    }

    /**
     * 必填字段（required 且无 default）。
     * @format date-time
     */
    @NotNull
    @JsonProperty("createdAt")
    private OffsetDateTime createdAt;

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("author")
    private BundleActor author;

    public BundleActor getAuthor() {
        return author;
    }

    public void setAuthor(BundleActor author) {
        this.author = author;
    }

    /**
     * 变更说明。发布必须填写 —— 没有它版本管理形同虚设
     * @maxLength 500
     */
    @Size(max = 500)
    @JsonProperty("message")
    private String message;

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    /**
     * @default "draft"
     */
    @JsonProperty("status")
    private BundleSnapshotStatus status;

    public BundleSnapshotStatus getStatus() {
        return status;
    }

    public void setStatus(BundleSnapshotStatus status) {
        this.status = status;
    }

    @JsonProperty("tags")
    private List<String> tags;

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    /**
     * @format date-time
     */
    @JsonProperty("publishedAt")
    private OffsetDateTime publishedAt;

    public OffsetDateTime getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(OffsetDateTime publishedAt) {
        this.publishedAt = publishedAt;
    }

    @JsonProperty("publishedBy")
    private BundleActor publishedBy;

    public BundleActor getPublishedBy() {
        return publishedBy;
    }

    public void setPublishedBy(BundleActor publishedBy) {
        this.publishedBy = publishedBy;
    }

    /**
     * 本快照是从哪个历史快照回滚而来
     */
    @JsonProperty("rollbackOf")
    private String rollbackOf;

    public String getRollbackOf() {
        return rollbackOf;
    }

    public void setRollbackOf(String rollbackOf) {
        this.rollbackOf = rollbackOf;
    }

    /**
     * 结构化变更摘要，供发布评审与回滚影响分析
     */
    @JsonProperty("changeSummary")
    private List<BundleChangeEntry> changeSummary;

    public List<BundleChangeEntry> getChangeSummary() {
        return changeSummary;
    }

    public void setChangeSummary(List<BundleChangeEntry> changeSummary) {
        this.changeSummary = changeSummary;
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
