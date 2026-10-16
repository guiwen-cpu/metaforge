package dev.lcp.generated.leave_approval.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.generated.leave_approval.support.LcpEnumRef;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 附件 · attachment → edu_attachment
 * 统一附件中心，所有业务的文件元数据都落这里
 *
 * 本类描述 **数据平面行形态**（不是 API 视图）：含平台注入列，不含 formula 派生字段。
 * storage=jsonb 的字段是 record 的一等属性，由 BffJsonbMapper 与 jsonb 列互转，业务代码无感。
 * 列在库里一律可空：required 只映射为 @NotNull 作应用层强校验，不是数据库 NOT NULL。
 * 属性 15 个（JSONB 内 1 个，派生 0 个未生成）
 */
public record Attachment(
    /** 主键 */
    @NotNull
    String id,

    /** 业务类型 · 可搜索 */
    @JsonProperty("biz_type")
    @NotNull
    @Size(max = 64)
    String bizType,

    /** 业务主键 · 可搜索 */
    @JsonProperty("biz_id")
    @NotNull
    @Size(max = 26)
    String bizId,

    /** 文件名 · 可搜索 */
    @JsonProperty("file_name")
    @NotNull
    @Size(max = 255)
    String fileName,

    /** OSS 对象键 */
    @JsonProperty("object_key")
    @NotNull
    @Size(max = 512)
    String objectKey,

    /** MIME */
    @Size(max = 128)
    String mime,

    /** 字节数 */
    @NotNull
    Integer size,

    /** 类别 */
    @LcpEnumRef(value = "attachment_kind", values = { "image", "video", "document", "other" })
    String kind,

    /** 文件校验和 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @Size(max = 128)
    String checksum,

    /** 租户列，平台注入，配合 RLS 隔离 */
    @JsonProperty("tenant_id")
    @NotNull
    String tenantId,

    /** 平台注入，ISO8601 带时区 */
    @JsonProperty("created_at")
    @NotNull
    String createdAt,

    /** 平台注入，ISO8601 带时区 */
    @JsonProperty("updated_at")
    @NotNull
    String updatedAt,

    /** 平台注入，操作人标识 */
    @JsonProperty("created_by")
    String createdBy,

    /** 平台注入，操作人标识 */
    @JsonProperty("updated_by")
    String updatedBy,

    /** 软删除标记，平台注入；非空即视为已删除（查询默认过滤） */
    @JsonProperty("deleted_at")
    String deletedAt
) {
}
