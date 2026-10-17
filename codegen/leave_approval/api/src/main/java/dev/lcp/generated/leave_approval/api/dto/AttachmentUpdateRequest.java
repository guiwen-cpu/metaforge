package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.NotNull;

/**
 * attachment 的更新请求体（PUT = 列整体替换 + JSONB 浅合并）。
 * immutable 字段不在其中：服务端会忽略对它们的修改。
 * 本实体未开启乐观锁，不带 version。
 */
public record AttachmentUpdateRequest(
    /** 业务类型 */
    @NotNull
    String bizType,
    /** 业务主键 */
    @NotNull
    String bizId,
    /** 文件名 */
    @NotNull
    String fileName,
    /** MIME */
    String mime,
    /** 字节数 */
    @NotNull
    Integer size,
    /** 类别 */
    String kind,
    /** 文件校验和 · 落 JSONB */
    String checksum
) {
}
