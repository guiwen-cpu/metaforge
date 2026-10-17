package dev.lcp.generated.leave_approval.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/**
 * employee 的更新请求体（PUT = 整体替换）。
 * immutable 字段不在其中：服务端会忽略对它们的修改。
 * 本实体未开启乐观锁，不带 version。
 */
public record EmployeeUpdateRequest(
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
