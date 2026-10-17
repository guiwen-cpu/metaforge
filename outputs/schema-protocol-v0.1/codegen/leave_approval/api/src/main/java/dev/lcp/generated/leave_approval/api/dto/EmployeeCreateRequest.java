package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/**
 * employee 的创建请求体。
 * 只含业务字段：主键由平台生成，租户 / 时间戳 / 操作人 / 版本 / 删除标记一律由服务端注入。
 * required 映射为 @NotNull；validators 能映射的映射为 Bean Validation，不能映射的见生成告警。
 */
public record EmployeeCreateRequest(
    /** 工号/学号 · 创建后不可改 */
    @NotNull
    String employeeNo,
    /** 姓名 */
    @NotNull
    String name,
    /** 所属部门 */
    @NotNull
    String deptId,
    /** 部门名称 · 落 JSONB */
    String deptName,
    /** 手机号 · 敏感 · 落 JSONB */
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    String phone,
    /** 证件号 · 敏感 · 落 JSONB */
    String idCard,
    /** 身份类型 */
    String position,
    /** 入学/入职日期 */
    LocalDate hireDate
) {
}
