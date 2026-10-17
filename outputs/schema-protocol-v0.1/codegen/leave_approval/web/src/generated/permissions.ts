/**
 * 本文件由 tools/gen-page.mjs 生成，勿手改。
 * 前端权限只做按钮显隐，服务端 api/permissions.json 才是授权事实来源。
 */
export type Action = "create" | "read" | "update" | "delete" | "export";

export interface RoleInfo {
  key: string;
  name: string;
  dataScope: string;
  description: string;
  inheritFrom: string[];
}

export interface ResourcePermission {
  create?: string[];
  read?: string[];
  update?: string[];
  delete?: string[];
  export?: string[];
}

export const ROLES: RoleInfo[] = [
  {
    "key": "student",
    "name": "学生",
    "dataScope": "self",
    "description": "只能查看与操作本人的请假单",
    "inheritFrom": []
  },
  {
    "key": "teacher",
    "name": "教职工",
    "dataScope": "self",
    "description": "与 student 同权限，区分角色便于按岗位类别配置不同审批链",
    "inheritFrom": []
  },
  {
    "key": "dept_manager",
    "name": "部门负责人",
    "dataScope": "deptAndChildren",
    "description": "可查看本部门及下级部门的请假单，并办理所在部门的审批任务",
    "inheritFrom": [
      "teacher"
    ]
  },
  {
    "key": "school_admin",
    "name": "院级管理员",
    "dataScope": "deptAndChildren",
    "description": "院级审批人，同时持有平台管理菜单（设计器/模型/流程/发布）",
    "inheritFrom": [
      "dept_manager"
    ]
  },
  {
    "key": "hr_admin",
    "name": "人事专员",
    "dataScope": "all",
    "description": "全校数据只读 + 导出，不参与审批决策",
    "inheritFrom": [
      "teacher"
    ]
  },
  {
    "key": "system",
    "name": "系统",
    "dataScope": "all",
    "description": "定时任务与监听器专用主体，不下发给任何真实用户",
    "inheritFrom": []
  }
];

export const RESOURCE_PERMISSIONS: Record<string, ResourcePermission> = {
  "leave_request": {
    "create": [
      "student"
    ],
    "read": [
      "dept_manager",
      "hr_admin",
      "school_admin",
      "student",
      "system"
    ],
    "update": [
      "student",
      "system"
    ],
    "delete": [
      "student",
      "system"
    ],
    "export": [
      "hr_admin",
      "school_admin"
    ]
  },
  "attachment": {
    "create": [
      "student"
    ],
    "read": [
      "student"
    ]
  }
};

/** 授权里声明的字段白名单（roleKey → 字段数组）。当前只做快照，不参与页面渲染。 */
export const FIELD_WHITELIST: Record<string, Record<string, string[]>> = {
  "leave_request": {
    "student": [
      "leave_type",
      "urgency",
      "start_at",
      "end_at",
      "reason",
      "images",
      "video_proof",
      "documents",
      "days",
      "status"
    ],
    "dept_manager": [
      "applicant_id",
      "applicant_name",
      "dept_id",
      "leave_type",
      "urgency",
      "start_at",
      "end_at",
      "days",
      "reason",
      "status",
      "created_at"
    ],
    "school_admin": [
      "id",
      "applicant_id",
      "applicant_name",
      "dept_id",
      "leave_type",
      "urgency",
      "start_at",
      "end_at",
      "days",
      "reason",
      "images",
      "video_proof",
      "documents",
      "status",
      "current_task",
      "approver_id",
      "approved_at",
      "created_at"
    ],
    "hr_admin": [
      "applicant_id",
      "applicant_name",
      "dept_id",
      "leave_type",
      "urgency",
      "start_at",
      "end_at",
      "days",
      "status"
    ]
  },
  "attachment": {
    "student": [
      "id",
      "biz_type",
      "biz_id",
      "file_name",
      "object_key",
      "mime",
      "size",
      "kind",
      "checksum"
    ]
  }
};

/**
 * 未在 permissions 里出现的实体：前端不做限制，避免「配置缺失 = 页面不可用」。
 * 这不等于放行 —— 真正的校验在 BFF；这里只影响按钮是否显示。
 */
export const UNLISTED_RESOURCES_ARE_OPEN = true;

export const PERMISSION_NOTE =
  "前端权限快照来自 AppBundle.artifacts.permissions；BFF 的 api/permissions.json 是授权事实来源。";

export function resourceKeysWithGrants(): string[] {
  return Object.keys(RESOURCE_PERMISSIONS).sort();
}
