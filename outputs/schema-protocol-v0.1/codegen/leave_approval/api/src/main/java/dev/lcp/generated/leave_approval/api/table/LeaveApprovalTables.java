package dev.lcp.generated.leave_approval.api.table;

import dev.lcp.generated.leave_approval.api.support.LcpColumn;
import dev.lcp.generated.leave_approval.api.support.LcpTableSpec;
import java.util.List;

/**
 * 运行期表元数据。列名、平台列、可搜索 / 可排序 / 敏感字段全部从 Schema 编译而来，
 * 与 sql/ 下的 DDL、ts/entities.ts 同源 —— 改 Schema 后重跑生成器，不要手改本文件。
 */
public final class LeaveApprovalTables {

  private LeaveApprovalTables() {
  }

  /** 人员 · edu_employee · /api/v1/leave_approval/employee */
  public static final LcpTableSpec EMPLOYEE = new LcpTableSpec(
      "employee",
      "edu_employee",
      "/api/v1/leave_approval/employee",
      "ulid",
      new LcpTableSpec.PlatformColumns(
          "id", "tenant_id", "ext", "deleted_at", null,
          "created_at", "updated_at", "created_by", "updated_by"),
      List.of(
          LcpColumn.of("id", "string", "req,imm"),
          LcpColumn.of("employee_no", "string", "req,imm,search,sort"),
          LcpColumn.of("name", "string", "req,search"),
          LcpColumn.of("dept_id", "string", "req,search"),
          LcpColumn.of("dept_name", "string", "jsonb"),
          LcpColumn.of("phone", "string", "jsonb,sens"),
          LcpColumn.of("id_card", "string", "jsonb,sens"),
          LcpColumn.of("position", "enum", ""),
          LcpColumn.of("hire_date", "date", "sort")
      ));

  /** 请假单 · edu_leave_request · /api/v1/leave_approval/leave_request */
  public static final LcpTableSpec LEAVE_REQUEST = new LcpTableSpec(
      "leave_request",
      "edu_leave_request",
      "/api/v1/leave_approval/leave_request",
      "ulid",
      new LcpTableSpec.PlatformColumns(
          "id", "tenant_id", "ext", "deleted_at", "version",
          "created_at", "updated_at", "created_by", "updated_by"),
      List.of(
          LcpColumn.of("id", "string", "req,imm"),
          LcpColumn.of("applicant_id", "ref", "req,imm"),
          LcpColumn.of("applicant_name", "string", "search,sort"),
          LcpColumn.of("dept_id", "string", "req,search"),
          LcpColumn.of("leave_type", "enum", "req,search"),
          LcpColumn.of("start_at", "datetime", "req,sort"),
          LcpColumn.of("end_at", "datetime", "req,sort"),
          LcpColumn.of("days", "decimal", "req,sort"),
          LcpColumn.of("reason", "text", "jsonb,req"),
          LcpColumn.of("urgency", "enum", "jsonb"),
          LcpColumn.of("images", "array", "jsonb"),
          LcpColumn.of("video_proof", "video", "jsonb"),
          LcpColumn.of("documents", "array", "jsonb"),
          LcpColumn.of("status", "enum", "req,search,sort"),
          LcpColumn.of("process_instance_id", "string", "imm"),
          LcpColumn.of("current_task", "string", "jsonb"),
          LcpColumn.of("approver_id", "string", ""),
          LcpColumn.of("approved_at", "datetime", "sort")
      ));

  /** 附件 · edu_attachment · /api/v1/leave_approval/attachment */
  public static final LcpTableSpec ATTACHMENT = new LcpTableSpec(
      "attachment",
      "edu_attachment",
      "/api/v1/leave_approval/attachment",
      "ulid",
      new LcpTableSpec.PlatformColumns(
          "id", "tenant_id", "ext", "deleted_at", null,
          "created_at", "updated_at", "created_by", "updated_by"),
      List.of(
          LcpColumn.of("id", "string", "req,imm"),
          LcpColumn.of("biz_type", "string", "req,search"),
          LcpColumn.of("biz_id", "string", "req,search"),
          LcpColumn.of("file_name", "string", "req,search"),
          LcpColumn.of("object_key", "string", "req,imm"),
          LcpColumn.of("mime", "string", ""),
          LcpColumn.of("size", "integer", "req"),
          LcpColumn.of("kind", "enum", ""),
          LcpColumn.of("checksum", "string", "jsonb")
      ));
}
