/**
 * 平台注册表 —— 由 tools/gen-ts.mjs 生成，请勿手工修改。
 *
 * 这是「设计器属性面板 / 前端运行时 / 出码引擎 / AI 生成器」四方共用的数据源：
 * 枚举字面量来自各 Schema 的 enum，FieldType 映射来自 registry/type-mapping.json，
 * 表达式语义来自 schema/expression-registry.json。这里只做类型化再导出，不复制语义。
 */
import type { ComponentContract, DataFieldType } from "./types";

/** 协议版本。Schema / Bundle / 注册表三者必须一致，L1 校验会比对。 */
export const PROTOCOL_VERSION = "0.1";

/** 内置组件注册表版本。AppBundle 声明依赖的版本号与此比对。 */
export const COMPONENT_REGISTRY_VERSION = 1;

/* ---------------- 枚举字面量（唯一来源：各 Schema 的 enum 定义） ---------------- */

/** CommonScope —— system=平台内置模板；tenant=租户级复用；app=应用私有。 */
export const COMMON_SCOPE_VALUES = [
  "system",
  "tenant",
  "app",
] as const;

/** CommonBreakpointKey —— 响应式断点。移动端/小程序出码时按断点降级。 */
export const COMMON_BREAKPOINT_KEY_VALUES = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
] as const;

/** DataFieldType —— 封闭集合。新增类型须同步更新：PG 类型映射表、TS 类型生成器、Java 类型生成器、默认渲染组件表（四处齐改，L3 校验会检查映射表完整性） */
export const DATA_FIELD_TYPE_VALUES = [
  "string",
  "text",
  "richText",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "time",
  "json",
  "enum",
  "ref",
  "file",
  "image",
  "video",
  "array",
  "signature",
  "location",
  "formula",
] as const;

/** UiPageKind —— 页面语义类型。运行时渲染不依赖它，但它决定设计器的默认模板、出码的目标结构（移动端不做 dashboard）与 AI 的生成策略。 */
export const UI_PAGE_KIND_VALUES = [
  "list",
  "form",
  "detail",
  "dashboard",
  "approval",
  "report",
  "custom",
  "login",
  "error",
] as const;

/** LogicNotificationChannel —— 通知渠道。inApp 与审批同事务写站内信；webhook/email 走租户连接器与投递 outbox。 */
export const LOGIC_NOTIFICATION_CHANNEL_VALUES = [
  "inApp",
  "webhook",
  "email",
] as const;

/** LogicNotificationEvent —— 通知规则可挂载的流程生命周期事件。 */
export const LOGIC_NOTIFICATION_EVENT_VALUES = [
  "processStarted",
  "taskAssigned",
  "taskTransferred",
  "taskReturned",
  "flowRejected",
  "flowApproved",
  "slaWarning",
  "slaEscalated",
] as const;

/** ComponentKind —— field=可作为表单字段（参与表单模型与校验）；layout/container=可容纳子节点；data=消费数据源的主组件（表格/列表/树） */
export const COMPONENT_KIND_VALUES = [
  "layout",
  "container",
  "field",
  "display",
  "action",
  "data",
  "chart",
  "advanced",
] as const;

/** ComponentPropType —— 面向设计器的属性类型系统。决定属性面板渲染什么编辑控件，以及出码时如何序列化。新增类型须同步更新属性面板控件表与出码序列化器。 */
export const COMPONENT_PROP_TYPE_VALUES = [
  "string",
  "number",
  "integer",
  "boolean",
  "text",
  "json",
  "enum",
  "color",
  "icon",
  "cssLength",
  "url",
  "dateFormat",
  "fileAccept",
  "expr",
  "slot",
  "node",
  "nodeList",
  "style",
  "actionRef",
  "pageRef",
  "entityRef",
  "dataSourceRef",
  "fieldRef",
  "eventRef",
  "fieldList",
  "columnList",
  "searchFieldList",
  "optionList",
  "buttonList",
  "ruleList",
  "assignee",
  "validatorList",
  "stepList",
] as const;

/** 列值类型。它复用 FieldType 的取值域，这里只做别名，不复制字面量。 */
export const VALUE_TYPE_VALUES = DATA_FIELD_TYPE_VALUES;

/* ---------------- 常用枚举的短别名 ---------------- */
/** 字段类型 19 项，与 DataSchema FieldType 一致。 */
export const FIELD_TYPES = DATA_FIELD_TYPE_VALUES;
/** 字段值类型（对齐 SQL 列类型）。 */
export const FIELD_VALUE_TYPES = DATA_FIELD_TYPE_VALUES;
/** 页面种类。 */
export const PAGE_KINDS = UI_PAGE_KIND_VALUES;
/** 组件种类。 */
export const COMPONENT_KINDS = COMPONENT_KIND_VALUES;
/** 组件属性类型（PropDef.type 的取值域）。 */
export const PROP_TYPES = COMPONENT_PROP_TYPE_VALUES;
/** 元数据作用域：platform / tenant / app。 */
export const SCOPES = COMMON_SCOPE_VALUES;
/** 响应式断点键，与 UISchema.responsive 一致。 */
export const BREAKPOINT_KEYS = COMMON_BREAKPOINT_KEY_VALUES;

/* ---------------- FieldType -> 存储 / TS / Java / 控件 四向映射 ---------------- */
/**
 * 一处定义，四处消费：
 *   pg       建表 DDL 与索引策略（DDL 生成器读）
 *   ts       出码引擎生成的实体类型（TS 侧）
 *   java     Jackson DTO 字段类型（Java 侧，imports 用于自动补 import）
 *   widget   设计器默认控件与列表渲染器
 *   semantic 语义意图，喂给 AI 生成器做字段推荐
 */
export const FIELD_TYPE_MAPPING = {
  "string": {
    "pg": {
      "base": "varchar",
      "length": 255,
      "jsonb": "text",
      "indexable": true,
      "aggregatable": true,
      "fullText": true
    },
    "ts": {
      "type": "string"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-input",
      "listRenderer": true
    },
    "semantic": {
      "intent": "短文本：姓名、编号、标题"
    }
  },
  "text": {
    "pg": {
      "base": "text",
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false,
      "fullText": true
    },
    "ts": {
      "type": "string"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-textarea",
      "listRenderer": false
    },
    "semantic": {
      "intent": "长文本：说明、理由、备注"
    }
  },
  "richText": {
    "pg": {
      "base": "text",
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false,
      "fullText": true
    },
    "ts": {
      "type": "string",
      "doc": "HTML 片段，渲染前必须经白名单净化"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-rich-text",
      "listRenderer": false
    },
    "semantic": {
      "intent": "富文本：公告正文、制度说明"
    }
  },
  "integer": {
    "pg": {
      "base": "integer",
      "jsonb": "integer",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "number"
    },
    "java": {
      "type": "Integer",
      "imports": []
    },
    "widget": {
      "name": "x-number",
      "listRenderer": true
    },
    "semantic": {
      "intent": "整数：数量、天数、排序号"
    }
  },
  "decimal": {
    "pg": {
      "base": "numeric",
      "precision": 18,
      "scale": 4,
      "jsonb": "numeric",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "number",
      "doc": "金额/精度敏感场景由出码引擎替换为字符串十进制以规避浮点误差"
    },
    "java": {
      "type": "BigDecimal",
      "imports": [
        "java.math.BigDecimal"
      ]
    },
    "widget": {
      "name": "x-number",
      "listRenderer": true
    },
    "semantic": {
      "intent": "小数：金额、工时、分数"
    }
  },
  "boolean": {
    "pg": {
      "base": "boolean",
      "jsonb": "boolean",
      "indexable": true,
      "aggregatable": false
    },
    "ts": {
      "type": "boolean"
    },
    "java": {
      "type": "Boolean",
      "imports": []
    },
    "widget": {
      "name": "x-switch",
      "listRenderer": true
    },
    "semantic": {
      "intent": "是/否：是否紧急、是否启用"
    }
  },
  "date": {
    "pg": {
      "base": "date",
      "jsonb": "text",
      "jsonbFormat": "yyyy-MM-dd",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "string",
      "format": "yyyy-MM-dd"
    },
    "java": {
      "type": "LocalDate",
      "imports": [
        "java.time.LocalDate"
      ],
      "jacksonFormat": "yyyy-MM-dd"
    },
    "widget": {
      "name": "x-date-picker",
      "listRenderer": true,
      "props": {
        "type": "date",
        "valueFormat": "YYYY-MM-DD"
      }
    },
    "semantic": {
      "intent": "日期：生日、入职日"
    }
  },
  "datetime": {
    "pg": {
      "base": "timestamptz",
      "jsonb": "text",
      "jsonbFormat": "ISO8601",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "string",
      "format": "ISO8601"
    },
    "java": {
      "type": "OffsetDateTime",
      "imports": [
        "java.time.OffsetDateTime"
      ],
      "jacksonFormat": "ISO8601"
    },
    "widget": {
      "name": "x-date-picker",
      "listRenderer": true,
      "props": {
        "type": "datetime",
        "valueFormat": "YYYY-MM-DDTHH:mm:ssZ"
      }
    },
    "semantic": {
      "intent": "时间点：开始时间、提交时间；一律带时区存储，展示按用户时区"
    }
  },
  "time": {
    "pg": {
      "base": "time",
      "jsonb": "text",
      "jsonbFormat": "HH:mm:ss",
      "indexable": true,
      "aggregatable": false
    },
    "ts": {
      "type": "string",
      "format": "HH:mm:ss"
    },
    "java": {
      "type": "LocalTime",
      "imports": [
        "java.time.LocalTime"
      ]
    },
    "widget": {
      "name": "x-date-picker",
      "listRenderer": false,
      "props": {
        "type": "time",
        "valueFormat": "HH:mm:ss"
      }
    },
    "semantic": {
      "intent": "时刻：上课时间、值班时段"
    }
  },
  "json": {
    "pg": {
      "base": "jsonb",
      "jsonb": "jsonb",
      "indexable": true,
      "indexableVia": "GIN",
      "aggregatable": false
    },
    "ts": {
      "type": "unknown"
    },
    "java": {
      "type": "JsonNode",
      "imports": [
        "com.fasterxml.jackson.databind.JsonNode"
      ]
    },
    "widget": {
      "name": "x-json-editor",
      "listRenderer": false
    },
    "semantic": {
      "intent": "结构化扩展数据：动态问卷答案、外部系统原始报文"
    }
  },
  "enum": {
    "pg": {
      "base": "varchar",
      "length": 64,
      "jsonb": "text",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "string",
      "unionFromEnumRef": true
    },
    "java": {
      "type": "String",
      "imports": [],
      "doc": "出码引擎可生成 Java enum 并在 Jackson 层做值校验；默认生成 String + @LcpEnumRef 注解"
    },
    "widget": {
      "name": "x-select",
      "listRenderer": true
    },
    "semantic": {
      "intent": "枚举：状态、类型。存字符串而非 PG enum 类型，避免加值要 DDL"
    }
  },
  "ref": {
    "pg": {
      "base": "varchar",
      "length": 32,
      "jsonb": "text",
      "indexable": true,
      "aggregatable": true
    },
    "ts": {
      "type": "string",
      "doc": "被引用实体的主键"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-select",
      "listRenderer": true,
      "props": {
        "remote": true
      }
    },
    "semantic": {
      "intent": "外键引用：部门 ID、员工 ID。是否生成真实 FK 约束由 Field.refConstraint 决定，默认不生成以允许软关联"
    }
  },
  "file": {
    "pg": {
      "base": "varchar",
      "length": 512,
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false
    },
    "ts": {
      "type": "string",
      "doc": "OSS objectKey；也可为 AssetRef 对象"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-upload",
      "listRenderer": false,
      "props": {
        "kind": "document",
        "multiple": true
      }
    },
    "semantic": {
      "intent": "办公文档：pdf/docx/xlsx/pptx"
    }
  },
  "image": {
    "pg": {
      "base": "varchar",
      "length": 512,
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false
    },
    "ts": {
      "type": "string"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-upload",
      "listRenderer": false,
      "props": {
        "kind": "image",
        "multiple": true,
        "listType": "picture-card"
      }
    },
    "semantic": {
      "intent": "图片：证件照、诊断证明。缩略图走 OSS 图片处理参数，不落本地"
    }
  },
  "video": {
    "pg": {
      "base": "varchar",
      "length": 512,
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false
    },
    "ts": {
      "type": "string"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-upload",
      "listRenderer": false,
      "props": {
        "kind": "video",
        "multiple": false,
        "listType": "text"
      }
    },
    "semantic": {
      "intent": "视频：赛事证明。必须校验时长与大小，播放走 OSS 签名 URL"
    }
  },
  "array": {
    "pg": {
      "base": "jsonb",
      "jsonb": "jsonb",
      "indexable": true,
      "indexableVia": "GIN",
      "aggregatable": false
    },
    "ts": {
      "type": "T[]",
      "doc": "元素类型由 Field.itemType 决定"
    },
    "java": {
      "type": "List<T>",
      "imports": [
        "java.util.List"
      ],
      "doc": "元素类型由 Field.itemType 决定"
    },
    "widget": {
      "name": "x-checkbox-group",
      "listRenderer": false,
      "resolveVia": "itemType"
    },
    "semantic": {
      "intent": "数组：多附件、多标签、多选项。元素为 image/file 时控件解析会下钻到 itemType"
    }
  },
  "signature": {
    "pg": {
      "base": "varchar",
      "length": 512,
      "jsonb": "text",
      "indexable": false,
      "aggregatable": false
    },
    "ts": {
      "type": "string"
    },
    "java": {
      "type": "String",
      "imports": []
    },
    "widget": {
      "name": "x-signature",
      "listRenderer": false
    },
    "semantic": {
      "intent": "手写签名：存 OSS 上的 PNG objectKey，不存 base64"
    }
  },
  "location": {
    "pg": {
      "base": "jsonb",
      "jsonb": "jsonb",
      "indexable": true,
      "indexableVia": "GIN",
      "aggregatable": false
    },
    "ts": {
      "type": "{ lng: number; lat: number; address?: string; name?: string }"
    },
    "java": {
      "type": "JsonNode",
      "imports": [
        "com.fasterxml.jackson.databind.JsonNode"
      ]
    },
    "widget": {
      "name": "x-location",
      "listRenderer": false
    },
    "semantic": {
      "intent": "地理位置：定位打卡、场地。需要地理检索时由出码引擎改为 PostGIS geometry"
    }
  },
  "formula": {
    "pg": {
      "base": null,
      "stored": false,
      "jsonb": null,
      "indexable": false,
      "aggregatable": false,
      "note": "派生字段：默认不落库，由运行时按 Field.formula 计算；若声明 storage=column 且 EntityStorage.generatedColumns=true，出码引擎生成 GENERATED ALWAYS AS ... STORED 列"
    },
    "ts": {
      "type": "unknown",
      "readonly": true,
      "doc": "类型由 formula 表达式推断"
    },
    "java": {
      "type": "Object",
      "imports": [],
      "transient": true
    },
    "widget": {
      "name": "x-text",
      "listRenderer": true,
      "props": {
        "readonly": true
      }
    },
    "semantic": {
      "intent": "计算字段：金额小计、工作日天数（简单场景；复杂算法仍应用 CodeStep）"
    }
  }
} as const;

/** 单条 FieldType 映射的形状。 */
export type FieldTypeMapping = (typeof FIELD_TYPE_MAPPING)[DataFieldType];

/** FieldType 覆盖度自检用：键列表必须与 FIELD_TYPES 完全一致。 */
export const MAPPED_FIELD_TYPES = Object.keys(FIELD_TYPE_MAPPING) as DataFieldType[];

/** 建表 / 命名 / 精度等约定，出码引擎与 DDL 生成器共用。 */
export const TYPE_MAPPING_CONVENTIONS = {
  "storage": {
    "column": "在实体表上建真实列。需要索引、唯一约束、外键、聚合（SUM/AVG/MAX）或范围查询时，字段必须显式声明 storage=column。",
    "jsonb": "默认值。落在 EntityStorage.jsonbColumn（默认 ext）这一列的 JSONB 文档内，键为字段 key。零 DDL 演进，代价是不可索引（GIN 除外）与弱类型。"
  },
  "nullable": "所有列默认 NULL，required=true 由应用层校验，不生成 NOT NULL —— 便于灰度期新旧 Schema 共存。发布时若要求 NOT NULL 需在 PublishConfig 中显式说明。",
  "timestamps": "created_at / updated_at / created_by / updated_by / deleted_at 由平台统一注入，业务 Schema 不得重复声明。",
  "tenant": "tenant_id 由平台统一注入（EntityStorage.tenantColumn），并配合 PostgreSQL RLS 做兜底隔离。",
  "softDelete": "softDelete 为 true 时 delete 语义变为置 deleted_at；唯一约束需改为「部分唯一索引 WHERE deleted_at IS NULL」。",
  "columnType": "Field.columnType 可覆盖本表的 pg.base（如 string 改成 citext、decimal 改成 money）。覆盖时 L3 校验只检查类型族兼容性，不要求完全一致。"
} as const;

/** 数组字段的元素控件推荐（array<image> 自动落 x-upload 的依据之一）。 */
export const ARRAY_ITEM_WIDGETS = {
  "description": "Field.type=array 时按 itemType.type 下钻解析控件（fieldBindingRule 第 ③ 步）。此处只列出与「整体数组」控件不同的特例。",
  "image": {
    "widget": "x-upload",
    "props": {
      "kind": "image",
      "multiple": true,
      "listType": "picture-card"
    }
  },
  "video": {
    "widget": "x-upload",
    "props": {
      "kind": "video",
      "multiple": true,
      "listType": "text"
    }
  },
  "file": {
    "widget": "x-upload",
    "props": {
      "kind": "document",
      "multiple": true,
      "listType": "text"
    }
  },
  "enum": {
    "widget": "x-checkbox-group"
  },
  "ref": {
    "widget": "x-select",
    "props": {
      "multiple": true
    }
  },
  "string": {
    "widget": "x-checkbox-group",
    "planned": "x-tag-input"
  },
  "integer": {
    "widget": "x-number",
    "props": {
      "multiple": true
    }
  }
} as const;

/** SQL 类型推导规则（长度/精度/索引的前置判断）。 */
export const SQL_TYPE_RULES = {
  "description": "L3 校验用：把 Field 上的 length / precision / scale 展开成完整 PG 类型串",
  "varchar": "varchar(${length})",
  "numeric": "numeric(${precision},${scale})",
  "timestamptz": "timestamptz",
  "date": "date",
  "time": "time",
  "boolean": "boolean",
  "integer": "integer",
  "text": "text",
  "jsonb": "jsonb"
} as const;

/** 出码引擎的生成提示（模板选择、import 生成）。 */
export const GENERATOR_HINTS = {
  "ts": {
    "enumUnion": "enum 字段在有 enumRef 时生成字符串字面量联合类型，否则生成 string",
    "nullable": "required 为 true 且无 defaultValue 的字段生成非可选属性，其余生成 `?: T | null`",
    "output": "ts/types.ts（仅类型）+ ts/guards.ts（运行时类型守卫，供沙箱与 BFF 校验复用）"
  },
  "java": {
    "output": "java/dto/*.java（Jackson DTO）+ java/enums/*.java",
    "style": "Lombok 不可用时生成显式 getter/setter；字段名 camelCase，列名 snake_case 由 @JsonProperty 桥接",
    "validation": "required -> @NotNull，length -> @Size，pattern -> @Pattern，enumRef -> 自定义 @LcpEnumRef",
    "jsonbFields": "storage=jsonb 的字段在 Java DTO 上仍是一等属性，由 BffJsonbMapper 在 DAO 层读写 ext 列，业务代码无感"
  }
} as const;

/* ---------------- 表达式注册表（前后端 + Flowable 共用的唯一解释器语义） ---------------- */

export const EXPRESSION_OPERATORS = [
  "$lit",
  "$ref",
  "$fn",
  "$tpl",
  "$if"
] as const;

export const EXPRESSION_VALUE_ROOTS = [
  {
    "name": "$user",
    "type": "object",
    "nullable": false,
    "desc": "当前用户。fields 为约定字段，租户可扩展至 user.attrs.*",
    "fields": {
      "id": "string",
      "name": "string",
      "username": "string",
      "tenantId": "string",
      "deptId": "string",
      "deptIds": "array",
      "roleKeys": "array",
      "email": "string",
      "phone": "string",
      "attrs": "object"
    }
  },
  {
    "name": "$tenant",
    "type": "object",
    "nullable": false,
    "desc": "当前租户",
    "fields": {
      "id": "string",
      "code": "string",
      "name": "string",
      "attrs": "object"
    }
  },
  {
    "name": "$env",
    "type": "object",
    "nullable": false,
    "desc": "运行环境",
    "fields": {
      "platform": "string",
      "locale": "string",
      "timezone": "string",
      "appVersion": "string",
      "mode": "string"
    }
  },
  {
    "name": "$now",
    "type": "string",
    "nullable": false,
    "desc": "当前时间 ISO8601，每次求值稳定（同一动作链内冻结）"
  },
  {
    "name": "$page",
    "type": "object",
    "nullable": false,
    "desc": "当前页面上下文。state 暴露 UISchema.state 声明的状态变量（读用 $page.state.x；写用 AssignStep.target 的相对路径 state.x）",
    "fields": {
      "id": "string",
      "key": "string",
      "params": "object",
      "query": "object",
      "state": "object"
    }
  },
  {
    "name": "$route",
    "type": "object",
    "nullable": false,
    "desc": "当前路由",
    "fields": {
      "path": "string",
      "query": "object",
      "params": "object"
    }
  },
  {
    "name": "$form",
    "type": "object",
    "nullable": true,
    "desc": "当前表单模型（创建型/编辑型表单的字段值），键为字段 key"
  },
  {
    "name": "$row",
    "type": "object",
    "nullable": true,
    "desc": "当前行（表格行操作、详情页主体）"
  },
  {
    "name": "$rows",
    "type": "array",
    "nullable": true,
    "desc": "当前列表已加载数据"
  },
  {
    "name": "$data",
    "type": "object",
    "nullable": false,
    "desc": "按 dataSourceId 索引的数据源结果：$data.dsUsers.rows / .total / .page / .loading / .item"
  },
  {
    "name": "$process",
    "type": "object",
    "nullable": true,
    "desc": "审批流上下文，非流程页面为 null",
    "fields": {
      "processInstanceId": "string",
      "taskId": "string",
      "taskKey": "string",
      "taskName": "string",
      "initiator": "string",
      "status": "string",
      "variables": "object"
    }
  },
  {
    "name": "$ctx",
    "type": "object",
    "nullable": false,
    "desc": "动作执行上下文。result=紧邻上一步的结果（下一步即被覆盖，跨步骤请用 vars）；vars=动作链内的临时变量（assignTo 前缀 vars 写入）；params=动作入参；event=触发事件载荷",
    "fields": {
      "params": "object",
      "event": "object",
      "vars": "object",
      "result": "any",
      "error": "object",
      "actionKey": "string",
      "stepIndex": "integer"
    }
  },
  {
    "name": "$component",
    "type": "object",
    "nullable": true,
    "desc": "组件作用域内可用：$component.id / .key / .props"
  },
  {
    "name": "$res",
    "type": "object",
    "nullable": true,
    "desc": "HTTP 响应对象。仅在 Api.response 的解析表达式（successWhen / mapping / rowsPath / totalPath / errorPath / errorMessagePath）内可用：$res.status 为 HTTP 状态码，$res.body 为解析后的响应体，$res.headers 为响应头。步骤外读响应体请用 assignTo 落到 $ctx.vars.x。",
    "fields": {
      "status": "integer",
      "body": "any",
      "headers": "object"
    }
  }
] as const;

export const EXPRESSION_FUNCTIONS = [
  {
    "name": "eq",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "等于（深度比较，忽略对象键序）"
  },
  {
    "name": "ne",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "不等于"
  },
  {
    "name": "lt",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "小于（字符串按字典序，日期按时间序）"
  },
  {
    "name": "lte",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "小于等于"
  },
  {
    "name": "gt",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "大于"
  },
  {
    "name": "gte",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "大于等于"
  },
  {
    "name": "between",
    "cat": "comparison",
    "arity": [
      3,
      3
    ],
    "params": [
      "any",
      "any",
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "闭区间包含"
  },
  {
    "name": "in",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "array"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "左侧值是否在右侧数组内；左侧为数组时判断是否存在交集"
  },
  {
    "name": "notIn",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "array"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "取反的 in"
  },
  {
    "name": "like",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "SQL LIKE 语义（% 通配），下推时编译为 ILIKE"
  },
  {
    "name": "startsWith",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "前缀匹配"
  },
  {
    "name": "endsWith",
    "cat": "comparison",
    "arity": [
      2,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "后缀匹配"
  },
  {
    "name": "isNull",
    "cat": "comparison",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "是否为 null 或 undefined"
  },
  {
    "name": "isNotNull",
    "cat": "comparison",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "非空判断"
  },
  {
    "name": "isEmpty",
    "cat": "comparison",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "空字符串/空数组/空对象/null 皆为真"
  },
  {
    "name": "isNotEmpty",
    "cat": "comparison",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "非空判断"
  },
  {
    "name": "and",
    "cat": "logic",
    "arity": [
      1,
      null
    ],
    "params": [
      "any"
    ],
    "variadic": true,
    "returns": "boolean",
    "pure": true,
    "desc": "逻辑与，短路求值"
  },
  {
    "name": "or",
    "cat": "logic",
    "arity": [
      1,
      null
    ],
    "params": [
      "any"
    ],
    "variadic": true,
    "returns": "boolean",
    "pure": true,
    "desc": "逻辑或，短路求值"
  },
  {
    "name": "not",
    "cat": "logic",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "逻辑非"
  },
  {
    "name": "if",
    "cat": "logic",
    "arity": [
      3,
      3
    ],
    "params": [
      "any",
      "any",
      "any"
    ],
    "returns": "any",
    "pure": true,
    "desc": "三元表达式。复杂嵌套优先用 $if 算子以提升可读性"
  },
  {
    "name": "coalesce",
    "cat": "logic",
    "arity": [
      1,
      null
    ],
    "params": [
      "any"
    ],
    "variadic": true,
    "returns": "any",
    "pure": true,
    "desc": "返回第一个非空值"
  },
  {
    "name": "default",
    "cat": "logic",
    "arity": [
      2,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "any",
    "pure": true,
    "desc": "空则取默认值"
  },
  {
    "name": "add",
    "cat": "math",
    "arity": [
      2,
      null
    ],
    "params": [
      "number"
    ],
    "variadic": true,
    "returns": "number",
    "pure": true,
    "desc": "求和（高精度十进制语义，非 IEEE754 累加）"
  },
  {
    "name": "sub",
    "cat": "math",
    "arity": [
      2,
      2
    ],
    "params": [
      "number",
      "number"
    ],
    "returns": "number",
    "pure": true,
    "desc": "差"
  },
  {
    "name": "mul",
    "cat": "math",
    "arity": [
      2,
      null
    ],
    "params": [
      "number"
    ],
    "variadic": true,
    "returns": "number",
    "pure": true,
    "desc": "积"
  },
  {
    "name": "div",
    "cat": "math",
    "arity": [
      2,
      2
    ],
    "params": [
      "number",
      "number"
    ],
    "returns": "number",
    "pure": true,
    "desc": "商；除数为 0 时返回 null 而非抛错"
  },
  {
    "name": "mod",
    "cat": "math",
    "arity": [
      2,
      2
    ],
    "params": [
      "integer",
      "integer"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "取余"
  },
  {
    "name": "round",
    "cat": "math",
    "arity": [
      1,
      2
    ],
    "params": [
      "number",
      "integer"
    ],
    "returns": "number",
    "pure": true,
    "desc": "四舍五入，第二参数为小数位"
  },
  {
    "name": "floor",
    "cat": "math",
    "arity": [
      1,
      1
    ],
    "params": [
      "number"
    ],
    "returns": "number",
    "pure": true,
    "desc": "向下取整"
  },
  {
    "name": "ceil",
    "cat": "math",
    "arity": [
      1,
      1
    ],
    "params": [
      "number"
    ],
    "returns": "number",
    "pure": true,
    "desc": "向上取整"
  },
  {
    "name": "abs",
    "cat": "math",
    "arity": [
      1,
      1
    ],
    "params": [
      "number"
    ],
    "returns": "number",
    "pure": true,
    "desc": "绝对值"
  },
  {
    "name": "min",
    "cat": "math",
    "arity": [
      1,
      null
    ],
    "params": [
      "number"
    ],
    "variadic": true,
    "returns": "number",
    "pure": true,
    "desc": "最小值，也接受单个数组"
  },
  {
    "name": "max",
    "cat": "math",
    "arity": [
      1,
      null
    ],
    "params": [
      "number"
    ],
    "variadic": true,
    "returns": "number",
    "pure": true,
    "desc": "最大值，也接受单个数组"
  },
  {
    "name": "sum",
    "cat": "math",
    "arity": [
      1,
      2
    ],
    "params": [
      "array",
      "string"
    ],
    "returns": "number",
    "pure": true,
    "desc": "数组求和，第二参数可选指定字段名"
  },
  {
    "name": "avg",
    "cat": "math",
    "arity": [
      1,
      2
    ],
    "params": [
      "array",
      "string"
    ],
    "returns": "number",
    "pure": true,
    "desc": "数组均值"
  },
  {
    "name": "concat",
    "cat": "string",
    "arity": [
      1,
      null
    ],
    "params": [
      "string"
    ],
    "variadic": true,
    "returns": "string",
    "pure": true,
    "desc": "连接为字符串，null/undefined 视为空串"
  },
  {
    "name": "upper",
    "cat": "string",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "转大写"
  },
  {
    "name": "lower",
    "cat": "string",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "转小写"
  },
  {
    "name": "trim",
    "cat": "string",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "去首尾空白"
  },
  {
    "name": "substr",
    "cat": "string",
    "arity": [
      2,
      3
    ],
    "params": [
      "string",
      "integer",
      "integer"
    ],
    "returns": "string",
    "pure": true,
    "desc": "截取子串，start/length"
  },
  {
    "name": "replace",
    "cat": "string",
    "arity": [
      3,
      3
    ],
    "params": [
      "string",
      "string",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "全部替换（非正则，避免注入）"
  },
  {
    "name": "split",
    "cat": "string",
    "arity": [
      2,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "array",
    "pure": true,
    "desc": "按分隔符切分"
  },
  {
    "name": "join",
    "cat": "string",
    "arity": [
      1,
      3
    ],
    "params": [
      "array",
      "string",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "连接数组，可指定分隔符与字段名"
  },
  {
    "name": "padStart",
    "cat": "string",
    "arity": [
      3,
      3
    ],
    "params": [
      "string",
      "integer",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "左填充，如学号补零"
  },
  {
    "name": "padEnd",
    "cat": "string",
    "arity": [
      3,
      3
    ],
    "params": [
      "string",
      "integer",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "右填充"
  },
  {
    "name": "len",
    "cat": "string",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "长度：字符串按字符、数组/对象按元素数"
  },
  {
    "name": "indexOf",
    "cat": "string",
    "arity": [
      2,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "查找位置，未找到返回 -1"
  },
  {
    "name": "format",
    "cat": "string",
    "arity": [
      1,
      null
    ],
    "params": [
      "string"
    ],
    "variadic": true,
    "returns": "string",
    "pure": true,
    "desc": "占位符格式化，首参含 {0} {1}"
  },
  {
    "name": "first",
    "cat": "array",
    "arity": [
      1,
      1
    ],
    "params": [
      "array"
    ],
    "returns": "any",
    "pure": true,
    "desc": "首元素"
  },
  {
    "name": "last",
    "cat": "array",
    "arity": [
      1,
      1
    ],
    "params": [
      "array"
    ],
    "returns": "any",
    "pure": true,
    "desc": "末元素"
  },
  {
    "name": "nth",
    "cat": "array",
    "arity": [
      2,
      2
    ],
    "params": [
      "array",
      "integer"
    ],
    "returns": "any",
    "pure": true,
    "desc": "第 n 个元素（0 基）"
  },
  {
    "name": "slice",
    "cat": "array",
    "arity": [
      2,
      3
    ],
    "params": [
      "array",
      "integer",
      "integer"
    ],
    "returns": "array",
    "pure": true,
    "desc": "切片"
  },
  {
    "name": "filter",
    "cat": "array",
    "arity": [
      2,
      2
    ],
    "params": [
      "array",
      "any"
    ],
    "returns": "array",
    "pure": true,
    "desc": "过滤，第二参数为子表达式（作用域内新增 $item 与 $index）"
  },
  {
    "name": "map",
    "cat": "array",
    "arity": [
      2,
      2
    ],
    "params": [
      "array",
      "any"
    ],
    "returns": "array",
    "pure": true,
    "desc": "映射，作用域同 filter"
  },
  {
    "name": "sort",
    "cat": "array",
    "arity": [
      1,
      3
    ],
    "params": [
      "array",
      "string",
      "string"
    ],
    "returns": "array",
    "pure": true,
    "desc": "排序，可指定字段与方向 asc|desc"
  },
  {
    "name": "reverse",
    "cat": "array",
    "arity": [
      1,
      1
    ],
    "params": [
      "array"
    ],
    "returns": "array",
    "pure": true,
    "desc": "反转"
  },
  {
    "name": "unique",
    "cat": "array",
    "arity": [
      1,
      2
    ],
    "params": [
      "array",
      "string"
    ],
    "returns": "array",
    "pure": true,
    "desc": "去重，可指定字段"
  },
  {
    "name": "flatten",
    "cat": "array",
    "arity": [
      1,
      2
    ],
    "params": [
      "array",
      "integer"
    ],
    "returns": "array",
    "pure": true,
    "desc": "展平，深度默认 1"
  },
  {
    "name": "groupBy",
    "cat": "array",
    "arity": [
      2,
      2
    ],
    "params": [
      "array",
      "string"
    ],
    "returns": "object",
    "pure": true,
    "desc": "按字段分组为 {key: rows[]}"
  },
  {
    "name": "pluck",
    "cat": "array",
    "arity": [
      2,
      2
    ],
    "params": [
      "array",
      "string"
    ],
    "returns": "array",
    "pure": true,
    "desc": "抽取字段为数组"
  },
  {
    "name": "size",
    "cat": "array",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "元素个数"
  },
  {
    "name": "get",
    "cat": "object",
    "arity": [
      2,
      3
    ],
    "params": [
      "object",
      "string",
      "any"
    ],
    "returns": "any",
    "pure": true,
    "desc": "安全深取值，支持 a.b[0].c，缺失返回第三参数或 null"
  },
  {
    "name": "has",
    "cat": "object",
    "arity": [
      2,
      2
    ],
    "params": [
      "object",
      "string"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "路径是否存在"
  },
  {
    "name": "keys",
    "cat": "object",
    "arity": [
      1,
      1
    ],
    "params": [
      "object"
    ],
    "returns": "array",
    "pure": true,
    "desc": "键数组"
  },
  {
    "name": "values",
    "cat": "object",
    "arity": [
      1,
      1
    ],
    "params": [
      "object"
    ],
    "returns": "array",
    "pure": true,
    "desc": "值数组"
  },
  {
    "name": "merge",
    "cat": "object",
    "arity": [
      1,
      null
    ],
    "params": [
      "object"
    ],
    "variadic": true,
    "returns": "object",
    "pure": true,
    "desc": "浅合并，后者覆盖前者"
  },
  {
    "name": "toNumber",
    "cat": "type",
    "arity": [
      1,
      2
    ],
    "params": [
      "any",
      "any"
    ],
    "returns": "number",
    "pure": true,
    "desc": "转数字，失败返回第二参数或 null"
  },
  {
    "name": "toString",
    "cat": "type",
    "arity": [
      1,
      2
    ],
    "params": [
      "any",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "转字符串"
  },
  {
    "name": "toBool",
    "cat": "type",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "boolean",
    "pure": true,
    "desc": "转布尔，遵循 'false'/'0'/'' 为假"
  },
  {
    "name": "toDate",
    "cat": "type",
    "arity": [
      1,
      2
    ],
    "params": [
      "any",
      "string"
    ],
    "returns": "date",
    "pure": true,
    "desc": "转日期，第二参数为输入格式"
  },
  {
    "name": "toArray",
    "cat": "type",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "array",
    "pure": true,
    "desc": "标量包成单元素数组，数组原样返回"
  },
  {
    "name": "typeOf",
    "cat": "type",
    "arity": [
      1,
      1
    ],
    "params": [
      "any"
    ],
    "returns": "string",
    "pure": true,
    "desc": "返回 null|string|number|boolean|array|object|date"
  },
  {
    "name": "now",
    "cat": "date",
    "arity": [
      0,
      0
    ],
    "params": [],
    "returns": "date",
    "pure": false,
    "desc": "当前时间，等价 $now。非纯，禁止用于下推位置"
  },
  {
    "name": "today",
    "cat": "date",
    "arity": [
      0,
      0
    ],
    "params": [],
    "returns": "date",
    "pure": false,
    "desc": "今日零点"
  },
  {
    "name": "dateAdd",
    "cat": "date",
    "arity": [
      3,
      3
    ],
    "params": [
      "date",
      "integer",
      "string"
    ],
    "returns": "date",
    "pure": true,
    "desc": "日期加减，单位 year|month|week|day|hour|minute"
  },
  {
    "name": "dateDiff",
    "cat": "date",
    "arity": [
      2,
      3
    ],
    "params": [
      "date",
      "date",
      "string"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "日期差，单位默认 day"
  },
  {
    "name": "formatDate",
    "cat": "date",
    "arity": [
      1,
      2
    ],
    "params": [
      "date",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "格式化，默认 yyyy-MM-dd HH:mm:ss"
  },
  {
    "name": "startOf",
    "cat": "date",
    "arity": [
      2,
      2
    ],
    "params": [
      "date",
      "string"
    ],
    "returns": "date",
    "pure": true,
    "desc": "区间起点，单位 day|week|month|quarter|year"
  },
  {
    "name": "endOf",
    "cat": "date",
    "arity": [
      2,
      2
    ],
    "params": [
      "date",
      "string"
    ],
    "returns": "date",
    "pure": true,
    "desc": "区间终点"
  },
  {
    "name": "year",
    "cat": "date",
    "arity": [
      1,
      1
    ],
    "params": [
      "date"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "取年，如学期归属"
  },
  {
    "name": "month",
    "cat": "date",
    "arity": [
      1,
      1
    ],
    "params": [
      "date"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "取月（1-12）"
  },
  {
    "name": "day",
    "cat": "date",
    "arity": [
      1,
      1
    ],
    "params": [
      "date"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "取日"
  },
  {
    "name": "maskIdCard",
    "cat": "security",
    "arity": [
      1,
      2
    ],
    "params": [
      "string",
      "integer"
    ],
    "returns": "string",
    "pure": true,
    "desc": "身份证脱敏，默认保留前 6 后 4"
  },
  {
    "name": "maskPhone",
    "cat": "security",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "手机号脱敏 138****8000"
  },
  {
    "name": "maskName",
    "cat": "security",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "姓名脱敏，保留姓氏"
  },
  {
    "name": "maskEmail",
    "cat": "security",
    "arity": [
      1,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "邮箱脱敏"
  },
  {
    "name": "hash",
    "cat": "security",
    "arity": [
      1,
      2
    ],
    "params": [
      "string",
      "string"
    ],
    "returns": "string",
    "pure": true,
    "desc": "哈希，算法默认 sha256"
  },
  {
    "name": "uuid",
    "cat": "security",
    "arity": [
      0,
      0
    ],
    "params": [],
    "returns": "string",
    "pure": false,
    "desc": "生成 UUID v4"
  },
  {
    "name": "entityField",
    "cat": "data",
    "arity": [
      3,
      3
    ],
    "params": [
      "string",
      "string",
      "any"
    ],
    "returns": "any",
    "pure": false,
    "desc": "按实体 key + 主键取字段值（BFF 侧带租户与数据权限校验；禁止在 rowFilter 中使用）"
  },
  {
    "name": "lookup",
    "cat": "data",
    "arity": [
      2,
      3
    ],
    "params": [
      "array",
      "any",
      "string"
    ],
    "returns": "any",
    "pure": true,
    "desc": "在本地数组中按主键查行，第三参数指定返回字段"
  },
  {
    "name": "processVariable",
    "cat": "flow",
    "arity": [
      1,
      2
    ],
    "params": [
      "string",
      "any"
    ],
    "returns": "any",
    "pure": false,
    "desc": "读取流程变量（审批流页面与流程监听器内可用）"
  },
  {
    "name": "taskAssignee",
    "cat": "flow",
    "arity": [
      0,
      1
    ],
    "params": [
      "string"
    ],
    "returns": "any",
    "pure": false,
    "desc": "当前任务办理人，参数为任务 key 时查指定任务"
  },
  {
    "name": "isTaskClaimed",
    "cat": "flow",
    "arity": [
      0,
      0
    ],
    "params": [],
    "returns": "boolean",
    "pure": false,
    "desc": "当前任务是否已被认领"
  },
  {
    "name": "fileName",
    "cat": "file",
    "arity": [
      1,
      1
    ],
    "params": [
      "file"
    ],
    "returns": "string",
    "pure": true,
    "desc": "取文件名"
  },
  {
    "name": "fileExt",
    "cat": "file",
    "arity": [
      1,
      1
    ],
    "params": [
      "file"
    ],
    "returns": "string",
    "pure": true,
    "desc": "取扩展名（小写，不含点）"
  },
  {
    "name": "fileSize",
    "cat": "file",
    "arity": [
      1,
      1
    ],
    "params": [
      "file"
    ],
    "returns": "integer",
    "pure": true,
    "desc": "取字节数"
  },
  {
    "name": "fileUrl",
    "cat": "file",
    "arity": [
      1,
      2
    ],
    "params": [
      "file",
      "boolean"
    ],
    "returns": "string",
    "pure": false,
    "desc": "取可访问地址，第二参数为是否强制签发临时签名 URL"
  }
] as const;

export const EXPRESSION_QUERY_OPERATORS = [
  {
    "op": "eq",
    "label": "等于",
    "args": 1,
    "sql": "{col} = {p}",
    "widgetHint": "x-input"
  },
  {
    "op": "ne",
    "label": "不等于",
    "args": 1,
    "sql": "{col} <> {p}",
    "widgetHint": "x-input"
  },
  {
    "op": "like",
    "label": "包含",
    "args": 1,
    "sql": "{col} ILIKE {p}",
    "widgetHint": "x-input",
    "note": "值由编译器包 % 并由参数绑定，禁止字符串拼接"
  },
  {
    "op": "startsWith",
    "label": "开头是",
    "args": 1,
    "sql": "{col} ILIKE {p}",
    "widgetHint": "x-input"
  },
  {
    "op": "in",
    "label": "属于",
    "args": "n",
    "sql": "{col} = ANY({p})",
    "widgetHint": "x-select"
  },
  {
    "op": "between",
    "label": "区间",
    "args": 2,
    "sql": "{col} BETWEEN {p1} AND {p2}",
    "widgetHint": "x-date-picker",
    "note": "日期区间用 daterange，右端按字段类型补 23:59:59 或加一天"
  },
  {
    "op": "gt",
    "label": "大于",
    "args": 1,
    "sql": "{col} > {p}",
    "widgetHint": "x-number"
  },
  {
    "op": "gte",
    "label": "大于等于",
    "args": 1,
    "sql": "{col} >= {p}",
    "widgetHint": "x-number"
  },
  {
    "op": "lt",
    "label": "小于",
    "args": 1,
    "sql": "{col} < {p}",
    "widgetHint": "x-number"
  },
  {
    "op": "lte",
    "label": "小于等于",
    "args": 1,
    "sql": "{col} <= {p}",
    "widgetHint": "x-number"
  },
  {
    "op": "isNull",
    "label": "为空",
    "args": 0,
    "sql": "{col} IS NULL",
    "widgetHint": "x-switch"
  },
  {
    "op": "notNull",
    "label": "不为空",
    "args": 0,
    "sql": "{col} IS NOT NULL",
    "widgetHint": "x-switch"
  }
] as const;

export const EXPRESSION_VALUE_TYPES = [
  "any",
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "array",
  "object",
  "file",
  "null"
] as const;

/** 函数名清单，供校验器做 O(1) 命中查询。 */
export const EXPRESSION_FUNCTION_NAMES: readonly string[] = EXPRESSION_FUNCTIONS.map(item => item.name);

/** 函数分类清单，供属性面板分组展示。 */
export const EXPRESSION_FUNCTION_CATEGORIES: readonly string[] = Array.from(new Set(EXPRESSION_FUNCTIONS.map(item => item.cat)));

/**
 * 注册表里的约定性说明。AI 生成器可直接拼进 system prompt ——
 * 这几段是「模型最容易生成错、且错了最难查」的规则，值得反复投喂。
 */
export const EXPRESSION_DOCS = {
  "description": "统一表达式 DSL 的唯一权威注册表。前端求值器、BFF 求值器、Flowable 变量绑定、规则引擎、数据权限下推、AI 生成校验器全部读这一份。新增函数=改这一个文件；任何一端私自定义函数视为缺陷。",
  "statePathConvention": "状态读写路径约定：表达式读取统一带 $ 前缀根（$page.state.x / $form.x / $row.x）；AssignStep.target 写相对路径（state.x / form.x / row.x / vars.x）。两侧由同一份路径解析器实现，前端与 BFF 行为一致。",
  "pageHandlerConvention": "页面级 handlers 的键是页面生命周期事件（onLoad / onMount / onParamChange / onError / onUnmount / onBeforeLeave），不是业务动作；节点级 handlers 的键是该组件 EventDef 声明的事件名；可复用的业务逻辑一律沉淀为 LogicSchema.actions 并用 HandlerRef.actionRef 引用。",
  "assignToConvention": "结果落点约定：任何步骤的 assignTo 都接受 state.x / form.x / row.x / rows.x / vars.x 五类相对路径。state 写页面状态、form 写当前表单模型、row 写当前行、vars 写动作链临时变量。读回时分别用 $page.state.x / $form.x / $row.x / $ctx.vars.x。仅「紧邻下一步」读上一步原始结果才用 $ctx.result —— 这是新手最常踩的坑（下一步执行后 result 即被覆盖）。"
} as const;

/** 取值根文档（$user / $page / $row ...）。fields 供设计器变量选择器自动补全。 */
export type ExprValueRootDoc = (typeof EXPRESSION_VALUE_ROOTS)[number];

/** 注册表函数文档。AI 生成器据此约束可用函数名与实参个数。 */
export type ExprFunctionDoc = (typeof EXPRESSION_FUNCTIONS)[number];

/** 查询算子文档。前端渲染搜索项、BFF 生成 WHERE、出码生成查询函数三处共用。 */
export type QueryOperatorDoc = (typeof EXPRESSION_QUERY_OPERATORS)[number];

/* ---------------- 内置组件注册表 ---------------- */
/**
 * 内置组件注册表文件的形状。前端直接 import JSON（Vite 原生支持）：
 *   import builtins from "@lcp/registry/builtin-components.json";
 * 刻意不把 38 个组件内联成本文件的 TS 常量 —— 它是数据不是代码，
 * 内联会让 TS 语言服务反复对这一文件做字面量推断。
 */
export interface BuiltinComponentsFile {
  $schema?: string;
  protocolVersion: string;
  registryVersion: number;
  title?: string;
  description?: string;
  /** 控件解析优先级：UINode.props.fieldList[].widget > Field.uiHints.widget > itemType 命中 fieldBindings > Field.type 命中 fieldBindings（priority 小者优先）。 */
  fieldBindingRule?: string;
  /** 结构化 prop（columnList / fieldList / searchFieldList / buttonList / optionList / items）的元素契约说明。 */
  itemContractNote?: string;
  components: ComponentContract[];
}
