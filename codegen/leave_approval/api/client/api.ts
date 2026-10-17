/**
 * 本文件由 tools/gen-api.mjs 生成，勿手改。
 * 应用 leave_approval · 与 java/ 下的 Controller 一一对应：路由、查询参数、请求体字段全部同源。
 *
 * 返回类型直接用 ts/entities.ts 的行类型：服务端投影的键就是 Schema 的字段 key（snake_case），
 * 所以这里不需要再做一层字段名映射。
 */
import type { Employee, LeaveRequest, Attachment } from "../../ts/entities";

/** 分页结果。pages 由服务端算好。 */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** 只依赖这一个接口：axios / fetch / uni.request 都能在上面加 10 行适配。 */
export interface HttpClient {
  request<T>(config: {
    url: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    data?: unknown;
    signal?: AbortSignal;
  }): Promise<T>;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/** 默认挂在同域 BFF 下；跨域部署时给 createApi 传 baseUrl。 */
export const DEFAULT_BASE_URL = "/api/v1";

/** 跳过 undefined / null / 空串 —— 空筛选条件不该出现在 URL 里。 */
function queryString(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** 人员 · /api/v1/leave_approval/employee */
export interface EmployeeQuery {
  page?: number;
  size?: number;
  sort?: "employee_no" | "hire_date";
  order?: "asc" | "desc";
  q?: string;
  include_deleted?: boolean;
  position?: Employee["position"];
  hire_date_from?: Employee["hire_date"];
  hire_date_to?: Employee["hire_date"];
}

export type EmployeeCreate = Pick<Employee, "employee_no" | "name" | "dept_id" | "dept_name" | "phone" | "id_card" | "position" | "hire_date">;
export type EmployeeUpdate = Pick<Employee, "name" | "dept_id" | "dept_name" | "phone" | "id_card" | "position" | "hire_date">;

/** 请假单 · /api/v1/leave_approval/leave_request */
export interface LeaveRequestQuery {
  page?: number;
  size?: number;
  sort?: "applicant_name" | "start_at" | "end_at" | "days" | "status" | "approved_at";
  order?: "asc" | "desc";
  q?: string;
  include_deleted?: boolean;
  applicant_id?: LeaveRequest["applicant_id"];
  leave_type?: LeaveRequest["leave_type"];
  start_at_from?: LeaveRequest["start_at"];
  start_at_to?: LeaveRequest["start_at"];
  end_at_from?: LeaveRequest["end_at"];
  end_at_to?: LeaveRequest["end_at"];
  days_from?: LeaveRequest["days"];
  days_to?: LeaveRequest["days"];
  status?: LeaveRequest["status"];
  approved_at_from?: LeaveRequest["approved_at"];
  approved_at_to?: LeaveRequest["approved_at"];
}

export type LeaveRequestCreate = Pick<LeaveRequest, "applicant_id" | "applicant_name" | "dept_id" | "leave_type" | "start_at" | "end_at" | "days" | "reason" | "urgency" | "images" | "video_proof" | "documents" | "status" | "process_instance_id" | "current_task" | "approver_id" | "approved_at">;
export type LeaveRequestUpdate = Pick<LeaveRequest, "applicant_name" | "dept_id" | "leave_type" | "start_at" | "end_at" | "days" | "reason" | "urgency" | "images" | "video_proof" | "documents" | "status" | "current_task" | "approver_id" | "approved_at"> & { version?: number };

/** 附件 · /api/v1/leave_approval/attachment */
export interface AttachmentQuery {
  page?: number;
  size?: number;
  sort?: never;
  order?: "asc" | "desc";
  q?: string;
  include_deleted?: boolean;
  size_from?: Attachment["size"];
  size_to?: Attachment["size"];
  kind?: Attachment["kind"];
}

export type AttachmentCreate = Pick<Attachment, "biz_type" | "biz_id" | "file_name" | "object_key" | "mime" | "size" | "kind" | "checksum">;
export type AttachmentUpdate = Pick<Attachment, "biz_type" | "biz_id" | "file_name" | "mime" | "size" | "kind" | "checksum">;

export interface LeaveApprovalApi {
  employee: {
    list(query?: EmployeeQuery, options?: RequestOptions): Promise<PageResult<Employee>>;
    get(id: string, options?: RequestOptions): Promise<Employee>;
    create(body: EmployeeCreate, options?: RequestOptions): Promise<Employee>;
    update(id: string, body: EmployeeUpdate, options?: RequestOptions): Promise<Employee>;
    remove(id: string, options?: RequestOptions): Promise<void>;
  };
  leave_request: {
    list(query?: LeaveRequestQuery, options?: RequestOptions): Promise<PageResult<LeaveRequest>>;
    get(id: string, options?: RequestOptions): Promise<LeaveRequest>;
    create(body: LeaveRequestCreate, options?: RequestOptions): Promise<LeaveRequest>;
    update(id: string, body: LeaveRequestUpdate, options?: RequestOptions): Promise<LeaveRequest>;
    remove(id: string, options?: RequestOptions): Promise<void>;
  };
  attachment: {
    list(query?: AttachmentQuery, options?: RequestOptions): Promise<PageResult<Attachment>>;
    get(id: string, options?: RequestOptions): Promise<Attachment>;
    create(body: AttachmentCreate, options?: RequestOptions): Promise<Attachment>;
    update(id: string, body: AttachmentUpdate, options?: RequestOptions): Promise<Attachment>;
    remove(id: string, options?: RequestOptions): Promise<void>;
  };
}

export function createLeaveApprovalApi(http: HttpClient, baseUrl: string = DEFAULT_BASE_URL): LeaveApprovalApi {
  const base = (key: string) => `${baseUrl}/leave_approval/${key}`;
  const itemUrl = (key: string, id: string) => `${base(key)}/${encodeURIComponent(id)}`;
  return {
    employee: {
      list: (query, options) =>
        http.request<PageResult<Employee>>({ url: base("employee") + queryString(query as Record<string, unknown> | undefined), method: "GET", signal: options?.signal }),
      get: (id, options) =>
        http.request<Employee>({ url: itemUrl("employee", id), method: "GET", signal: options?.signal }),
      create: (body, options) =>
        http.request<Employee>({ url: base("employee"), method: "POST", data: body, signal: options?.signal }),
      update: (id, body, options) =>
        http.request<Employee>({ url: itemUrl("employee", id), method: "PUT", data: body, signal: options?.signal }),
      remove: (id, options) =>
        http.request<void>({ url: itemUrl("employee", id), method: "DELETE", signal: options?.signal }),
    },
    leave_request: {
      list: (query, options) =>
        http.request<PageResult<LeaveRequest>>({ url: base("leave_request") + queryString(query as Record<string, unknown> | undefined), method: "GET", signal: options?.signal }),
      get: (id, options) =>
        http.request<LeaveRequest>({ url: itemUrl("leave_request", id), method: "GET", signal: options?.signal }),
      create: (body, options) =>
        http.request<LeaveRequest>({ url: base("leave_request"), method: "POST", data: body, signal: options?.signal }),
      update: (id, body, options) =>
        http.request<LeaveRequest>({ url: itemUrl("leave_request", id), method: "PUT", data: body, signal: options?.signal }),
      remove: (id, options) =>
        http.request<void>({ url: itemUrl("leave_request", id), method: "DELETE", signal: options?.signal }),
    },
    attachment: {
      list: (query, options) =>
        http.request<PageResult<Attachment>>({ url: base("attachment") + queryString(query as Record<string, unknown> | undefined), method: "GET", signal: options?.signal }),
      get: (id, options) =>
        http.request<Attachment>({ url: itemUrl("attachment", id), method: "GET", signal: options?.signal }),
      create: (body, options) =>
        http.request<Attachment>({ url: base("attachment"), method: "POST", data: body, signal: options?.signal }),
      update: (id, body, options) =>
        http.request<Attachment>({ url: itemUrl("attachment", id), method: "PUT", data: body, signal: options?.signal }),
      remove: (id, options) =>
        http.request<void>({ url: itemUrl("attachment", id), method: "DELETE", signal: options?.signal }),
    },
  };
}
