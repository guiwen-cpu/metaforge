package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * leave_request 的更新请求体（PUT = 整体替换）。
 * immutable 字段不在其中：服务端会忽略对它们的修改。
 * 带 version，更新时以 version 作并发条件。
 */
public record LeaveRequestUpdateRequest(
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
    /** 当前节点 · 落 JSONB */
    String currentTask,
    /** 当前审批人 */
    String approverId,
    /** 审批完成时间 */
    OffsetDateTime approvedAt,
    /** 乐观锁版本，从上次读取的实体里原样带回；不带则返回 428 */
    Integer version
) {
}
