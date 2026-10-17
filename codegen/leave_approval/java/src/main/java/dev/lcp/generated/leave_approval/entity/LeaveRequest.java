package dev.lcp.generated.leave_approval.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.generated.leave_approval.support.LcpEnumRef;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 请假单 · leave_request → edu_leave_request
 * 记录一次请假申请及其审批结果
 *
 * 本类描述 **数据平面行形态**（不是 API 视图）：含平台注入列，不含 formula 派生字段。
 * storage=jsonb 的字段是 record 的一等属性，由 BffJsonbMapper 与 jsonb 列互转，业务代码无感。
 * 列在库里一律可空：required 只映射为 @NotNull 作应用层强校验，不是数据库 NOT NULL。
 * 属性 25 个（JSONB 内 6 个，派生 0 个未生成）
 */
public record LeaveRequest(
    /** 主键 */
    @NotNull
    String id,

    /** 申请人 */
    @JsonProperty("applicant_id")
    @NotNull
    String applicantId,

    /** 申请人姓名 · 可搜索 */
    @JsonProperty("applicant_name")
    @Size(max = 64)
    String applicantName,

    /** 所属部门 · 可搜索 */
    @JsonProperty("dept_id")
    @NotNull
    @Size(max = 26)
    String deptId,

    /** 请假类型 · 可搜索 */
    @JsonProperty("leave_type")
    @NotNull
    @LcpEnumRef(value = "leave_type", values = { "personal", "sick", "annual", "compensatory", "marriage", "maternity" })
    String leaveType,

    /** 开始时间 */
    @JsonProperty("start_at")
    @NotNull
    OffsetDateTime startAt,

    /** 结束时间 */
    @JsonProperty("end_at")
    @NotNull
    OffsetDateTime endAt,

    /** 请假天数 */
    @NotNull
    @DecimalMin("0.5")
    @DecimalMax("90")
    BigDecimal days,

    /** 请假事由 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @NotNull
    @Size(min = 10)
    String reason,

    /** 紧急程度 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @LcpEnumRef(value = "urgency", values = { "low", "normal", "high", "urgent" })
    String urgency,

    /** 图片佐证 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    List<String> images,

    /** 视频佐证 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @JsonProperty("video_proof")
    String videoProof,

    /** 办公文件 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    List<String> documents,

    /** 状态 · 可搜索 */
    @NotNull
    @LcpEnumRef(value = "leave_status", values = { "draft", "pending", "approved", "rejected", "returned", "cancelled" })
    String status,

    /** 流程实例 */
    @JsonProperty("process_instance_id")
    @Size(max = 64)
    String processInstanceId,

    /** 当前节点 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @JsonProperty("current_task")
    @Size(max = 64)
    String currentTask,

    /** 当前审批人 */
    @JsonProperty("approver_id")
    @Size(max = 26)
    String approverId,

    /** 审批完成时间 */
    @JsonProperty("approved_at")
    OffsetDateTime approvedAt,

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
    String deletedAt,

    /** 乐观锁版本，平台注入；BFF 更新时带版本条件 */
    @NotNull
    Integer version
) {
}
