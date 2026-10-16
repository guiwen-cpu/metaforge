/**
 * 本文件由 tools/gen-entity.mjs 生成，勿手改。
 * 应用 leave_approval · 协议 0.1 · 租户模板 tenant_demo_school
 *
 * 本文件描述的是 **API / BFF 返回形态**，不是库表形态：
 *   - 含平台注入列（租户列 / 时间戳 / 软删除 / 乐观锁版本）
 *   - 含 formula 派生字段，标注 readonly 且不落库
 *   - storage=jsonb 的字段同样是一等属性，由 BFF 与 jsonb 列互转
 *   - required 只表示应用层必须校验；库里一律可空，故非必填属性标为可选且可为 null
 */

/** 请假类型 · 共享枚举 leave_type（6 个取值） */
export type LeaveType = "personal" | "sick" | "annual" | "compensatory" | "marriage" | "maternity";

/** 请假单状态 · 共享枚举 leave_status（6 个取值） */
export type LeaveStatus = "draft" | "pending" | "approved" | "rejected" | "returned" | "cancelled";

/** 紧急程度 · 共享枚举 urgency（4 个取值） */
export type Urgency = "low" | "normal" | "high" | "urgent";

/** 岗位类别 · 共享枚举 employee_position（4 个取值） */
export type EmployeePosition = "teacher" | "admin" | "logistics" | "intern";

/** 附件类型 · 共享枚举 attachment_kind（4 个取值） */
export type AttachmentKind = "image" | "video" | "document" | "other";

/** 审批结论 · 共享枚举 leave_outcome（3 个取值） */
export type LeaveOutcome = "approve" | "reject" | "return";

/** 人员 · employee → edu_employee · 15 个属性（其中 JSONB 内 3 个） */
export interface Employee {
  /** 主键 */
  readonly id: string;
  /** 工号/学号 · 唯一 / 可搜索 */
  readonly employee_no: string;
  /** 姓名 · 可搜索 */
  name: string;
  /** 所属部门 · 可搜索 */
  dept_id: string;
  /** 部门名称 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  dept_name?: string | null;
  /** 手机号 · 敏感 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  phone?: string | null;
  /** 证件号 · 敏感 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  id_card?: string | null;
  /** 身份类型 */
  position?: EmployeePosition | null;
  /** 入学/入职日期 */
  hire_date?: string | null;
  /** 租户列，平台注入，配合 RLS 隔离 */
  tenant_id: string;
  /** 平台注入，ISO8601 带时区 */
  created_at: string;
  /** 平台注入，ISO8601 带时区 */
  updated_at: string;
  /** 平台注入，操作人标识 */
  created_by?: string | null;
  /** 平台注入，操作人标识 */
  updated_by?: string | null;
  /** 软删除标记，平台注入；非空即视为已删除（查询默认过滤） */
  deleted_at?: string | null;
}

/** 请假单 · leave_request → edu_leave_request · 25 个属性（其中 JSONB 内 6 个） */
export interface LeaveRequest {
  /** 主键 */
  readonly id: string;
  /** 申请人 */
  readonly applicant_id: string;
  /** 申请人姓名 · 可搜索 */
  applicant_name?: string | null;
  /** 所属部门 · 可搜索 */
  dept_id: string;
  /** 请假类型 · 可搜索 */
  leave_type: LeaveType;
  /** 开始时间 */
  start_at: string;
  /** 结束时间 */
  end_at: string;
  /** 请假天数 */
  days: number;
  /** 请假事由 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  reason: string;
  /** 紧急程度 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  urgency?: Urgency | null;
  /** 图片佐证 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  images?: string[] | null;
  /** 视频佐证 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  video_proof?: string | null;
  /** 办公文件 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  documents?: string[] | null;
  /** 状态 · 可搜索 */
  status: LeaveStatus;
  /** 流程实例 */
  readonly process_instance_id?: string | null;
  /** 当前节点 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  current_task?: string | null;
  /** 当前审批人 */
  approver_id?: string | null;
  /** 审批完成时间 */
  approved_at?: string | null;
  /** 租户列，平台注入，配合 RLS 隔离 */
  tenant_id: string;
  /** 平台注入，ISO8601 带时区 */
  created_at: string;
  /** 平台注入，ISO8601 带时区 */
  updated_at: string;
  /** 平台注入，操作人标识 */
  created_by?: string | null;
  /** 平台注入，操作人标识 */
  updated_by?: string | null;
  /** 软删除标记，平台注入；非空即视为已删除（查询默认过滤） */
  deleted_at?: string | null;
  /** 乐观锁版本，平台注入；BFF 更新时带版本条件 */
  version: number;
}

/** 附件 · attachment → edu_attachment · 15 个属性（其中 JSONB 内 1 个） */
export interface Attachment {
  /** 主键 */
  readonly id: string;
  /** 业务类型 · 可搜索 */
  biz_type: string;
  /** 业务主键 · 可搜索 */
  biz_id: string;
  /** 文件名 · 可搜索 */
  file_name: string;
  /** OSS 对象键 */
  readonly object_key: string;
  /** MIME */
  mime?: string | null;
  /** 字节数 */
  size: number;
  /** 类别 */
  kind?: AttachmentKind | null;
  /** 文件校验和 · 落 ext JSONB 文档（BFF 负责与 ext 列互转） */
  checksum?: string | null;
  /** 租户列，平台注入，配合 RLS 隔离 */
  tenant_id: string;
  /** 平台注入，ISO8601 带时区 */
  created_at: string;
  /** 平台注入，ISO8601 带时区 */
  updated_at: string;
  /** 平台注入，操作人标识 */
  created_by?: string | null;
  /** 平台注入，操作人标识 */
  updated_by?: string | null;
  /** 软删除标记，平台注入；非空即视为已删除（查询默认过滤） */
  deleted_at?: string | null;
}

/** 实体 key → 行类型。BFF 泛型读写用这个索引。 */
export interface EntityTableMap {
  employee: Employee;
  leave_request: LeaveRequest;
  attachment: Attachment;
}

export type EntityKey = keyof EntityTableMap;
export type RowOf<K extends EntityKey> = EntityTableMap[K];

/** 实体 key → 物理落库信息。BFF 拼 SQL、加租户条件时读这里，避免字符串硬编码。 */
export const ENTITY_META: Record<EntityKey, {
  table: string;
  primaryKey: string;
  tenantColumn: string | null;
  jsonbColumn: string;
  softDeleteColumn: string | null;
}> = {
  employee: {
    table: "edu_employee",
    primaryKey: "id",
    tenantColumn: "tenant_id",
    jsonbColumn: "ext",
    softDeleteColumn: "deleted_at",
  },
  leave_request: {
    table: "edu_leave_request",
    primaryKey: "id",
    tenantColumn: "tenant_id",
    jsonbColumn: "ext",
    softDeleteColumn: "deleted_at",
  },
  attachment: {
    table: "edu_attachment",
    primaryKey: "id",
    tenantColumn: "tenant_id",
    jsonbColumn: "ext",
    softDeleteColumn: "deleted_at",
  },
};
