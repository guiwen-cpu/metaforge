/**
 * 本文件由 tools/gen-page.mjs 生成，勿手改。
 * 它是 DataSchema 的页面形态：列、筛选、表单字段、上传约束与 BFF 契约同源。
 */
export type FieldWidget =
  | "input"
  | "textarea"
  | "number"
  | "switch"
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "tags"
  | "date"
  | "datetime"
  | "time"
  | "json"
  | "ref"
  | "upload"
  | "readonly";

export interface OptionItem {
  value: string | number | boolean;
  label: string;
  color?: string;
}

export interface UploadSpec {
  kind: "image" | "video" | "document";
  accept: string[];
  maxSize: number;
  maxCount: number;
  multiple: boolean;
  listType: "picture-card" | "text";
  preview: boolean;
  pathTemplate?: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  widget: FieldWidget;
  span: number;
  required: boolean;
  readonly: boolean;
  sensitive: boolean;
  placeholder?: string;
  help?: string;
  rows?: number;
  upload?: UploadSpec;
  refEntity?: string;
  refField?: string;
  options?: OptionItem[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  defaultValue?: unknown;
}

export type ColumnFormat =
  | "text"
  | "enum"
  | "boolean"
  | "date"
  | "datetime"
  | "number"
  | "files"
  | "ref";

export interface ColumnSpec {
  key: string;
  label: string;
  format: ColumnFormat;
  width?: number;
  minWidth?: number;
  align?: "left" | "right";
  digits?: number;
  sortable?: boolean;
  truncate?: boolean;
  options?: OptionItem[];
  refEntity?: string;
  refField?: string;
}

export interface FilterSpec {
  key: string;
  field: string;
  label: string;
  widget: "input" | "select" | "date" | "datetime" | "number";
  placeholder?: string;
  options?: OptionItem[];
}

export interface ResourceSpec {
  key: string;
  entity: string;
  title: string;
  subtitle: string;
  base: string;
  primaryKey: string;
  titleField: string;
  optimisticLock: boolean;
  softDelete: boolean;
  columns: ColumnSpec[];
  filters: FilterSpec[];
  /** 创建表单：immutable 字段可填，sensitive 字段只在这里出现。 */
  createFields: FieldSpec[];
  /** 编辑表单：immutable 只读，sensitive 不出现（提交时省略，服务端保持原值）。 */
  editFields: FieldSpec[];
  /** 更新提交白名单：只读字段不进请求体。 */
  updateKeys: string[];
  /** 只写不读的字段清单，用于页面提示。 */
  sensitiveFields: string[];
}

export const APP_KEY = "leave_approval";
export const API_BASE = "/api/v1";
export const baseOf = (entity: string): string => API_BASE + "/" + APP_KEY + "/" + entity;

export const resources: Record<string, ResourceSpec> = {
  "employee": {
  "key": "employee",
  "entity": "employee",
  "title": "人员",
  "subtitle": "组织内的学生与教职工主数据",
  "base": "/api/v1/leave_approval/employee",
  "primaryKey": "id",
  "titleField": "name",
  "optimisticLock": false,
  "softDelete": true,
  "columns": [
    {
      "key": "employee_no",
      "label": "工号/学号",
      "format": "text",
      "minWidth": 160,
      "sortable": true
    },
    {
      "key": "name",
      "label": "姓名",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "dept_name",
      "label": "部门名称",
      "format": "text",
      "width": 160
    },
    {
      "key": "position",
      "label": "身份类型",
      "format": "enum",
      "width": 120,
      "options": [
        {
          "value": "teacher",
          "label": "教师",
          "color": "primary"
        },
        {
          "value": "admin",
          "label": "行政",
          "color": "info"
        },
        {
          "value": "logistics",
          "label": "后勤",
          "color": "info"
        },
        {
          "value": "intern",
          "label": "实习",
          "color": "warning"
        }
      ]
    },
    {
      "key": "hire_date",
      "label": "入学/入职日期",
      "format": "date",
      "width": 120,
      "sortable": true
    },
    {
      "key": "created_at",
      "label": "创建时间",
      "format": "datetime",
      "width": 170
    }
  ],
  "filters": [
    {
      "key": "q",
      "field": "q",
      "label": "关键词",
      "widget": "input",
      "placeholder": "搜索 工号/学号 / 姓名 / 所属部门"
    },
    {
      "key": "position",
      "field": "position",
      "label": "身份类型",
      "widget": "select",
      "placeholder": "全部",
      "options": [
        {
          "value": "teacher",
          "label": "教师",
          "color": "primary"
        },
        {
          "value": "admin",
          "label": "行政",
          "color": "info"
        },
        {
          "value": "logistics",
          "label": "后勤",
          "color": "info"
        },
        {
          "value": "intern",
          "label": "实习",
          "color": "warning"
        }
      ]
    },
    {
      "key": "hire_date_from",
      "field": "hire_date_from",
      "label": "入学/入职日期（起）",
      "widget": "date"
    },
    {
      "key": "hire_date_to",
      "field": "hire_date_to",
      "label": "入学/入职日期（止）",
      "widget": "date"
    }
  ],
  "createFields": [
    {
      "key": "employee_no",
      "label": "工号/学号",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "placeholder": "如 2026010101"
    },
    {
      "key": "name",
      "label": "姓名",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "phone",
      "label": "手机号",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": true,
      "pattern": "^1[3-9]\\d{9}$"
    },
    {
      "key": "id_card",
      "label": "证件号",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": true
    },
    {
      "key": "position",
      "label": "身份类型",
      "widget": "select",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "teacher",
          "label": "教师",
          "color": "primary"
        },
        {
          "value": "admin",
          "label": "行政",
          "color": "info"
        },
        {
          "value": "logistics",
          "label": "后勤",
          "color": "info"
        },
        {
          "value": "intern",
          "label": "实习",
          "color": "warning"
        }
      ]
    },
    {
      "key": "hire_date",
      "label": "入学/入职日期",
      "widget": "date",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "editFields": [
    {
      "key": "employee_no",
      "label": "工号/学号",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": true,
      "sensitive": false,
      "placeholder": "如 2026010101"
    },
    {
      "key": "name",
      "label": "姓名",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "position",
      "label": "身份类型",
      "widget": "select",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "teacher",
          "label": "教师",
          "color": "primary"
        },
        {
          "value": "admin",
          "label": "行政",
          "color": "info"
        },
        {
          "value": "logistics",
          "label": "后勤",
          "color": "info"
        },
        {
          "value": "intern",
          "label": "实习",
          "color": "warning"
        }
      ]
    },
    {
      "key": "hire_date",
      "label": "入学/入职日期",
      "widget": "date",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "updateKeys": [
    "name",
    "dept_id",
    "position",
    "hire_date"
  ],
  "sensitiveFields": [
    "phone",
    "id_card"
  ]
},
  "leave_request": {
  "key": "leave_request",
  "entity": "leave_request",
  "title": "请假单",
  "subtitle": "记录一次请假申请及其审批结果",
  "base": "/api/v1/leave_approval/leave_request",
  "primaryKey": "id",
  "titleField": "applicant_name",
  "optimisticLock": true,
  "softDelete": true,
  "columns": [
    {
      "key": "applicant_id",
      "label": "申请人",
      "format": "ref",
      "minWidth": 160,
      "refEntity": "employee",
      "refField": "name"
    },
    {
      "key": "applicant_name",
      "label": "申请人姓名",
      "format": "text",
      "width": 110,
      "sortable": true
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "leave_type",
      "label": "请假类型",
      "format": "enum",
      "width": 120,
      "options": [
        {
          "value": "personal",
          "label": "事假",
          "color": "info"
        },
        {
          "value": "sick",
          "label": "病假",
          "color": "warning"
        },
        {
          "value": "annual",
          "label": "年假",
          "color": "success"
        },
        {
          "value": "compensatory",
          "label": "调休",
          "color": "primary"
        },
        {
          "value": "marriage",
          "label": "婚假",
          "color": "danger"
        },
        {
          "value": "maternity",
          "label": "产假",
          "color": "danger"
        }
      ]
    },
    {
      "key": "start_at",
      "label": "开始时间",
      "format": "datetime",
      "width": 170,
      "sortable": true
    },
    {
      "key": "end_at",
      "label": "结束时间",
      "format": "datetime",
      "width": 170,
      "sortable": true
    },
    {
      "key": "days",
      "label": "请假天数",
      "format": "number",
      "width": 110,
      "align": "right",
      "digits": 2,
      "sortable": true
    },
    {
      "key": "urgency",
      "label": "紧急程度",
      "format": "enum",
      "width": 120,
      "options": [
        {
          "value": "low",
          "label": "不紧急",
          "color": "info"
        },
        {
          "value": "normal",
          "label": "普通",
          "color": "primary"
        },
        {
          "value": "high",
          "label": "紧急",
          "color": "warning"
        },
        {
          "value": "urgent",
          "label": "特急",
          "color": "danger"
        }
      ]
    },
    {
      "key": "images",
      "label": "图片佐证",
      "format": "files",
      "width": 110
    },
    {
      "key": "video_proof",
      "label": "视频佐证",
      "format": "files",
      "width": 110
    },
    {
      "key": "documents",
      "label": "办公文件",
      "format": "files",
      "width": 110
    },
    {
      "key": "status",
      "label": "状态",
      "format": "enum",
      "width": 110,
      "sortable": true,
      "options": [
        {
          "value": "draft",
          "label": "草稿",
          "color": "info"
        },
        {
          "value": "pending",
          "label": "审批中",
          "color": "warning"
        },
        {
          "value": "approved",
          "label": "已通过",
          "color": "success"
        },
        {
          "value": "rejected",
          "label": "已驳回",
          "color": "danger"
        },
        {
          "value": "returned",
          "label": "已退回",
          "color": "warning"
        },
        {
          "value": "cancelled",
          "label": "已撤销",
          "color": "info"
        }
      ]
    },
    {
      "key": "current_task",
      "label": "当前节点",
      "format": "text",
      "width": 140
    },
    {
      "key": "approver_id",
      "label": "当前审批人",
      "format": "text",
      "width": 110
    },
    {
      "key": "approved_at",
      "label": "审批完成时间",
      "format": "datetime",
      "width": 160,
      "sortable": true
    },
    {
      "key": "created_at",
      "label": "创建时间",
      "format": "datetime",
      "width": 170
    }
  ],
  "filters": [
    {
      "key": "q",
      "field": "q",
      "label": "关键词",
      "widget": "input",
      "placeholder": "搜索 申请人姓名 / 所属部门 / 请假类型 / 状态"
    },
    {
      "key": "applicant_id",
      "field": "applicant_id",
      "label": "申请人",
      "widget": "input",
      "placeholder": "精确匹配"
    },
    {
      "key": "leave_type",
      "field": "leave_type",
      "label": "请假类型",
      "widget": "select",
      "placeholder": "全部",
      "options": [
        {
          "value": "personal",
          "label": "事假",
          "color": "info"
        },
        {
          "value": "sick",
          "label": "病假",
          "color": "warning"
        },
        {
          "value": "annual",
          "label": "年假",
          "color": "success"
        },
        {
          "value": "compensatory",
          "label": "调休",
          "color": "primary"
        },
        {
          "value": "marriage",
          "label": "婚假",
          "color": "danger"
        },
        {
          "value": "maternity",
          "label": "产假",
          "color": "danger"
        }
      ]
    },
    {
      "key": "start_at_from",
      "field": "start_at_from",
      "label": "开始时间（起）",
      "widget": "datetime"
    },
    {
      "key": "start_at_to",
      "field": "start_at_to",
      "label": "开始时间（止）",
      "widget": "datetime"
    },
    {
      "key": "end_at_from",
      "field": "end_at_from",
      "label": "结束时间（起）",
      "widget": "datetime"
    },
    {
      "key": "end_at_to",
      "field": "end_at_to",
      "label": "结束时间（止）",
      "widget": "datetime"
    },
    {
      "key": "days_from",
      "field": "days_from",
      "label": "请假天数（起）",
      "widget": "number"
    },
    {
      "key": "days_to",
      "field": "days_to",
      "label": "请假天数（止）",
      "widget": "number"
    },
    {
      "key": "status",
      "field": "status",
      "label": "状态",
      "widget": "select",
      "placeholder": "全部",
      "options": [
        {
          "value": "draft",
          "label": "草稿",
          "color": "info"
        },
        {
          "value": "pending",
          "label": "审批中",
          "color": "warning"
        },
        {
          "value": "approved",
          "label": "已通过",
          "color": "success"
        },
        {
          "value": "rejected",
          "label": "已驳回",
          "color": "danger"
        },
        {
          "value": "returned",
          "label": "已退回",
          "color": "warning"
        },
        {
          "value": "cancelled",
          "label": "已撤销",
          "color": "info"
        }
      ]
    },
    {
      "key": "approved_at_from",
      "field": "approved_at_from",
      "label": "审批完成时间（起）",
      "widget": "datetime"
    },
    {
      "key": "approved_at_to",
      "field": "approved_at_to",
      "label": "审批完成时间（止）",
      "widget": "datetime"
    }
  ],
  "createFields": [
    {
      "key": "applicant_id",
      "label": "申请人",
      "widget": "ref",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "refEntity": "employee",
      "refField": "name"
    },
    {
      "key": "applicant_name",
      "label": "申请人姓名",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "leave_type",
      "label": "请假类型",
      "widget": "select",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "personal",
          "label": "事假",
          "color": "info"
        },
        {
          "value": "sick",
          "label": "病假",
          "color": "warning"
        },
        {
          "value": "annual",
          "label": "年假",
          "color": "success"
        },
        {
          "value": "compensatory",
          "label": "调休",
          "color": "primary"
        },
        {
          "value": "marriage",
          "label": "婚假",
          "color": "danger"
        },
        {
          "value": "maternity",
          "label": "产假",
          "color": "danger"
        }
      ]
    },
    {
      "key": "start_at",
      "label": "开始时间",
      "widget": "datetime",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "end_at",
      "label": "结束时间",
      "widget": "datetime",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "days",
      "label": "请假天数",
      "widget": "number",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "help": "按工作日计算，不含法定节假日",
      "min": 0.5,
      "max": 90
    },
    {
      "key": "reason",
      "label": "请假事由",
      "widget": "textarea",
      "span": 24,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "placeholder": "请具体说明事由，病假请注明就诊医院",
      "rows": 4,
      "minLength": 10
    },
    {
      "key": "urgency",
      "label": "紧急程度",
      "widget": "radio",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "low",
          "label": "不紧急",
          "color": "info"
        },
        {
          "value": "normal",
          "label": "普通",
          "color": "primary"
        },
        {
          "value": "high",
          "label": "紧急",
          "color": "warning"
        },
        {
          "value": "urgent",
          "label": "特急",
          "color": "danger"
        }
      ],
      "defaultValue": "normal"
    },
    {
      "key": "images",
      "label": "图片佐证",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "诊断证明、请假条照片等",
      "upload": {
        "kind": "image",
        "accept": [
          "jpg",
          "jpeg",
          "png",
          "webp"
        ],
        "maxSize": 10485760,
        "maxCount": 6,
        "multiple": true,
        "listType": "picture-card",
        "preview": true,
        "pathTemplate": "{tenant}/{app}/leave/images/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "video_proof",
      "label": "视频佐证",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "可选，如运动队赛事证明",
      "upload": {
        "kind": "video",
        "accept": [
          "mp4",
          "mov"
        ],
        "maxSize": 104857600,
        "maxCount": 1,
        "multiple": false,
        "listType": "text",
        "preview": false,
        "pathTemplate": "{tenant}/{app}/leave/video/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "documents",
      "label": "办公文件",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "支持 Word / Excel / PDF",
      "upload": {
        "kind": "document",
        "accept": [
          "pdf",
          "doc",
          "docx",
          "xls",
          "xlsx"
        ],
        "maxSize": 52428800,
        "maxCount": 5,
        "multiple": true,
        "listType": "text",
        "preview": false,
        "pathTemplate": "{tenant}/{app}/leave/docs/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "status",
      "label": "状态",
      "widget": "select",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "draft",
          "label": "草稿",
          "color": "info"
        },
        {
          "value": "pending",
          "label": "审批中",
          "color": "warning"
        },
        {
          "value": "approved",
          "label": "已通过",
          "color": "success"
        },
        {
          "value": "rejected",
          "label": "已驳回",
          "color": "danger"
        },
        {
          "value": "returned",
          "label": "已退回",
          "color": "warning"
        },
        {
          "value": "cancelled",
          "label": "已撤销",
          "color": "info"
        }
      ],
      "defaultValue": "draft"
    },
    {
      "key": "current_task",
      "label": "当前节点",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "editFields": [
    {
      "key": "applicant_id",
      "label": "申请人",
      "widget": "ref",
      "span": 12,
      "required": true,
      "readonly": true,
      "sensitive": false,
      "refEntity": "employee",
      "refField": "name"
    },
    {
      "key": "applicant_name",
      "label": "申请人姓名",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "dept_id",
      "label": "所属部门",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "leave_type",
      "label": "请假类型",
      "widget": "select",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "personal",
          "label": "事假",
          "color": "info"
        },
        {
          "value": "sick",
          "label": "病假",
          "color": "warning"
        },
        {
          "value": "annual",
          "label": "年假",
          "color": "success"
        },
        {
          "value": "compensatory",
          "label": "调休",
          "color": "primary"
        },
        {
          "value": "marriage",
          "label": "婚假",
          "color": "danger"
        },
        {
          "value": "maternity",
          "label": "产假",
          "color": "danger"
        }
      ]
    },
    {
      "key": "start_at",
      "label": "开始时间",
      "widget": "datetime",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "end_at",
      "label": "结束时间",
      "widget": "datetime",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "days",
      "label": "请假天数",
      "widget": "number",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "help": "按工作日计算，不含法定节假日",
      "min": 0.5,
      "max": 90
    },
    {
      "key": "reason",
      "label": "请假事由",
      "widget": "textarea",
      "span": 24,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "placeholder": "请具体说明事由，病假请注明就诊医院",
      "rows": 4,
      "minLength": 10
    },
    {
      "key": "urgency",
      "label": "紧急程度",
      "widget": "radio",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "low",
          "label": "不紧急",
          "color": "info"
        },
        {
          "value": "normal",
          "label": "普通",
          "color": "primary"
        },
        {
          "value": "high",
          "label": "紧急",
          "color": "warning"
        },
        {
          "value": "urgent",
          "label": "特急",
          "color": "danger"
        }
      ],
      "defaultValue": "normal"
    },
    {
      "key": "images",
      "label": "图片佐证",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "诊断证明、请假条照片等",
      "upload": {
        "kind": "image",
        "accept": [
          "jpg",
          "jpeg",
          "png",
          "webp"
        ],
        "maxSize": 10485760,
        "maxCount": 6,
        "multiple": true,
        "listType": "picture-card",
        "preview": true,
        "pathTemplate": "{tenant}/{app}/leave/images/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "video_proof",
      "label": "视频佐证",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "可选，如运动队赛事证明",
      "upload": {
        "kind": "video",
        "accept": [
          "mp4",
          "mov"
        ],
        "maxSize": 104857600,
        "maxCount": 1,
        "multiple": false,
        "listType": "text",
        "preview": false,
        "pathTemplate": "{tenant}/{app}/leave/video/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "documents",
      "label": "办公文件",
      "widget": "upload",
      "span": 24,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "help": "支持 Word / Excel / PDF",
      "upload": {
        "kind": "document",
        "accept": [
          "pdf",
          "doc",
          "docx",
          "xls",
          "xlsx"
        ],
        "maxSize": 52428800,
        "maxCount": 5,
        "multiple": true,
        "listType": "text",
        "preview": false,
        "pathTemplate": "{tenant}/{app}/leave/docs/{yyyy}/{MM}/{ulid}.{ext}"
      }
    },
    {
      "key": "status",
      "label": "状态",
      "widget": "select",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "draft",
          "label": "草稿",
          "color": "info"
        },
        {
          "value": "pending",
          "label": "审批中",
          "color": "warning"
        },
        {
          "value": "approved",
          "label": "已通过",
          "color": "success"
        },
        {
          "value": "rejected",
          "label": "已驳回",
          "color": "danger"
        },
        {
          "value": "returned",
          "label": "已退回",
          "color": "warning"
        },
        {
          "value": "cancelled",
          "label": "已撤销",
          "color": "info"
        }
      ],
      "defaultValue": "draft"
    },
    {
      "key": "current_task",
      "label": "当前节点",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "updateKeys": [
    "applicant_name",
    "dept_id",
    "leave_type",
    "start_at",
    "end_at",
    "days",
    "reason",
    "urgency",
    "images",
    "video_proof",
    "documents",
    "status",
    "current_task"
  ],
  "sensitiveFields": []
},
  "attachment": {
  "key": "attachment",
  "entity": "attachment",
  "title": "附件",
  "subtitle": "统一附件中心，所有业务的文件元数据都落这里",
  "base": "/api/v1/leave_approval/attachment",
  "primaryKey": "id",
  "titleField": "file_name",
  "optimisticLock": false,
  "softDelete": true,
  "columns": [
    {
      "key": "biz_type",
      "label": "业务类型",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "biz_id",
      "label": "业务主键",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "file_name",
      "label": "文件名",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "object_key",
      "label": "OSS 对象键",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "mime",
      "label": "MIME",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "size",
      "label": "字节数",
      "format": "number",
      "width": 110,
      "align": "right",
      "digits": 0
    },
    {
      "key": "kind",
      "label": "类别",
      "format": "enum",
      "width": 120,
      "options": [
        {
          "value": "image",
          "label": "图片",
          "color": "success"
        },
        {
          "value": "video",
          "label": "视频",
          "color": "warning"
        },
        {
          "value": "document",
          "label": "办公文档",
          "color": "primary"
        },
        {
          "value": "other",
          "label": "其他",
          "color": "info"
        }
      ]
    },
    {
      "key": "checksum",
      "label": "文件校验和",
      "format": "text",
      "minWidth": 160
    },
    {
      "key": "created_at",
      "label": "创建时间",
      "format": "datetime",
      "width": 170
    }
  ],
  "filters": [
    {
      "key": "q",
      "field": "q",
      "label": "关键词",
      "widget": "input",
      "placeholder": "搜索 业务类型 / 业务主键 / 文件名"
    },
    {
      "key": "size_from",
      "field": "size_from",
      "label": "字节数（起）",
      "widget": "number"
    },
    {
      "key": "size_to",
      "field": "size_to",
      "label": "字节数（止）",
      "widget": "number"
    },
    {
      "key": "kind",
      "field": "kind",
      "label": "类别",
      "widget": "select",
      "placeholder": "全部",
      "options": [
        {
          "value": "image",
          "label": "图片",
          "color": "success"
        },
        {
          "value": "video",
          "label": "视频",
          "color": "warning"
        },
        {
          "value": "document",
          "label": "办公文档",
          "color": "primary"
        },
        {
          "value": "other",
          "label": "其他",
          "color": "info"
        }
      ]
    }
  ],
  "createFields": [
    {
      "key": "biz_type",
      "label": "业务类型",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "biz_id",
      "label": "业务主键",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "file_name",
      "label": "文件名",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "object_key",
      "label": "OSS 对象键",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "mime",
      "label": "MIME",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "size",
      "label": "字节数",
      "widget": "number",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "kind",
      "label": "类别",
      "widget": "select",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "image",
          "label": "图片",
          "color": "success"
        },
        {
          "value": "video",
          "label": "视频",
          "color": "warning"
        },
        {
          "value": "document",
          "label": "办公文档",
          "color": "primary"
        },
        {
          "value": "other",
          "label": "其他",
          "color": "info"
        }
      ]
    },
    {
      "key": "checksum",
      "label": "文件校验和",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "editFields": [
    {
      "key": "biz_type",
      "label": "业务类型",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "biz_id",
      "label": "业务主键",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "file_name",
      "label": "文件名",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "object_key",
      "label": "OSS 对象键",
      "widget": "input",
      "span": 12,
      "required": true,
      "readonly": true,
      "sensitive": false
    },
    {
      "key": "mime",
      "label": "MIME",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "size",
      "label": "字节数",
      "widget": "number",
      "span": 12,
      "required": true,
      "readonly": false,
      "sensitive": false
    },
    {
      "key": "kind",
      "label": "类别",
      "widget": "select",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false,
      "options": [
        {
          "value": "image",
          "label": "图片",
          "color": "success"
        },
        {
          "value": "video",
          "label": "视频",
          "color": "warning"
        },
        {
          "value": "document",
          "label": "办公文档",
          "color": "primary"
        },
        {
          "value": "other",
          "label": "其他",
          "color": "info"
        }
      ]
    },
    {
      "key": "checksum",
      "label": "文件校验和",
      "widget": "input",
      "span": 12,
      "required": false,
      "readonly": false,
      "sensitive": false
    }
  ],
  "updateKeys": [
    "biz_type",
    "biz_id",
    "file_name",
    "mime",
    "size",
    "kind",
    "checksum"
  ],
  "sensitiveFields": []
}
};

export interface ResourceRoute {
  path: string;
  name: string;
  component: string;
  title: string;
  entity: string;
}

export const resourceRoutes: ResourceRoute[] = [
  {
    "path": "employee",
    "name": "LeaveApprovalEmployeeList",
    "component": "../pages/Employee/index.vue",
    "title": "人员",
    "entity": "employee"
  },
  {
    "path": "leave_request",
    "name": "LeaveApprovalLeaveRequestList",
    "component": "../pages/LeaveRequest/index.vue",
    "title": "请假单",
    "entity": "leave_request"
  },
  {
    "path": "attachment",
    "name": "LeaveApprovalAttachmentList",
    "component": "../pages/Attachment/index.vue",
    "title": "附件",
    "entity": "attachment"
  }
];

export const resourceByEntity = (entity: string): ResourceSpec | undefined =>
  Object.values(resources).find((item) => item.entity === entity);
