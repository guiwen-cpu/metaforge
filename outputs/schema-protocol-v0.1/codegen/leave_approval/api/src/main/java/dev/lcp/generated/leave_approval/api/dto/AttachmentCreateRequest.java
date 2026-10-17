package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.NotNull;

/**
 * attachment 的创建请求体。
 * 只含业务字段：主键由平台生成，租户 / 时间戳 / 操作人 / 版本 / 删除标记一律由服务端注入。
 * required 映射为 @NotNull；validators 能映射的映射为 Bean Validation，不能映射的见生成告警。
 */
public record AttachmentCreateRequest(
    /** 业务类型 */
    @NotNull
    String bizType,
    /** 业务主键 */
    @NotNull
    String bizId,
    /** 文件名 */
    @NotNull
    String fileName,
    /** OSS 对象键 · 创建后不可改 */
    @NotNull
    String objectKey,
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
