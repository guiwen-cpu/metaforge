package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * leave_request 的创建请求体。
 * 只含业务字段：主键由平台生成，租户 / 时间戳 / 操作人 / 版本 / 删除标记一律由服务端注入。
 * required 映射为 @NotNull；validators 能映射的映射为 Bean Validation，不能映射的见生成告警。
 */
public record LeaveRequestCreateRequest(
    /** 申请人 · 创建后不可改 */
    @NotNull
    String applicantId,
    /** 申请人姓名 */
    String applicantName,
    /** 所属部门 */
    @NotNull
    String deptId,
    /** 请假类型 */
    @NotNull
    String leaveType,
    /** 开始时间 */
    @NotNull
    OffsetDateTime startAt,
    /** 结束时间 */
    @NotNull
    OffsetDateTime endAt,
    /** 请假天数 */
    @NotNull
    @DecimalMin(value = "0.5", message = "单次请假需在 0.5 至 90 天之间")
    @DecimalMax(value = "90", message = "单次请假需在 0.5 至 90 天之间")
    BigDecimal days,
    /** 请假事由 · 落 JSONB */
    @NotNull
    @Size(min = 10)
    String reason,
    /** 紧急程度 · 落 JSONB */
    String urgency,
    /** 图片佐证 · 落 JSONB */
    List<String> images,
    /** 视频佐证 · 落 JSONB */
    String videoProof,
    /** 办公文件 · 落 JSONB */
    List<String> documents,
    /** 状态 */
    @NotNull
    String status,
    /** 流程实例 · 创建后不可改 */
    String processInstanceId,
    /** 当前节点 · 落 JSONB */
    String currentTask,
    /** 当前审批人 */
    String approverId,
    /** 审批完成时间 */
    OffsetDateTime approvedAt
) {
}
