package dev.lcp.generated.leave_approval.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.generated.leave_approval.support.LcpEnumRef;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * 人员 · employee → edu_employee
 * 组织内的学生与教职工主数据
 *
 * 本类描述 **数据平面行形态**（不是 API 视图）：含平台注入列，不含 formula 派生字段。
 * storage=jsonb 的字段是 record 的一等属性，由 BffJsonbMapper 与 jsonb 列互转，业务代码无感。
 * 列在库里一律可空：required 只映射为 @NotNull 作应用层强校验，不是数据库 NOT NULL。
 * 属性 15 个（JSONB 内 3 个，派生 0 个未生成）
 */
public record Employee(
    /** 主键 */
    @NotNull
    String id,

    /** 工号/学号 · 唯一 / 可搜索 */
    @JsonProperty("employee_no")
    @NotNull
    @Size(max = 32)
    String employeeNo,

    /** 姓名 · 可搜索 */
    @NotNull
    @Size(max = 64)
    String name,

    /** 所属部门 · 可搜索 */
    @JsonProperty("dept_id")
    @NotNull
    @Size(max = 26)
    String deptId,

    /** 部门名称 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @JsonProperty("dept_name")
    @Size(max = 128)
    String deptName,

    /** 手机号 · 敏感 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @Size(max = 20)
    @Pattern(regexp = "^1[3-9]\\d{9}$")
    String phone,

    /** 证件号 · 敏感 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
    @JsonProperty("id_card")
    @Size(max = 32)
    String idCard,

    /** 身份类型 */
    @LcpEnumRef(value = "employee_position", values = { "teacher", "admin", "logistics", "intern" })
    String position,

    /** 入学/入职日期 */
    @JsonProperty("hire_date")
    LocalDate hireDate,

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
