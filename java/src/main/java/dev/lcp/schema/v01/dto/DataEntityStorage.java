// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.DataEntityStorageIdType;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 物理落库策略。多租户与软删除由平台统一注入，业务 Schema 不得覆盖 tenantColumn 的取值方式。
 */
public class DataEntityStorage {
    /**
     * @default "id"
     */
    @JsonProperty("primaryKey")
    private String primaryKey;

    public String getPrimaryKey() {
        return primaryKey;
    }

    public void setPrimaryKey(String primaryKey) {
        this.primaryKey = primaryKey;
    }

    /**
     * ulid 天然有序，作为聚簇主键对 PG 最友好
     * @default "ulid"
     */
    @JsonProperty("idType")
    private DataEntityStorageIdType idType;

    public DataEntityStorageIdType getIdType() {
        return idType;
    }

    public void setIdType(DataEntityStorageIdType idType) {
        this.idType = idType;
    }

    /**
     * null 表示该实体为全局共享表（仅 system scope 允许）
     * @default "tenant_id"
     */
    @JsonProperty("tenantColumn")
    private String tenantColumn;

    public String getTenantColumn() {
        return tenantColumn;
    }

    public void setTenantColumn(String tenantColumn) {
        this.tenantColumn = tenantColumn;
    }

    /**
     * 承载 storage=jsonb 字段的列
     * @default "ext"
     */
    @JsonProperty("jsonbColumn")
    private String jsonbColumn;

    public String getJsonbColumn() {
        return jsonbColumn;
    }

    public void setJsonbColumn(String jsonbColumn) {
        this.jsonbColumn = jsonbColumn;
    }

    @JsonProperty("softDelete")
    private DataEntityStorageSoftDelete softDelete;

    public DataEntityStorageSoftDelete getSoftDelete() {
        return softDelete;
    }

    public void setSoftDelete(DataEntityStorageSoftDelete softDelete) {
        this.softDelete = softDelete;
    }

    @JsonProperty("timestamps")
    private DataEntityStorageTimestamps timestamps;

    public DataEntityStorageTimestamps getTimestamps() {
        return timestamps;
    }

    public void setTimestamps(DataEntityStorageTimestamps timestamps) {
        this.timestamps = timestamps;
    }

    /**
     * 开启后追加 version 列，BFF 更新时自动带版本条件
     * @default false
     */
    @JsonProperty("optimisticLock")
    private Boolean optimisticLock;

    public Boolean getOptimisticLock() {
        return optimisticLock;
    }

    public void setOptimisticLock(Boolean optimisticLock) {
        this.optimisticLock = optimisticLock;
    }

    /**
     * 开启后所有写入落审计表，审批流场景建议开启
     * @default false
     */
    @JsonProperty("auditLog")
    private Boolean auditLog;

    public Boolean getAuditLog() {
        return auditLog;
    }

    public void setAuditLog(Boolean auditLog) {
        this.auditLog = auditLog;
    }

    /**
     * 分区列，如按学年 semester 分区
     */
    @JsonProperty("partitionBy")
    private String partitionBy;

    public String getPartitionBy() {
        return partitionBy;
    }

    public void setPartitionBy(String partitionBy) {
        this.partitionBy = partitionBy;
    }

    @JsonProperty("comment")
    private String comment;

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
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
