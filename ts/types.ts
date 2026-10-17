/**
 * LCP Schema Protocol v0.1 —— 由 6 份 JSON Schema 生成的类型定义。
 *
 * 本文件由 tools/gen-ts.mjs 生成，请勿手工修改 —— 先改 Schema，再重新生成：
 *   node tools/gen-ts.mjs
 *
 * 覆盖 6 个命名空间：Common(common) / Data(data) / Ui(ui) / Logic(logic) /
 * Component(component) / Bundle(bundle)。跨文件 $ref（含 https://lcp.dev 绝对形式）
 * 已全部解析为本地类型名。
 *
 * 手写部分不在本文件：
 *   expr.ts  common.Expr 的 5 分支模型（$lit / $ref / $fn / $tpl / $if）
 *   text.ts  common.Text 的多语言读写
 */
import type { Expr } from "./expr";

export type { Expr } from "./expr";

/* ======================================================================== */
/* common.schema.json —— 18 个定义，命名空间前缀 Common */
/* ======================================================================== */

/**
 * ULID。全局唯一、单调递增、永不重用。用于 diff/版本/回滚/AI 定点修改。绝不用 key 代替 id。
 * @pattern ^[0-9A-HJKMNP-TV-Z]{26}$
 */
export type CommonId = string;

/**
 * snake_case 元数据键。用于实体/字段/动作/页面/角色/枚举等「元数据标识」，同父作用域内唯一，可直接用作 SQL 列名。注意：参数名、局部变量名、HTTP 头名等「编程标识」不要用 Key，见 Ident / HttpToken。
 * @pattern ^[a-z][a-z0-9_]{0,62}$
 */
export type CommonKey = string;

/**
 * @minLength 1
 * @maxLength 64
 */
export type CommonName = string;

/**
 * @maxLength 2000
 */
export type CommonDescription = string;

/**
 * 单调递增版本号。回滚 = 以历史快照内容重新发布，version 继续递增（不覆盖）。
 * @minimum 1
 */
export type CommonVersion = number;

/**
 * system=平台内置模板；tenant=租户级复用；app=应用私有。
 */
export type CommonScope = "system" | "tenant" | "app";

export interface CommonChecksum {
  algo: "sha256";
  /**
   * @pattern ^[a-f0-9]{64}$
   */
  value: string;
}

export interface CommonTextDefault {
  default: string;
  i18n?: Record<string, string> | null;
}

/**
 * 可本地化文本。允许裸字符串（等价于 {default}）以简化手写 Schema。
 */
export type CommonText = string | CommonTextDefault;

/**
 * 语义描述层。面向 AI 生成与自然语言检索，运行时忽略。所有可寻址节点都必须预留此字段。
 */
export interface CommonSemantic {
  description?: CommonDescription | null;
  /**
   * 该节点「想干什么」的业务意图，供 AI 理解与生成时对齐
   * @maxLength 500
   */
  intent?: string | null;
  /**
   * few-shot 样例：值本身，或 {input, output} 结构
   */
  examples?: unknown[] | null;
  /**
   * 同义词，用于模糊检索与 NL 匹配
   */
  synonyms?: string[] | null;
  tags?: string[] | null;
  /**
   * 业务域，如 学籍 / 排课 / 考勤 / 报销 / 招聘
   */
  businessDomain?: string | null;
  aiHint?: CommonSemanticAiHint | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface CommonSemanticAiHint {
  generate?: "field" | "entity" | "form" | "list" | "page" | "flow" | "rule" | "api" | "component" | "detail" | null;
  constraints?: string[] | null;
  avoid?: string[] | null;
  /**
   * @minimum 0
   * @maximum 1
   */
  confidence?: number | null;
}

/**
 * 跨工件引用。version 缺省时解析到所属 snapshot 内该工件的版本 —— 这是「一次发布 = 一个原子快照」的实现基础。
 */
export interface CommonArtifactRefBase {
  kind: "dataSchema" | "uiSchema" | "logicSchema" | "component" | "asset" | "enum" | "action" | "api" | "flow" | "page" | "entity" | "field" | "role";
  id?: CommonId | null;
  key?: CommonKey | null;
  version?: CommonVersion | null;
  /**
   * 跨快照引用。仅模板市场导入 / 应用市场安装场景允许；运行时一律拒绝。L1 校验强制。
   */
  snapshotId?: CommonId | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 跨工件引用。version 缺省时解析到所属 snapshot 内该工件的版本 —— 这是「一次发布 = 一个原子快照」的实现基础。
 * @constraint 以下字段组至少提供一组：id 或 key
 */
export type CommonArtifactRef = CommonArtifactRefBase & ({ id: CommonId } | { key: CommonKey });

/**
 * 任意可绑定值：JSON 字面量，或 Expr。凡声明为 Value 的位置都支持数据绑定与表达式。
 */
export type CommonValue = string | number | boolean | Record<string, unknown> | unknown[] | null;

/**
 * 数据权限。设计期声明、编译期下推为 SQL 条件与字段裁剪，运行期不再解释。
 */
export interface CommonAccess {
  /**
   * 允许的角色 key。缺省=继承上层；空数组=仅超管
   */
  roles?: CommonKey[] | null;
  /**
   * 数据范围。self 依赖 ownerField，dept 依赖 deptField
   */
  scope?: "all" | "dept" | "deptAndChildren" | "self" | "custom" | null;
  /**
   * 数据归属字段（通常指向用户 id）
   */
  ownerField?: CommonKey | null;
  deptField?: CommonKey | null;
  /**
   * 行级过滤表达式，编译为追加的 WHERE 条件。禁止在此处调用非纯函数。
   */
  rowFilter?: Expr | null;
  /**
   * 为真则整体拒绝，优先级高于 roles
   */
  denyWhen?: Expr | null;
  /**
   * 字段级策略：hidden 不出现在 API 响应；masked 按脱敏函数输出；read 只读
   */
  fieldPolicy?: Record<string, "read" | "write" | "hidden" | "masked"> | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 二进制/文本资产引用。BPMN XML、图片、视频、导出代码均以资产形式独立版本化，避免污染结构 Schema。
 */
export interface CommonAssetRef {
  assetId: CommonId;
  /**
   * 资产在 bundle 内的逻辑键（如 tpl_batch_recall）。跨工件引用一律用 key，assetId 只用于存储寻址。
   */
  key: CommonKey;
  kind: "bpmn" | "image" | "video" | "document" | "spreadsheet" | "code" | "sql" | "other";
  version: CommonVersion;
  fileName?: string | null;
  mime?: string | null;
  /**
   * @minimum 0
   */
  size?: number | null;
  checksum?: CommonChecksum | null;
  /**
   * @default "oss"
   */
  storage?: "oss" | "inline" | "external" | null;
  /**
   * 仅 storage=external。oss 形态下由运行时按 assetId 解析，不落库绝对地址
   */
  url?: string | null;
  /**
   * 仅 storage=inline 时承载内容（小文件 / 单元测试 / 出码产物 / BPMN 定义）。大文件一律走 storage=oss + url。
   */
  inline?: CommonAssetRefInline | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 仅 storage=inline 时承载内容（小文件 / 单元测试 / 出码产物 / BPMN 定义）。大文件一律走 storage=oss + url。
 */
export interface CommonAssetRefInline {
  mediaType?: string | null;
  /**
   * @default "utf8"
   */
  encoding?: "utf8" | "base64" | null;
  content: string;
}

/**
 * 响应式断点。移动端/小程序出码时按断点降级。
 */
export type CommonBreakpointKey =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl";

/**
 * 编程标识符：动作/API 入参名、页面参数名、代码步骤的输入输出变量名、按钮键。允许 camelCase，因为它要直接落到 TS 变量名与 JS 对象属性名上，不能带连字符。
 * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,62}$
 */
export type CommonIdent = string;

/**
 * RFC 7230 的 HTTP 头字段名（token 语法）。含连字符，因此既不是 Key 也不是 Ident。
 * @pattern ^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$
 */
export type CommonHttpToken = string;

/**
 * 相对 JSONPath：以 $ 开头，如 $.data、$.data.rows、$.data[0].id。用于声明式取值路径（行集 / 总数 / 错误信息 / 出参映射）。它不是 Expr：不参与运算，只做定位，因此不允许写函数或取值根。
 * @pattern ^\$(\.[A-Za-z0-9_-]+|\[[0-9]+\])*$
 */
export type CommonJsonPath = string;

/* ======================================================================== */
/* data.schema.json —— 15 个定义，命名空间前缀 Data */
/* ======================================================================== */

export interface DataSchema {
  id: CommonId;
  key: CommonKey;
  name: CommonName;
  scope?: CommonScope | null;
  version: CommonVersion;
  description?: CommonDescription | null;
  /**
   * @minItems 1
   */
  entities: DataEntity[];
  enums?: DataEnumDef[] | null;
  access?: CommonAccess | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 实体 = 一张业务表 + 一份运行时模型定义。所有实体强制带租户列。
 */
export interface DataEntity {
  id: CommonId;
  key: CommonKey;
  name: CommonName;
  /**
   * 物理表名。缺省由 key 推导
   * @pattern ^[a-z][a-z0-9_]{0,62}$
   */
  tableName?: string | null;
  /**
   * 代表该行人类可读标题的字段，用于引用选择器与流程标题
   */
  titleField?: CommonKey | null;
  /**
   * @default true
   */
  enabled?: boolean | null;
  storage: DataEntityStorage;
  /**
   * @minItems 1
   */
  fields: DataField[];
  relations?: DataRelation[] | null;
  indexes?: DataIndex[] | null;
  access?: CommonAccess | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 物理落库策略。多租户与软删除由平台统一注入，业务 Schema 不得覆盖 tenantColumn 的取值方式。
 */
export interface DataEntityStorage {
  /**
   * @default "id"
   */
  primaryKey?: CommonKey | null;
  /**
   * ulid 天然有序，作为聚簇主键对 PG 最友好
   * @default "ulid"
   */
  idType?: "ulid" | "uuid" | "bigint" | "snowflake" | null;
  /**
   * null 表示该实体为全局共享表（仅 system scope 允许）
   * @default "tenant_id"
   */
  tenantColumn?: string | null | null;
  /**
   * 承载 storage=jsonb 字段的列
   * @default "ext"
   */
  jsonbColumn?: CommonKey | null;
  softDelete?: DataEntityStorageSoftDelete | null;
  timestamps?: DataEntityStorageTimestamps | null;
  /**
   * 开启后追加 version 列，BFF 更新时自动带版本条件
   * @default false
   */
  optimisticLock?: boolean | null;
  /**
   * 开启后所有写入落审计表，审批流场景建议开启
   * @default false
   */
  auditLog?: boolean | null;
  /**
   * 分区列，如按学年 semester 分区
   */
  partitionBy?: string | null | null;
  comment?: string | null;
  semantic?: DataSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface DataEntityStorageSoftDelete {
  /**
   * @default true
   */
  enabled?: boolean | null;
  /**
   * @default "deleted_at"
   */
  column?: CommonKey | null;
  /**
   * @default "timestamp"
   */
  type?: "timestamp" | "boolean" | null;
}

export interface DataEntityStorageTimestamps {
  /**
   * @default "created_at"
   */
  createdAt?: string | null | null;
  /**
   * @default "updated_at"
   */
  updatedAt?: string | null | null;
  /**
   * @default "created_by"
   */
  createdBy?: string | null | null;
  /**
   * @default "updated_by"
   */
  updatedBy?: string | null | null;
}

/**
 * 字段。storage 是本协议最关键的取舍面：column 字段参与索引/外键/SQL 过滤，jsonb 字段零 DDL 成本但不建索引（除非显式建 GIN 索引）。
 */
export interface DataField {
  id: CommonId;
  key: CommonKey;
  label: CommonText;
  type: DataFieldType;
  /**
   * jsonb=默认零成本演进；column=需要索引/唯一/外键/聚合时必须显式声明
   * @default "jsonb"
   */
  storage?: "column" | "jsonb" | null;
  /**
   * 仅 storage=column：覆盖默认 DDL 类型，如 varchar(32) / numeric(12,2) / text[]
   */
  columnType?: string | null;
  /**
   * @minimum 1
   */
  length?: number | null;
  /**
   * @minimum 1
   */
  precision?: number | null;
  /**
   * @minimum 0
   */
  scale?: number | null;
  /**
   * 服务端强校验。表单必填另由 UI 层 required 控制，二者独立
   * @default false
   */
  required?: boolean | null;
  /**
   * 唯一约束作用域为 (tenantColumn, 本字段)
   * @default false
   */
  unique?: boolean | null;
  defaultValue?: CommonValue | null;
  /**
   * 创建后不可修改，如学号
   * @default false
   */
  immutable?: boolean | null;
  /**
   * 标记后默认进入 fieldPolicy=masked，且参与审计与导出脱敏
   * @default false
   */
  sensitive?: boolean | null;
  /**
   * type=enum 时指向枚举定义
   */
  enumRef?: CommonArtifactRef | null;
  /**
   * type=enum 且不引用共享枚举时内联定义
   */
  enumValues?: DataEnumValue[] | null;
  /**
   * type=ref 时指向目标实体
   */
  refEntity?: CommonArtifactRef | null;
  /**
   * type=ref 时目标实体的显示字段，缺省取目标 titleField
   */
  refField?: CommonKey | null;
  /**
   * type=array 时的元素类型，递归深度上限 3 层（L2 校验）
   */
  itemType?: DataValueType | null;
  /**
   * type=formula 时的计算表达式。编译为生成列或运行时派生，由 storage 决定
   */
  formula?: Expr | null;
  validators?: DataValidator[] | null;
  uiHints?: DataUiHints | null;
  access?: CommonAccess | null;
  /**
   * 是否参与默认全局搜索。为真时 L3 校验要求 storage=column 或存在对应 GIN 索引
   * @default false
   */
  searchable?: boolean | null;
  /**
   * @default false
   */
  sortable?: boolean | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 封闭集合。新增类型须同步更新：PG 类型映射表、TS 类型生成器、Java 类型生成器、默认渲染组件表（四处齐改，L3 校验会检查映射表完整性）
 */
export type DataFieldType =
  | "string"
  | "text"
  | "richText"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "json"
  | "enum"
  | "ref"
  | "file"
  | "image"
  | "video"
  | "array"
  | "signature"
  | "location"
  | "formula";

export interface DataValueType {
  type: DataFieldType;
  /**
   * 细分格式，如 date 的 yyyy-MM-dd、string 的 email/url/phone
   */
  format?: string | null;
  enumRef?: CommonArtifactRef | null;
  enumValues?: DataEnumValue[] | null;
  refEntity?: CommonArtifactRef | null;
  itemType?: DataValueType | null;
  semantic?: CommonSemantic | null;
}

export interface DataEnumDef {
  id: CommonId;
  key: CommonKey;
  name: CommonName;
  scope?: CommonScope | null;
  /**
   * @minItems 1
   */
  values: DataEnumValue[];
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface DataEnumValue {
  value: string | number | boolean;
  label: CommonText;
  /**
   * 展示色，如 #52c41a 或 success｜warning｜danger
   */
  color?: string | null;
  order?: number | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  semantic?: CommonSemantic | null;
}

export interface DataValidatorMin {
  /**
   * @const "min"
   */
  type: "min";
  value: number;
  message?: CommonText | null;
}

export interface DataValidatorMax {
  /**
   * @const "max"
   */
  type: "max";
  value: number;
  message?: CommonText | null;
}

export interface DataValidatorMinLength {
  /**
   * @const "minLength"
   */
  type: "minLength";
  /**
   * @minimum 0
   */
  value: number;
  message?: CommonText | null;
}

export interface DataValidatorMaxLength {
  /**
   * @const "maxLength"
   */
  type: "maxLength";
  /**
   * @minimum 0
   */
  value: number;
  message?: CommonText | null;
}

export interface DataValidatorPattern {
  /**
   * @const "pattern"
   */
  type: "pattern";
  value: string;
  message?: CommonText | null;
}

export interface DataValidatorRange {
  /**
   * @const "range"
   */
  type: "range";
  min?: number | null;
  max?: number | null;
  message?: CommonText | null;
}

export interface DataValidatorFileMaxSize {
  /**
   * @const "fileMaxSize"
   */
  type: "fileMaxSize";
  /**
   * 字节
   */
  value: number;
  message?: CommonText | null;
}

export interface DataValidatorFileAccept {
  /**
   * @const "fileAccept"
   */
  type: "fileAccept";
  /**
   * 如 ['pdf','docx','xlsx']
   */
  value: string[];
  message?: CommonText | null;
}

export interface DataValidatorExpr {
  /**
   * @const "expr"
   */
  type: "expr";
  value: Expr;
  message?: CommonText | null;
}

export interface DataValidatorUniqueIn {
  /**
   * @const "uniqueIn"
   */
  type: "uniqueIn";
  /**
   * @minItems 1
   */
  fields: CommonKey[];
  /**
   * @default true
   */
  ignoreSoftDeleted?: boolean | null;
  message?: CommonText | null;
}

/**
 * 校验器。expr 形态用于跨字段联动校验（如结束日期不早于开始日期）。
 * @discriminant properties.type
 */
export type DataValidator =
  | DataValidatorMin
  | DataValidatorMax
  | DataValidatorMinLength
  | DataValidatorMaxLength
  | DataValidatorPattern
  | DataValidatorRange
  | DataValidatorFileMaxSize
  | DataValidatorFileAccept
  | DataValidatorExpr
  | DataValidatorUniqueIn;

/**
 * 设计器默认值来源。仅影响默认生成，不限制设计器中改选其他组件。
 */
export interface DataUiHints {
  /**
   * 优先渲染的组件名，如 el-select / x-upload
   */
  widget?: string | null;
  placeholder?: CommonText | null;
  help?: CommonText | null;
  /**
   * 表单分组标题
   */
  group?: string | null;
  order?: number | null;
  /**
   * 24 栅格
   * @minimum 1
   * @maximum 24
   */
  colSpan?: number | null;
  /**
   * 多行文本行数
   */
  rows?: number | null;
  prefix?: string | null;
  suffix?: string | null;
  options?: DataEnumValue[] | null;
  /**
   * @default false
   */
  hideInList?: boolean | null;
  /**
   * @default false
   */
  hideInForm?: boolean | null;
  /**
   * 列表列宽
   */
  width?: number | null;
  fixed?: "left" | "right" | null;
  /**
   * @default false
   */
  copyable?: boolean | null;
  /**
   * @default false
   */
  sortable?: boolean | null;
  /**
   * 上传配置。provider=oss 时走 STS 临时凭证客户端直传，服务端只收回调与元数据
   */
  upload?: DataUiHintsUpload | null;
  semantic?: DataSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 上传配置。provider=oss 时走 STS 临时凭证客户端直传，服务端只收回调与元数据
 */
export interface DataUiHintsUpload {
  /**
   * @default "oss"
   */
  provider?: "oss" | "local" | null;
  /**
   * 扩展名白名单，如 ['jpg','png','mp4','pdf','docx','xlsx']
   */
  accept?: string[] | null;
  /**
   * 单文件字节上限
   */
  maxSize?: number | null;
  /**
   * @default 1
   */
  maxCount?: number | null;
  /**
   * @default false
   */
  multiple?: boolean | null;
  /**
   * @default true
   */
  preview?: boolean | null;
  /**
   * @default false
   */
  compressImage?: boolean | null;
  /**
   * OSS 路径模板，支持 {tenant}/{app}/{entity}/{yyyy}/{MM}/{ulid}.{ext}
   */
  pathTemplate?: string | null;
}

export interface DataRelation {
  id: CommonId;
  key: CommonKey;
  name?: CommonName | null;
  type: "oneToOne" | "oneToMany" | "manyToOne" | "manyToMany";
  from: DataEndpoint;
  to: DataEndpoint;
  /**
   * 仅 manyToMany 需要
   */
  join?: DataJoinTable | null;
  /**
   * 默认 restrict —— 低代码场景下误删成本远高于维护成本
   * @default "restrict"
   */
  onDelete?: "cascade" | "restrict" | "setNull" | "none" | null;
  /**
   * @default "restrict"
   */
  onUpdate?: "cascade" | "restrict" | "setNull" | "none" | null;
  /**
   * 目标端反向导航属性名，用于生成 target.relations[]
   */
  remoteName?: CommonKey | null;
  /**
   * @default false
   */
  required?: boolean | null;
  /**
   * 默认懒加载，列表接口不自动 join，避免 N+1 与响应体膨胀
   * @default true
   */
  lazy?: boolean | null;
  semantic?: CommonSemantic | null;
}

export interface DataEndpoint {
  entityRef: CommonArtifactRef;
  /**
   * 参与关联的字段 key，必须是 storage=column
   */
  fieldKey: CommonKey;
  semantic?: DataSemantic | null;
}

export interface DataJoinTable {
  /**
   * @pattern ^[a-z][a-z0-9_]{0,62}$
   */
  tableName: string;
  fromColumn: CommonKey;
  toColumn: CommonKey;
  extraColumns?: CommonKey[] | null;
  semantic?: DataSemantic | null;
}

export interface DataIndex {
  id: CommonId;
  name: string;
  /**
   * @minItems 1
   */
  fields: CommonKey[];
  /**
   * @default false
   */
  unique?: boolean | null;
  /**
   * gin 用于 jsonb 字段的包含查询：fields 中可写 ext->>'status' 形式的表达式
   * @default "btree"
   */
  method?: "btree" | "gin" | "gist" | "hash" | null;
  orders?: ("asc" | "desc")[] | null;
  /**
   * 部分索引条件。仅允许 pure=true 的函数（L4 校验）
   */
  where?: Expr | null;
  /**
   * 出码时生成 CREATE INDEX CONCURRENTLY，避免锁表
   * @default true
   */
  concurrently?: boolean | null;
  note?: string | null;
  semantic?: DataSemantic | null;
}

/** @alias 该定义是 CommonSemantic 的别名，不引入新结构。 */
export type DataSemantic = CommonSemantic;

/* ======================================================================== */
/* ui.schema.json —— 25 个定义，命名空间前缀 Ui */
/* ======================================================================== */

export interface UISchema {
  id: CommonId;
  key: CommonKey;
  title: CommonText;
  kind: UiPageKind;
  scope?: CommonScope | null;
  version: CommonVersion;
  description?: CommonDescription | null;
  route?: UiRouteSpec | null;
  params?: UiPageParam[] | null;
  dataSources?: UiDataSource[] | null;
  /**
   * 页面级响应式状态，供表达式以 $page.state.<key> 引用
   */
  state?: Record<string, UiStateVar> | null;
  layout: UINode;
  /**
   * 具名弹窗/抽屉的子树，供 openDialog 动作按 key 打开（新建/编辑弹窗表单走这里）
   */
  dialogs?: Record<string, UINode> | null;
  /**
   * 页面级事件：onLoad / onMount / onUnmount / onParamChange
   */
  handlers?: Record<string, UiHandlerRef> | null;
  access?: CommonAccess | null;
  seo?: UISchemaSeo | null;
  origin?: UiOrigin | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UISchemaSeo {
  keywords?: string | null;
  description?: string | null;
}

/**
 * 页面语义类型。运行时渲染不依赖它，但它决定设计器的默认模板、出码的目标结构（移动端不做 dashboard）与 AI 的生成策略。
 */
export type UiPageKind =
  | "list"
  | "form"
  | "detail"
  | "dashboard"
  | "approval"
  | "report"
  | "custom"
  | "login"
  | "error";

export interface UiRouteSpec {
  /**
   * 支持 :id 动态段、:id? 可选段、(*) 正则组等 vue-router 语法
   * @pattern ^/[A-Za-z0-9_\-/:*?()]*$
   */
  path: string;
  name?: string | null;
  /**
   * @default "default"
   */
  layout?: "default" | "blank" | "side" | "top" | "tabs" | null;
  /**
   * @default false
   */
  keepAlive?: boolean | null;
  /**
   * @default "none"
   */
  cache?: "none" | "page" | "data" | null;
  /**
   * @default true
   */
  auth?: boolean | null;
  roles?: CommonKey[] | null;
  redirect?: string | null;
  meta?: Record<string, unknown> | null;
  semantic?: UiSemantic | null;
}

export interface UiPageParam {
  key: CommonIdent;
  label?: CommonText | null;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "array" | "json";
  /**
   * @default "query"
   */
  from?: "query" | "route" | "context" | "state" | null;
  /**
   * @default false
   */
  required?: boolean | null;
  defaultValue?: CommonValue | null;
  semantic?: CommonSemantic | null;
}

export interface UiStateVar {
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "array" | "object" | "json";
  initial?: CommonValue | null;
  /**
   * query 表示与 URL 同步，保证刷新与分享可复现筛选条件
   * @default "none"
   */
  persist?: "none" | "session" | "local" | "query" | null;
  description?: string | null;
  semantic?: UiSemantic | null;
}

/**
 * 生成溯源。记录 layout 从何而来，使模板升级与 AI 重生成可幂等重放，同时为 AI 生成质量留可观测数据。
 */
export interface UiOrigin {
  generator: "human" | "template" | "ai" | "import";
  templateId?: string | null;
  templateVersion?: CommonVersion | null;
  params?: Record<string, unknown> | null;
  /**
   * AI 生成时的模型标识
   */
  model?: string | null;
  /**
   * AI 生成时的原始自然语言输入，用于复现与人工修正回流
   */
  prompt?: string | null;
  /**
   * @format date-time
   */
  generatedAt?: string | null;
  semantic?: UiSemantic | null;
}

/**
 * 渲染树节点。id 必须全局唯一且稳定 —— 它是 diff、版本对比、AI 定点修改、埋点定位的共同锚点。
 */
export interface UINode {
  id: CommonId;
  /**
   * 组件名。内建组件注册在平台；租户自定义组件须存在同名 ComponentContract（L2 校验）
   * @minLength 1
   */
  component: string;
  /**
   * 可选语义标识，出码时用于生成变量名/类名
   */
  key?: CommonKey | null;
  label?: CommonText | null;
  /**
   * 组件属性。每个 prop 是否允许表达式由 ComponentContract 的 bindable 决定（L2 校验）
   */
  props?: Record<string, CommonValue> | null;
  bind?: UiNodeBinding | null;
  /**
   * 为假则不渲染。与 style 的 hidden 区别：visible 不产生 DOM 节点
   */
  visible?: Expr | null;
  disable?: Expr | null;
  style?: UiNodeStyle | null;
  responsive?: UiResponsive | null;
  /**
   * 具名插槽子树。插槽是否存在及 multiplicity 由组件契约的 slot 定义约束
   */
  slots?: Record<string, UINode[]> | null;
  /**
   * 默认插槽子树。仅当组件契约 container=true 时允许（L2 校验）
   */
  children?: UINode[] | null;
  /**
   * 事件处理器。键必须是组件契约 events[] 中声明的事件名（L2 校验）
   */
  handlers?: Record<string, UiHandlerRef> | null;
  /**
   * 列表渲染。作用域内提供 $item / $index / $loop
   */
  loop?: UiLoopSpec | null;
  /**
   * 锁定后设计器不可拖动或删除，用于模板骨架与平台保留区域
   * @default false
   */
  locked?: boolean | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UiLoopSpec {
  over: Expr;
  /**
   * @default "item"
   */
  itemName?: string | null;
  /**
   * @default "index"
   */
  indexName?: string | null;
  /**
   * 用于生成 :key；缺省用索引，可能引发复用错乱
   */
  keyField?: CommonKey | null;
  semantic?: UiSemantic | null;
}

/**
 * 节点与数据的关联声明。这是元数据驱动在页面层最直接的体现：组件不自己发请求，只声明它消费哪个数据源。
 */
export interface UiNodeBinding {
  /**
   * 引用本页 dataSources[].id
   */
  dataSourceId?: string | null;
  /**
   * @default "page"
   */
  scope?: "page" | "form" | "row" | "component" | null;
  /**
   * 绑定实体，使列表与表单能自动派生列与字段
   */
  entityRef?: CommonArtifactRef | null;
  fieldKey?: CommonKey | null;
  /**
   * 数据源内取值路径，如 rows[0].name
   */
  path?: string | null;
  /**
   * 双向绑定目标，如 $form.name 或 $page.state.checkedIds
   */
  model?: string | null;
  /**
   * 值字段名，用于 select/tree 的 value 取值
   */
  valueKey?: string | null;
  /**
   * 显示字段名
   */
  labelKey?: string | null;
  semantic?: UiSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UiHandlerRefActionRef {
  actionRef: CommonArtifactRef;
  params?: Record<string, CommonValue> | null;
}

export interface UiHandlerRefSteps {
  /**
   * @minItems 1
   */
  steps: LogicStep[];
}

/**
 * 事件处理：引用具名动作（推荐，可复用可测试），或内联步骤（仅适合一次性简单逻辑）。
 */
export type UiHandlerRef = UiHandlerRefActionRef | UiHandlerRefSteps;

/**
 * 样式。优先 className（Tailwind 原子类）—— 出码时可原样保留且零运行时开销。css 是逃生舱，沙箱组件中被禁用。
 */
export interface UiNodeStyle {
  /**
   * Tailwind 类名，多个以空格分隔
   */
  className?: string | null;
  width?: string | null;
  height?: string | null;
  minWidth?: string | null;
  maxWidth?: string | null;
  minHeight?: string | null;
  maxHeight?: string | null;
  padding?: string | null;
  margin?: string | null;
  gap?: string | null;
  align?: "start" | "center" | "end" | "stretch" | "baseline" | null;
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly" | null;
  direction?: "row" | "column" | null;
  wrap?: boolean | null;
  background?: string | null;
  color?: string | null;
  border?: string | null;
  radius?: string | null;
  shadow?: string | null;
  fontSize?: string | null;
  fontWeight?: string | number | null;
  textAlign?: "left" | "center" | "right" | "justify" | null;
  overflow?: "visible" | "hidden" | "auto" | "scroll" | null;
  /**
   * @default false
   */
  hidden?: boolean | null;
  zIndex?: number | null;
  /**
   * 逃生舱：内联 CSS 键值对
   */
  css?: Record<string, string> | null;
  semantic?: UiSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 响应式配置。base 为默认，断点覆盖向上继承。移动端与小程序出码时只保留 xs/sm 并忽略 css 逃生舱。
 */
export interface UiResponsive {
  base?: UiBreakpointConfig | null;
  xs?: UiBreakpointConfig | null;
  sm?: UiBreakpointConfig | null;
  md?: UiBreakpointConfig | null;
  lg?: UiBreakpointConfig | null;
  xl?: UiBreakpointConfig | null;
  hiddenOn?: CommonBreakpointKey[] | null;
  semantic?: UiSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UiBreakpointConfig {
  /**
   * 24 栅格占宽
   * @minimum 1
   * @maximum 24
   */
  colSpan?: number | null;
  /**
   * @minimum 0
   * @maximum 23
   */
  offset?: number | null;
  order?: number | null;
  /**
   * @default false
   */
  hidden?: boolean | null;
  /**
   * 断点级 props 覆盖，如移动端把表格切成卡片列表
   */
  props?: Record<string, CommonValue> | null;
  style?: UiNodeStyle | null;
  semantic?: UiSemantic | null;
}

/**
 * 页面数据源。组件只声明消费哪个源，由运行时统一编排（并发请求、缓存、错误、loading），不让每个组件各自发请求。
 * @discriminant properties.type
 */
export type UiDataSource =
  | UiEntityDataSource
  | UiApiDataSource
  | UiFlowDataSource
  | UiStaticDataSource
  | UiComputedDataSource;

export interface UiEntityDataSource {
  /**
   * 页面内唯一，供 bind.dataSourceId 引用；约定 ds 前缀
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
   */
  id: string;
  /**
   * @const "entity"
   */
  type: "entity";
  name?: CommonText | null;
  entityRef: CommonArtifactRef;
  /**
   * page=分页；list=一次性取全部（配 limit）；one=按主键取单条；count=仅取总数
   * @default "page"
   */
  mode?: "page" | "list" | "one" | "count" | null;
  /**
   * 投影字段。缺省取 storage=column 字段 + 关联显示字段，避免把 JSONB 整体拖回前端
   */
  select?: CommonKey[] | null;
  /**
   * 需要展开的关联，如 student.dept。默认懒加载，显式声明才 join
   */
  include?: string[] | null;
  /**
   * 固定过滤条件，编译期下推为 SQL WHERE；数据权限行过滤在其上叠加 AND
   */
  filter?: Expr | null;
  sort?: UiSortSpec[] | null;
  page?: UiPageSpec | null;
  /**
   * mode=list 时的硬上限，防止把全表拖回前端
   * @minimum 1
   */
  limit?: number | null;
  /**
   * mode=one 时主键来源：路径字符串（如 $route.params.id）或表达式（如 { "$ref": "$data.ds_task.businessKey" }）
   */
  pkParam?: string | Expr | null;
  /**
   * 参数化占位符，使 filter 可写成 :studentId 形式并由运行时绑定
   */
  params?: UiDataSourceParam[] | null;
  /**
   * 声明式依赖：其他 dataSourceId 或表达式来源路径。其值变化时运行时自动重新查询，避免手写 watch
   */
  dependsOn?: string[] | null;
  /**
   * 页面加载即请求，还是等显式 refresh 动作
   * @default true
   */
  immediate?: boolean | null;
  cache?: UiCacheSpec | null;
  access?: CommonAccess | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UiApiDataSource {
  /**
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
   */
  id: string;
  /**
   * @const "api"
   */
  type: "api";
  name?: CommonText | null;
  apiRef: CommonArtifactRef;
  params?: Record<string, CommonValue> | null;
  /**
   * @default true
   */
  immediate?: boolean | null;
  cache?: UiCacheSpec | null;
  access?: CommonAccess | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 审批流页面数据源：待办、已办、我发起的、审批历史、流程变量。
 */
export interface UiFlowDataSource {
  /**
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
   */
  id: string;
  /**
   * @const "flow"
   */
  type: "flow";
  name?: CommonText | null;
  flowRef: CommonArtifactRef;
  /**
   * @default "todoTasks"
   */
  kind?: "todoTasks" | "doneTasks" | "myInitiated" | "history" | "variables" | "instance" | null;
  variables?: Record<string, CommonValue> | null;
  /**
   * @default true
   */
  immediate?: boolean | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface UiStaticDataSource {
  /**
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
   */
  id: string;
  /**
   * @const "static"
   */
  type: "static";
  name?: CommonText | null;
  /**
   * 字面量数据，用于下拉选项、仪表盘占位、原型预览
   */
  data: unknown;
  semantic?: CommonSemantic | null;
}

/**
 * 由其他数据源派生（统计卡片、合计行）。声明式派生而非命令式赋值，刷新顺序由依赖图自动拓扑排序。
 */
export interface UiComputedDataSource {
  /**
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
   */
  id: string;
  /**
   * @const "computed"
   */
  type: "computed";
  name?: CommonText | null;
  expr: Expr;
  /**
   * 显式依赖声明，用于拓扑排序与缓存失效；缺省由 expr 自动推导
   */
  dependsOn?: string[] | null;
  semantic?: CommonSemantic | null;
}

export interface UiDataSourceParam {
  key: CommonIdent;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "array";
  /**
   * @default true
   */
  required?: boolean | null;
  defaultValue?: CommonValue | null;
  /**
   * 参数取值表达式，优先级高于 defaultValue。用于把参数绑定到路由、登录用户、表单或其他数据源结果，例如 { "$ref": "$data.ds_task.businessKey" }
   */
  source?: Expr | null;
  description?: string | null;
  semantic?: UiSemantic | null;
}

export interface UiSortSpec {
  field: CommonKey;
  /**
   * @default "asc"
   */
  direction?: "asc" | "desc" | null;
  /**
   * @default "last"
   */
  nulls?: "first" | "last" | null;
  semantic?: UiSemantic | null;
}

export interface UiPageSpec {
  /**
   * @default 20
   * @minimum 1
   * @maximum 500
   */
  pageSize?: number | null;
  /**
   * @default [10,20,50,100]
   */
  pageSizes?: number[] | null;
  /**
   * @default "page"
   */
  pageParam?: string | null;
  /**
   * @default "pageSize"
   */
  sizeParam?: string | null;
  /**
   * 服务端强制上限，防止 pageSize=100000 拖库
   * @default 500
   */
  maxPageSize?: number | null;
  semantic?: UiSemantic | null;
}

export interface UiCacheSpec {
  /**
   * @default false
   */
  enabled?: boolean | null;
  /**
   * 秒
   */
  ttl?: number | null;
  /**
   * @default "page"
   */
  scope?: "page" | "session" | "tenant" | null;
  /**
   * 缓存键，缺省由数据源 id + 参数哈希生成
   */
  keyExpr?: Expr | null;
  semantic?: UiSemantic | null;
}

export interface UiMenuItem {
  id: CommonId;
  key: CommonKey;
  title: CommonText;
  icon?: string | null;
  path?: string | null;
  pageRef?: CommonArtifactRef | null;
  url?: string | null;
  /**
   * @default "_self"
   */
  target?: "_self" | "_blank" | null;
  order?: number | null;
  visible?: Expr | null;
  roles?: CommonKey[] | null;
  badge?: Expr | null;
  children?: UiMenuItem[] | null;
  semantic?: CommonSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/** @alias 该定义是 CommonSemantic 的别名，不引入新结构。 */
export type UiSemantic = CommonSemantic;

/* ======================================================================== */
/* logic.schema.json —— 56 个定义，命名空间前缀 Logic */
/* ======================================================================== */

/** @alias 该定义是 CommonId 的别名，不引入新结构。 */
export type LogicId = CommonId;

/** @alias 该定义是 CommonKey 的别名，不引入新结构。 */
export type LogicKey = CommonKey;

/** @alias 该定义是 CommonName 的别名，不引入新结构。 */
export type LogicName = CommonName;

/** @alias 该定义是 CommonText 的别名，不引入新结构。 */
export type LogicText = CommonText;

/** @alias 该定义是 CommonDescription 的别名，不引入新结构。 */
export type LogicDescription = CommonDescription;

/** @alias 该定义是 CommonScope 的别名，不引入新结构。 */
export type LogicScope = CommonScope;

/** @alias 该定义是 CommonVersion 的别名，不引入新结构。 */
export type LogicVersion = CommonVersion;

/** @alias 该定义是 Expr 的别名，不引入新结构。 */
export type LogicExpr = Expr;

/** @alias 该定义是 CommonValue 的别名，不引入新结构。 */
export type LogicValue = CommonValue;

/** @alias 该定义是 CommonAccess 的别名，不引入新结构。 */
export type LogicAccess = CommonAccess;

/** @alias 该定义是 CommonSemantic 的别名，不引入新结构。 */
export type LogicSemantic = CommonSemantic;

/** @alias 该定义是 CommonArtifactRef 的别名，不引入新结构。 */
export type LogicArtifactRef = CommonArtifactRef;

/** @alias 该定义是 CommonAssetRef 的别名，不引入新结构。 */
export type LogicAssetRef = CommonAssetRef;

export interface LogicSchema {
  id: LogicId;
  key: LogicKey;
  name: LogicName;
  scope?: LogicScope | null;
  version: LogicVersion;
  description?: LogicDescription | null;
  actions?: LogicAction[] | null;
  apis?: LogicApi[] | null;
  flows?: LogicFlow[] | null;
  rules?: LogicRule[] | null;
  access?: LogicAccess | null;
  semantic?: LogicSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 具名动作，可被页面、组件事件、流程监听器、其他动作复用。步骤串行执行，任一步失败即中断冒泡（除非该步声明 continueOnError 或 onError）。
 */
export interface LogicAction {
  id: LogicId;
  key: LogicKey;
  name: LogicName;
  description?: LogicDescription | null;
  /**
   * @default "manual"
   */
  trigger?: "manual" | "onLoad" | "onSubmit" | "onApprove" | "onReject" | "onSchedule" | "onWebhook" | "onEntityChange" | null;
  params?: LogicActionParam[] | null;
  /**
   * 前置条件，为假则整体跳过（不视为错误）
   */
  when?: LogicExpr | null;
  steps: LogicStep[];
  /**
   * 整个动作包裹在数据库事务内。含外部 HTTP 调用时开启会长时间持锁，L4 校验告警
   * @default false
   */
  transaction?: boolean | null;
  /**
   * 为真时运行时按幂等键（动作 key + 关键入参哈希）去重，防重复点击提交
   * @default true
   */
  idempotent?: boolean | null;
  /**
   * @default 30000
   */
  timeoutMs?: number | null;
  access?: LogicAccess | null;
  semantic?: LogicSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface LogicActionParam {
  key: LogicIdent;
  label?: LogicText | null;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "json" | "array" | "file";
  /**
   * @default false
   */
  required?: boolean | null;
  defaultValue?: LogicValue | null;
  semantic?: LogicSemantic | null;
}

/**
 * 步骤联合类型。每个分支内联公共字段（见各变体首行的「序言」），刻意不用 allOf 组合 —— allOf 与 additionalProperties:false 同用会误拒另一分支的属性，这是 JSON Schema 最常见的坑。
 * @discriminant properties.type
 */
export type LogicStep =
  | LogicValidateStep
  | LogicAssignStep
  | LogicApiCallStep
  | LogicOpenDialogStep
  | LogicCloseDialogStep
  | LogicConfirmStep
  | LogicBranchStep
  | LogicLoopStep
  | LogicParallelStep
  | LogicCallActionStep
  | LogicCodeStep
  | LogicUploadStep
  | LogicDownloadStep
  | LogicStartFlowStep
  | LogicCompleteTaskStep
  | LogicPrintStep
  | LogicTransactionStep
  | LogicDelayStep
  | LogicEmitStep
  | LogicLogStep
  | LogicCustomStep
  | LogicFailStep
  | LogicNavigateStep;

/**
 * 触发表单/实体校验。校验规则来自实体字段的 validators 与组件契约，动作层不重复定义规则。
 */
export interface LogicValidateStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "validate"
   */
  type: "validate";
  /**
   * @default "form"
   */
  scope?: "form" | "entity" | "allForms" | null;
  /**
   * 关联字段列表。既可能是实体字段（snake_case），也可能是动作/页面参数（camelCase），前端按同名表单项标红，故用 Ident 而不是 Key。
   */
  fields?: LogicIdent[] | null;
  /**
   * 是否同时提交服务端校验（唯一性等只能服务端判定）
   * @default true
   */
  server?: boolean | null;
  /**
   * 校验失败提示。运行时文案统一走表达式（$lit 纯文案 / $tpl 拼接 / $if 分支），静态标签才用 Text。与 FailStep.message 同一套规则。
   */
  message?: LogicExpr | null;
  semantic?: LogicSemantic | null;
}

/**
 * 赋值。target 仅允许 $form / $page / $data / $ctx 四类可写作用域，其他作用域由 L2 校验拒绝。
 */
export interface LogicAssignStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "assign"
   */
  type: "assign";
  /**
   * 写入目标，相对路径。state/form/row/rows/vars 五类前缀，与表达式读取侧的 $page.state / $form / $row / $ctx.vars 一一对应。
   * @pattern ^(state|form|row|rows|vars)(\.[A-Za-z0-9_\[\]-]+)+$
   */
  target: string;
  value: LogicExpr;
  /**
   * 对象浅合并而非整体替换
   * @default false
   */
  merge?: boolean | null;
  semantic?: LogicSemantic | null;
}

/**
 * 调用已编排的 API（含第三方集成）。不在动作内内联 URL，强行走 Api 工件 —— 便于鉴权集中、限流、留痕、Mock。
 */
export interface LogicApiCallStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "apiCall"
   */
  type: "apiCall";
  apiRef: LogicArtifactRef;
  params?: Record<string, LogicValue> | null;
  /**
   * 响应写入目标，如 $data.dsX 或 $form
   */
  assignTo?: string | null;
  /**
   * 只取响应中某条路径写入 assignTo
   */
  resultPath?: string | null;
  confirmToast?: LogicText | null;
  retry?: LogicApiCallStepRetry | null;
  semantic?: LogicSemantic | null;
}

export interface LogicApiCallStepRetry {
  /**
   * @minimum 1
   * @maximum 10
   */
  maxAttempts?: number | null;
  backoff?: "none" | "linear" | "exponential" | null;
}

export interface LogicOpenDialogStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "openDialog"
   */
  type: "openDialog";
  /**
   * 对应 UISchema.dialogs 的键
   */
  dialogKey: string;
  title?: LogicText | null;
  width?: string | number | null;
  /**
   * @default "dialog"
   */
  mode?: "dialog" | "drawer" | "modal" | null;
  /**
   * 传入弹窗的初始数据，弹窗内以 $ctx.dialogData 引用
   */
  data?: LogicExpr | null;
  /**
   * 是否等待弹窗关闭后再继续后续步骤
   * @default true
   */
  await?: boolean | null;
  semantic?: LogicSemantic | null;
}

export interface LogicCloseDialogStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "closeDialog"
   */
  type: "closeDialog";
  dialogKey?: string | null;
  /**
   * 回传给 await 方的结果
   */
  result?: LogicValue | null;
  semantic?: LogicSemantic | null;
}

export interface LogicConfirmStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "confirm"
   */
  type: "confirm";
  title?: LogicText | null;
  message: LogicExpr;
  /**
   * @default false
   */
  danger?: boolean | null;
  confirmText?: LogicText | null;
  cancelText?: LogicText | null;
  onConfirm?: LogicStep[] | null;
  onCancel?: LogicStep[] | null;
  /**
   * 要求填写原因并写入 $ctx.reason。审批驳回场景必备
   * @default false
   */
  reasonRequired?: boolean | null;
  semantic?: LogicSemantic | null;
}

/**
 * 条件分支。cases 按序求值，首个为真者执行；全为假则执行 else。等价 if/else-if/else 链，且分支名会进入运行时诊断与埋点。
 */
export interface LogicBranchStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "branch"
   */
  type: "branch";
  /**
   * @minItems 1
   */
  cases: LogicBranchStepCasesItem[];
  else?: LogicStep[] | null;
  semantic?: LogicSemantic | null;
}

export interface LogicBranchStepCasesItem {
  name?: string | null;
  when: LogicExpr;
  /**
   * @minItems 1
   */
  then: LogicStep[];
}

export interface LogicLoopStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "loop"
   */
  type: "loop";
  over: LogicExpr;
  /**
   * @default "item"
   */
  itemName?: string | null;
  /**
   * @default "index"
   */
  indexName?: string | null;
  /**
   * @minItems 1
   */
  steps: LogicStep[];
  /**
   * @default 1
   * @minimum 1
   * @maximum 20
   */
  concurrency?: number | null;
  /**
   * 硬性上限，防止死循环打爆运行时
   * @default 1000
   */
  maxIterations?: number | null;
  breakWhen?: LogicExpr | null;
  /**
   * 把每轮结果收集到该路径，如 $page.state.results
   */
  collect?: string | null;
  semantic?: LogicSemantic | null;
}

export interface LogicParallelStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "parallel"
   */
  type: "parallel";
  /**
   * @minItems 2
   */
  branches: LogicParallelStepBranchesItem[];
  /**
   * @default true
   */
  failFast?: boolean | null;
  timeoutMs?: number | null;
  semantic?: LogicSemantic | null;
}

export interface LogicParallelStepBranchesItem {
  name: string;
  /**
   * @minItems 1
   */
  steps: LogicStep[];
}

export interface LogicCallActionStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "callAction"
   */
  type: "callAction";
  actionRef: LogicArtifactRef;
  params?: Record<string, LogicValue> | null;
  assignTo?: string | null;
  semantic?: LogicSemantic | null;
}

/**
 * 代码扩展点。强制声明 inputs/outputs —— 既是沙箱契约，也是 AI 生成与人工审查的边界。ts 在沙箱 iframe/Worker 内执行，java 在服务端受限类加载器内执行。
 */
export interface LogicCodeStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "code"
   */
  type: "code";
  /**
   * @default "ts"
   */
  lang?: "ts" | "java" | null;
  /**
   * @default "browser"
   */
  runtime?: "browser" | "server" | null;
  /**
   * 源码，必须导出默认函数 (input) => output
   */
  source: string;
  /**
   * @default "default"
   */
  entry?: string | null;
  inputs: LogicCodeStepInputsItem[];
  outputs: LogicCodeStepOutputsItem[];
  assignTo?: string | null;
  /**
   * @default 3000
   * @maximum 60000
   */
  timeoutMs?: number | null;
  sandbox?: LogicSandboxPolicy | null;
  semantic?: LogicSemantic | null;
}

export interface LogicCodeStepInputsItem {
  key: LogicIdent;
  type: string;
  value?: LogicExpr | null;
}

export interface LogicCodeStepOutputsItem {
  key: LogicIdent;
  type: string;
}

/**
 * 沙箱能力白名单，默认全拒 —— 需要什么显式开什么。自定义组件与自定义代码共用同一套策略模型（C/D 项落地）。
 */
export interface LogicSandboxPolicy {
  /**
   * 允许 fetch/XHR；为真时必须同时声明 allowedHosts
   * @default false
   */
  network?: boolean | null;
  /**
   * 域名白名单，支持 *.example.com
   */
  allowedHosts?: string[] | null;
  /**
   * 允许 localStorage/sessionStorage
   * @default false
   */
  storage?: boolean | null;
  /**
   * 允许访问宿主 DOM；沙箱组件默认 false
   * @default false
   */
  dom?: boolean | null;
  /**
   * @default false
   */
  cookies?: boolean | null;
  /**
   * @default false
   */
  clipboard?: boolean | null;
  /**
   * @default false
   */
  navigation?: boolean | null;
  /**
   * 允许 import 的模块白名单，如 ['lodash-es','dayjs']
   */
  allowedModules?: string[] | null;
  /**
   * @default false
   */
  allowEval?: boolean | null;
  /**
   * @default 64
   */
  memoryLimitMb?: number | null;
  semantic?: LogicSemantic | null;
}

/**
 * 文件上传。provider=oss 时服务端只签发 STS 临时凭证，文件由客户端直传 OSS，服务端收回调登记元数据 —— 不让文件流经 BFF。
 */
export interface LogicUploadStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "upload"
   */
  type: "upload";
  /**
   * @default "oss"
   */
  provider?: "oss" | "local" | null;
  accept?: string[] | null;
  maxSize?: number | null;
  /**
   * @default 1
   */
  maxCount?: number | null;
  /**
   * @default false
   */
  multiple?: boolean | null;
  /**
   * @default "{tenant}/{app}/{entity}/{yyyy}/{MM}/{ulid}.{ext}"
   */
  pathTemplate?: string | null;
  assignTo: string;
  /**
   * @default true
   */
  autoUpload?: boolean | null;
  /**
   * 上传完成后写入的附件实体，用于统一附件管理
   */
  registerEntity?: LogicArtifactRef | null;
  semantic?: LogicSemantic | null;
}

export interface LogicDownloadStepBase {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "download"
   */
  type: "download";
  url?: LogicExpr | null;
  fileName?: LogicExpr | null;
  assetRef?: LogicAssetRef | null;
  semantic?: LogicSemantic | null;
}

/**
 * @constraint 以下字段组至少提供一组：url 或 assetRef
 */
export type LogicDownloadStep = LogicDownloadStepBase & ({ url: LogicExpr } | { assetRef: LogicAssetRef });

/**
 * 发起审批流。variables 是业务字段到流程变量的显式映射 —— 流程变量集合属于流程版本，改流程不影响业务表结构。
 */
export interface LogicStartFlowStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "startFlow"
   */
  type: "startFlow";
  flowRef: LogicArtifactRef;
  /**
   * 业务主键，使 Flowable 实例与业务单据可双向定位
   */
  businessKey: LogicExpr;
  variables?: Record<string, LogicValue> | null;
  /**
   * 把 processInstanceId 写入该路径
   */
  assignTo?: string | null;
  notify?: LogicText | null;
  /**
   * 同一 businessKey 存在运行中实例时拒绝重复发起
   * @default true
   */
  checkDuplicate?: boolean | null;
  semantic?: LogicSemantic | null;
}

/**
 * 完成当前审批任务。outcome 映射到 BPMN 出线条件（网关的 condition 表达式），因此流程分支与页面按钮天然一致。
 */
export interface LogicCompleteTaskStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "completeTask"
   */
  type: "completeTask";
  taskId?: LogicExpr | null;
  outcome: "approve" | "reject" | "return" | "transfer" | "addSign" | "custom";
  /**
   * outcome=custom 时的自定义变量值
   */
  outcomeKey?: string | null;
  comment?: LogicExpr | null;
  /**
   * @default false
   */
  commentRequired?: boolean | null;
  variables?: Record<string, LogicValue> | null;
  nextAssignee?: LogicAssigneeSpec | null;
  afterComplete?: LogicStep[] | null;
  semantic?: LogicSemantic | null;
}

/**
 * 人员选择。设计器据此渲染人员选择器，运行时解析为 Flowable 的用户/组 ID。
 */
export interface LogicAssigneeSpec {
  type: "user" | "role" | "dept" | "deptLeader" | "roleInDept" | "initiator" | "initiatorLeader" | "expression" | "formField";
  values?: string[] | null;
  expr?: LogicExpr | null;
  formField?: LogicKey | null;
  /**
   * 向上取 N 级主管：1=直属主管，2=隔级主管
   */
  level?: number | null;
  /**
   * 多候选人时的会签策略
   * @default "any"
   */
  strategy?: "any" | "all" | "sequential" | "voteMajority" | "voteRatio" | null;
  /**
   * @minimum 0
   * @maximum 1
   */
  voteRatio?: number | null;
  semantic?: LogicSemantic | null;
}

export interface LogicPrintStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "print"
   */
  type: "print";
  /**
   * 打印模板（Word/Excel 套红模板）
   */
  templateRef?: LogicArtifactRef | null;
  /**
   * 模板变量绑定。可整体用一个表达式算出对象，也可写「变量名 -> 表达式」映射。两个分支靠键名不重叠而互斥：表达式头键是 $ 开头，映射键必须匹配标识符。
   */
  data?: LogicExpr | Record<string, never> | null;
  /**
   * @default "preview"
   */
  mode?: "preview" | "print" | "exportPdf" | null;
  assignTo?: string | null;
  semantic?: LogicSemantic | null;
}

/**
 * 显式事务块。嵌套在已开启事务的动作内时会被 L4 校验拒绝。
 */
export interface LogicTransactionStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "transaction"
   */
  type: "transaction";
  /**
   * @minItems 1
   */
  steps: LogicStep[];
  /**
   * @default "readCommitted"
   */
  isolation?: "readCommitted" | "repeatableRead" | "serializable" | null;
  /**
   * @default false
   */
  readOnly?: boolean | null;
  semantic?: LogicSemantic | null;
}

export interface LogicDelayStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "delay"
   */
  type: "delay";
  /**
   * @minimum 0
   */
  ms?: number | null;
  until?: LogicExpr | null;
  semantic?: LogicSemantic | null;
}

/**
 * 发出领域事件，供集成层与异步消费者订阅。这是「业务逻辑」与「集成能力」的解耦点。
 */
export interface LogicEmitStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "emit"
   */
  type: "emit";
  /**
   * 事件名。业务事件用点分层（leave.approved），平台事件用冒号分层（ds:<dataSourceId>:refresh、page:<pageKey>:<action>）。
   * @pattern ^[a-z][a-z0-9_]*(?:[.:][A-Za-z0-9_]+)+$
   */
  event: string;
  payload?: Record<string, LogicValue> | null;
  /**
   * 为真则等待订阅者完成；慎用，会把外部故障引入主链路
   * @default false
   */
  sync?: boolean | null;
  semantic?: LogicSemantic | null;
}

export interface LogicLogStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "log"
   */
  type: "log";
  /**
   * @default "info"
   */
  level?: "debug" | "info" | "warn" | "error" | null;
  message: LogicExpr;
  data?: LogicValue | null;
  semantic?: LogicSemantic | null;
}

/**
 * 主动中断并抛出业务错误。校验不通过、守卫失败、批量操作需短路时使用。前端表现为表单/页面报错（fields 决定标红位置），后端表现为 BusinessException 并回滚当前事务（rollback=false 为仅告警）。
 */
export interface LogicFailStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "fail"
   */
  type: "fail";
  /**
   * @default "error"
   */
  level?: "info" | "warning" | "error" | "fatal" | null;
  message: LogicExpr;
  /**
   * 机器可读错误码，如 LEAVE_PROOF_REQUIRED；前端据此做 i18n 与埋点，不解析 message 文本
   * @pattern ^[A-Z][A-Z0-9_]{2,63}$
   */
  code?: string | null;
  /**
   * 关联字段列表。既可能是实体字段（snake_case），也可能是动作/页面参数（camelCase），前端按同名表单项标红，故用 Ident 而不是 Key。
   */
  fields?: LogicIdent[] | null;
  /**
   * 后端是否回滚当前事务；前端忽略此字段
   * @default true
   */
  rollback?: boolean | null;
  semantic?: LogicSemantic | null;
}

/**
 * 页面跳转。优先用 pageRef 而不是硬编码路径 —— 路径属于页面版本，改路由时不应全库搜字符串。表单提交成功回列表、审批完成后跳待办、登录失效回登录页都走这一步。
 */
export interface LogicNavigateStepBase {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "navigate"
   */
  type: "navigate";
  /**
   * 目标路径，支持 :param 占位（如 /leave/requests/:id）与外部 URL
   */
  to?: string | LogicExpr | null;
  /**
   * 按页面引用跳转，实际路径由 UISchema.route.path 推导
   */
  pageRef?: LogicArtifactRef | null;
  params?: Record<string, LogicValue> | null;
  query?: Record<string, LogicValue> | null;
  /**
   * @default false
   */
  replace?: boolean | null;
  /**
   * @default "self"
   */
  target?: "self" | "blank" | null;
  /**
   * 回退层数。与 to / pageRef 三者互斥
   * @minimum 1
   */
  back?: number | null;
  /**
   * 跳转后关闭当前页签（多页签布局下使用）
   * @default false
   */
  closeCurrent?: boolean | null;
  /**
   * 返回非空文案时弹出离开确认，用于未保存表单拦截
   */
  confirmLeave?: LogicExpr | null;
  semantic?: LogicSemantic | null;
}

/**
 * 页面跳转。优先用 pageRef 而不是硬编码路径 —— 路径属于页面版本，改路由时不应全库搜字符串。表单提交成功回列表、审批完成后跳待办、登录失效回登录页都走这一步。
 * @constraint 以下字段组至少提供一组：to 或 pageRef 或 back
 */
export type LogicNavigateStep = LogicNavigateStepBase & ({ to: string | LogicExpr } | { pageRef: LogicArtifactRef } | { back: number });

/**
 * 平台注册的扩展点。与 code 步骤的区别：custom 引用平台已审核通过的处理器，可在沙箱外运行、可用平台内部服务。
 */
export interface LogicCustomStep {
  id: LogicId;
  label?: LogicText | null;
  when?: LogicExpr | null;
  /**
   * @default false
   */
  disabled?: boolean | null;
  onError?: LogicStep[] | null;
  /**
   * @default false
   */
  continueOnError?: boolean | null;
  note?: string | null;
  /**
   * @const "custom"
   */
  type: "custom";
  /**
   * 处理器标识，如 edu.generateStudentNo
   * @pattern ^[a-z][a-zA-Z0-9._-]{2,63}$
   */
  handler: string;
  params?: Record<string, LogicValue> | null;
  assignTo?: string | null;
  semantic?: LogicSemantic | null;
}

/**
 * API 编排工件。所有对外/对内调用都声明在这里，动作只引用 —— 使鉴权、限流、重试、留痕、Mock 有单一收口点。
 */
export interface LogicApi {
  id: LogicId;
  key: LogicKey;
  name: LogicName;
  description?: LogicDescription | null;
  /**
   * @default "rest"
   */
  kind?: "rest" | "graphql" | "soap" | "database" | "internal" | null;
  /**
   * @default "GET"
   */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "QUERY" | "MUTATION" | null;
  /**
   * 相对路径，支持 :id 占位，如 /students/:id
   */
  path: string;
  /**
   * 绝对地址；内部 API 缺省走 BFF 网关
   */
  baseUrl?: string | null;
  /**
   * 引用集成连接（第三方服务的凭证与超时配置），避免把密钥写进 Schema
   */
  connectionRef?: LogicArtifactRef | null;
  auth?: LogicApiAuth | null;
  /**
   * @default 10000
   */
  timeoutMs?: number | null;
  retry?: LogicApiRetry | null;
  cache?: LogicApiCache | null;
  rateLimit?: LogicApiRateLimit | null;
  request?: LogicApiRequest | null;
  response?: LogicApiResponse | null;
  /**
   * 请求前编排：取 token、算签名、拼参
   */
  before?: LogicStep[] | null;
  /**
   * 响应后编排：落库、转换、发事件
   */
  after?: LogicStep[] | null;
  mock?: LogicApiMock | null;
  /**
   * @default false
   */
  idempotent?: boolean | null;
  tags?: string[] | null;
  access?: LogicAccess | null;
  semantic?: LogicSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface LogicApiRetry {
  /**
   * @minimum 1
   * @maximum 10
   */
  maxAttempts?: number | null;
  backoff?: "none" | "linear" | "exponential" | null;
  retryOn?: number[] | null;
}

export interface LogicApiCache {
  enabled?: boolean | null;
  ttl?: number | null;
  keyExpr?: LogicExpr | null;
}

export interface LogicApiRateLimit {
  qps?: number | null;
  burst?: number | null;
  /**
   * @default "tenant"
   */
  scope?: "tenant" | "app" | "global" | null;
}

export interface LogicApiMock {
  /**
   * @default false
   */
  enabled?: boolean | null;
  data?: LogicValue | null;
  /**
   * @default 0
   */
  delayMs?: number | null;
  /**
   * @minimum 0
   * @maximum 1
   */
  errorRate?: number | null;
}

export interface LogicApiAuthNone {
  /**
   * @const "none"
   */
  type: "none";
}

export interface LogicApiAuthTenant {
  /**
   * @const "tenant"
   */
  type: "tenant";
  /**
   * @default "X-Tenant-Id"
   */
  headerName?: string | null;
}

export interface LogicApiAuthBearer {
  /**
   * @const "bearer"
   */
  type: "bearer";
  tokenRef?: string | null;
  tokenUrl?: string | null;
  /**
   * @default 60
   */
  refreshBeforeSec?: number | null;
}

export interface LogicApiAuthApiKey {
  /**
   * @const "apiKey"
   */
  type: "apiKey";
  name: string;
  in: "header" | "query";
  valueRef: string;
}

export interface LogicApiAuthBasic {
  /**
   * @const "basic"
   */
  type: "basic";
  usernameRef: string;
  passwordRef: string;
}

export interface LogicApiAuthOauth2 {
  /**
   * @const "oauth2"
   */
  type: "oauth2";
  grant: "clientCredentials" | "authorizationCode" | "password";
  provider?: string | null;
  scopes?: string[] | null;
  tokenRef?: string | null;
}

export interface LogicApiAuthSignature {
  /**
   * @const "signature"
   */
  type: "signature";
  algorithm: "hmacSha256" | "md5";
  secretRef: string;
  /**
   * 待签名串模板，如 {method}\n{path}\n{timestamp}
   */
  template?: string | null;
  /**
   * @default "X-Signature"
   */
  headerName?: string | null;
}

/**
 * 鉴权方式。凭证一律以引用形式声明（secretRef），实际值存于平台密钥库并按租户隔离，绝不落进 Schema。
 * @discriminant properties.type
 */
export type LogicApiAuth =
  | LogicApiAuthNone
  | LogicApiAuthTenant
  | LogicApiAuthBearer
  | LogicApiAuthApiKey
  | LogicApiAuthBasic
  | LogicApiAuthOauth2
  | LogicApiAuthSignature;

export interface LogicApiRequest {
  query?: LogicApiParam[] | null;
  path?: LogicApiParam[] | null;
  headers?: LogicHttpHeader[] | null;
  body?: LogicApiRequestBody | null;
  semantic?: LogicSemantic | null;
}

export interface LogicApiRequestBody {
  /**
   * @default "application/json"
   */
  contentType?: "application/json" | "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain" | "application/xml" | null;
  /**
   * 请求体结构（JSON Schema 片段或类型描述），用于设计器渲染与 AI 提示
   */
  schema?: unknown | null;
  /**
   * 出参映射：目标字段 -> 表达式
   */
  mapping?: Record<string, LogicExpr> | null;
  /**
   * 整体表达式构造请求体，与 mapping 二选一
   */
  raw?: LogicExpr | null;
}

export interface LogicApiParam {
  key: LogicIdent;
  label?: LogicText | null;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "json" | "array" | "file" | "binary";
  /**
   * @default false
   */
  required?: boolean | null;
  defaultValue?: LogicValue | null;
  /**
   * 取值来源；缺省取同名入参
   */
  source?: LogicExpr | null;
  /**
   * 联调示例值
   */
  test?: LogicValue | null;
  description?: string | null;
  semantic?: LogicSemantic | null;
}

export interface LogicApiResponse {
  /**
   * 响应结构描述，供设计器做字段联想与出码生成 TS 类型
   */
  schema?: unknown | null;
  /**
   * 出参映射：目标字段 -> 响应体内的 JSONPath（如 $.data.id）或表达式。JSONPath 用于直取，表达式用于改名/拼接/兜底。
   */
  mapping?: Record<string, LogicJsonPath | LogicExpr> | null;
  /**
   * 判定成功的表达式；缺省按 HTTP 2xx 与平台统一响应码
   */
  successWhen?: LogicExpr | null;
  /**
   * 列表数据的路径，如 $.data.rows
   */
  rowsPath?: LogicJsonPath | null;
  /**
   * 总数所在的路径，如 $.data.total
   */
  totalPath?: LogicJsonPath | null;
  /**
   * 错误码/错误标记所在的路径
   */
  errorPath?: LogicJsonPath | null;
  /**
   * 错误文案所在的路径，用于直接提示用户
   */
  errorMessagePath?: LogicJsonPath | null;
  semantic?: LogicSemantic | null;
}

/**
 * 审批流绑定。BPMN XML 作为独立资产版本化（bpmnRef），LogicSchema 只声明 processKey 与业务字段到流程变量的映射 —— 流程可单独回滚、可 diff，且不污染业务表结构。
 */
export interface LogicFlow {
  id: LogicId;
  key: LogicKey;
  name: LogicName;
  description?: LogicDescription | null;
  /**
   * @const "flowable"
   */
  engine: "flowable";
  /**
   * Flowable process definition key，租户内唯一
   * @pattern ^[a-zA-Z][a-zA-Z0-9_]{2,63}$
   */
  processKey: string;
  bpmnRef: LogicAssetRef;
  category?: string | null;
  /**
   * 该流程服务的业务实体，用于列表页展示流程状态列
   */
  entityRef?: LogicArtifactRef | null;
  /**
   * 业务表中回写流程状态的字段
   */
  statusField?: LogicKey | null;
  startableBy?: LogicAssigneeSpec | null;
  variables?: LogicVariableMapping[] | null;
  taskForms?: LogicTaskForm[] | null;
  listeners?: LogicFlowListener[] | null;
  deployment?: LogicFlowDeployment | null;
  /**
   * 流程时限与超时策略。到时只产生事件/通知，不改业务数据。
   */
  sla?: LogicFlowSla | null;
  /**
   * 发起人可撤回
   * @default true
   */
  allowRecall?: boolean | null;
  /**
   * 审批人可退回上一节点
   * @default true
   */
  allowReturn?: boolean | null;
  /**
   * @default true
   */
  allowTransfer?: boolean | null;
  /**
   * 加签。默认关闭 —— 会签语义复杂，需业务明确需要才开
   * @default false
   */
  allowAddSign?: boolean | null;
  access?: LogicAccess | null;
  semantic?: LogicSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface LogicFlowDeployment {
  /**
   * 把平台 tenantId 映射为 Flowable 的 tenantId，实现引擎级租户隔离
   * @default "flowableTenantId"
   */
  tenantStrategy?: "flowableTenantId" | "none" | null;
  /**
   * @default "audit"
   */
  historyLevel?: "none" | "activity" | "audit" | "full" | null;
  /**
   * @default false
   */
  async?: boolean | null;
  /**
   * @default true
   */
  exclusive?: boolean | null;
  /**
   * 发布应用时自动部署到 Flowable
   * @default true
   */
  autoDeploy?: boolean | null;
}

/**
 * 流程时限与超时策略。到时只产生事件/通知，不改业务数据。
 */
export interface LogicFlowSla {
  /**
   * 承诺办结时长（小时），从流程开始计
   */
  dueDateHours?: number | null;
  /**
   * 剩余多少小时开始预警
   */
  warningHours?: number | null;
  /**
   * 超期多少小时后升级
   */
  escalateAfterHours?: number | null;
  escalateTo?: LogicAssigneeSpec | null;
  /**
   * @default "notify"
   */
  onTimeout?: "notify" | "autoApprove" | "autoReject" | "escalate" | null;
  semantic?: LogicSemantic | null;
}

/**
 * 业务字段 ↔ 流程变量映射。name 必须是合法 Java 标识符（Flowable 变量限制），故用 camelCase，与实体字段的 snake_case 解耦。
 */
export interface LogicVariableMapping {
  /**
   * @pattern ^[a-z][a-zA-Z0-9]{1,62}$
   */
  name: string;
  /**
   * @default "in"
   */
  direction?: "in" | "out" | "inout" | null;
  source: LogicExpr;
  type: "string" | "integer" | "long" | "double" | "decimal" | "boolean" | "date" | "datetime" | "json" | "array";
  /**
   * @default false
   */
  required?: boolean | null;
  description?: string | null;
  semantic?: LogicSemantic | null;
  defaultValue?: LogicValue | null;
}

/**
 * 审批节点的人员与表单配置。taskKey 必须与 BPMN 中 userTask 的 id 一致（L3 校验会解析 BPMN 比对）。
 */
export interface LogicTaskForm {
  taskKey: string;
  name?: LogicText | null;
  /**
   * 办理该节点使用的页面（审批页 kind=approval）
   */
  pageRef?: LogicArtifactRef | null;
  assignee?: LogicAssigneeSpec | null;
  candidateRoles?: LogicKey[] | null;
  /**
   * 本节点可编辑的业务字段（相对发起时的表单）
   */
  editableFields?: LogicKey[] | null;
  requiredFields?: LogicKey[] | null;
  readonlyFields?: LogicKey[] | null;
  buttons?: LogicTaskFormButtonsItem[] | null;
  dueDateHours?: number | null;
  semantic?: LogicSemantic | null;
  /**
   * 办理意见（同意/驳回理由）写入的流程变量名，必须出现在 Flow.variables[].name 中。办理意见不是实体字段，所以不放进 editableFields/requiredFields。
   * @pattern ^[a-z][a-zA-Z0-9]{1,62}$
   */
  commentField?: string | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface LogicTaskFormButtonsItem {
  key: LogicIdent;
  label: LogicText;
  outcome: "approve" | "reject" | "return" | "transfer" | "addSign" | "custom";
  outcomeKey?: string | null;
  /**
   * @default "default"
   */
  style?: "primary" | "default" | "danger" | "warning" | null;
  confirm?: LogicText | null;
  /**
   * @default false
   */
  commentRequired?: boolean | null;
  visible?: LogicExpr | null;
  order?: number | null;
}

/**
 * 流程事件监听，把流程推进与业务副作用解耦（如审批通过后同步学籍状态）。
 */
export interface LogicFlowListener {
  id: LogicId;
  event: "processStarted" | "processEnded" | "taskCreated" | "taskCompleted" | "taskAssigned" | "taskTimeout" | "variableUpdated";
  /**
   * @default "task"
   */
  on?: "process" | "task" | "execution" | null;
  taskKey?: string | null;
  actionRef: LogicArtifactRef;
  /**
   * 默认异步 —— 监听器失败不应阻塞流程推进
   * @default true
   */
  async?: boolean | null;
  /**
   * @default 0
   */
  order?: number | null;
  when?: LogicExpr | null;
  /**
   * @default true
   */
  enabled?: boolean | null;
  semantic?: LogicSemantic | null;
}

/**
 * 业务规则。与动作的区别：规则是「有多个触发点、需要统一执行」的横切逻辑（如学籍校验），由运行时按 kind 与 entity 自动挂载。
 */
export interface LogicRule {
  id: LogicId;
  key: LogicKey;
  name: LogicName;
  description?: LogicDescription | null;
  /**
   * @default "validation"
   */
  kind?: "validation" | "derivation" | "guard" | "permission" | "notification" | null;
  entityRef?: LogicArtifactRef | null;
  /**
   * @default "any"
   */
  on?: "create" | "update" | "delete" | "read" | "any" | null;
  when?: LogicExpr | null;
  then: LogicStep[];
  /**
   * 数值越小越先执行
   * @default 100
   */
  priority?: number | null;
  /**
   * @default true
   */
  enabled?: boolean | null;
  /**
   * @default true
   */
  stopOnFail?: boolean | null;
  access?: LogicAccess | null;
  semantic?: LogicSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 外部请求头。名字是 HTTP token（可含连字符），值支持表达式以便注入 token。
 */
export interface LogicHttpHeader {
  name: LogicHttpToken;
  type?: "string" | "integer" | "boolean" | "json" | null;
  value?: LogicExpr | null;
  /**
   * @default false
   */
  required?: boolean | null;
  defaultValue?: LogicValue | null;
  description?: string | null;
  semantic?: LogicSemantic | null;
}

/** @alias 该定义是 CommonIdent 的别名，不引入新结构。 */
export type LogicIdent = CommonIdent;

/** @alias 该定义是 CommonHttpToken 的别名，不引入新结构。 */
export type LogicHttpToken = CommonHttpToken;

/** @alias 该定义是 CommonJsonPath 的别名，不引入新结构。 */
export type LogicJsonPath = CommonJsonPath;

/* ======================================================================== */
/* component.schema.json —— 21 个定义，命名空间前缀 Component */
/* ======================================================================== */

/** @alias 该定义是 CommonId 的别名，不引入新结构。 */
export type ComponentId = CommonId;

/** @alias 该定义是 CommonKey 的别名，不引入新结构。 */
export type ComponentKey = CommonKey;

/** @alias 该定义是 CommonText 的别名，不引入新结构。 */
export type ComponentText = CommonText;

/** @alias 该定义是 CommonDescription 的别名，不引入新结构。 */
export type ComponentDescription = CommonDescription;

/** @alias 该定义是 CommonVersion 的别名，不引入新结构。 */
export type ComponentVersion = CommonVersion;

/** @alias 该定义是 Expr 的别名，不引入新结构。 */
export type ComponentExpr = Expr;

/** @alias 该定义是 CommonValue 的别名，不引入新结构。 */
export type ComponentValue = CommonValue;

/** @alias 该定义是 CommonSemantic 的别名，不引入新结构。 */
export type ComponentSemantic = CommonSemantic;

/** @alias 该定义是 CommonArtifactRef 的别名，不引入新结构。 */
export type ComponentArtifactRef = CommonArtifactRef;

/** @alias 该定义是 LogicSandboxPolicy 的别名，不引入新结构。 */
export type ComponentSandboxPolicy = LogicSandboxPolicy;

/** @alias 该定义是 UiNodeStyle 的别名，不引入新结构。 */
export type ComponentNodeStyle = UiNodeStyle;

export interface ComponentContract {
  id: ComponentId;
  /**
   * 组件名（kebab-case）。UINode.component 必须能解析到此名或平台内建组件名
   * @pattern ^[a-z][a-z0-9-]{1,47}$
   */
  name: string;
  version: ComponentVersion;
  title: ComponentText;
  description?: ComponentDescription | null;
  /**
   * 物料面板分组，如 基础 / 布局 / 表单 / 数据展示 / 业务组件
   */
  group?: string | null;
  icon?: string | null;
  kind: ComponentKind;
  /**
   * builtin=平台内建；remote=动态加载的租户 JS 包；sandbox=iframe 隔离执行
   * @default "builtin"
   */
  runtime?: "builtin" | "remote" | "sandbox" | null;
  /**
   * 是否可容纳子节点。为假时 UINode.children 被 L2 校验拒绝
   * @default false
   */
  container?: boolean | null;
  /**
   * 允许的子组件名白名单；空数组表示不限。设计器据此高亮可放置区域
   */
  acceptChildren?: string[] | null;
  /**
   * 允许的父组件名白名单；空数组表示不限。双向约束比单向更可靠
   */
  canBeChildOf?: string[] | null;
  /**
   * @minimum 0
   */
  minChildren?: number | null;
  /**
   * @minimum 1
   */
  maxChildren?: number | null;
  props: ComponentPropDef[];
  slots?: ComponentSlotDef[] | null;
  events?: ComponentEventDef[] | null;
  actions?: ComponentActionCapability[] | null;
  capabilities: ComponentCapabilities;
  data?: ComponentDataContract | null;
  fieldBindings?: ComponentFieldBindings | null;
  /**
   * 拖入画布时的初始 props
   */
  defaultProps?: Record<string, ComponentValue> | null;
  defaultStyle?: ComponentNodeStyle | null;
  /**
   * 是否支持响应式配置。为假时设计器隐藏断点面板
   * @default true
   */
  responsive?: boolean | null;
  /**
   * @default false
   */
  deprecated?: boolean | null;
  /**
   * 引入版本，如 0.1.0
   */
  since?: string | null;
  /**
   * runtime=remote|sandbox 时的加载地址（须同时提供 integrity 校验）
   */
  source?: string | null;
  /**
   * 子资源完整性哈希，如 sha384-...。确保远程组件未被篡改
   */
  integrity?: string | null;
  sandbox?: ComponentSandboxPolicy | null;
  semantic?: ComponentSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * field=可作为表单字段（参与表单模型与校验）；layout/container=可容纳子节点；data=消费数据源的主组件（表格/列表/树）
 */
export type ComponentKind =
  | "layout"
  | "container"
  | "field"
  | "display"
  | "action"
  | "data"
  | "chart"
  | "advanced";

/**
 * 属性定义。bindable 是设计器属性面板的关键开关：为真时出现「绑定数据 / 表达式」切换按钮。
 */
export interface ComponentPropDef {
  /**
   * props 的键。camelCase 以匹配 Vue prop 命名
   * @pattern ^[a-zA-Z][a-zA-Z0-9]{0,47}$
   */
  key: string;
  label: ComponentText;
  description?: ComponentDescription | null;
  type: ComponentPropType;
  defaultValue?: ComponentValue | null;
  /**
   * @default false
   */
  required?: boolean | null;
  /**
   * 是否允许赋值表达式而非仅字面量。为假时 L2 校验拒绝 Expr
   * @default false
   */
  bindable?: boolean | null;
  /**
   * type=enum 时的候选值
   */
  enum?: ComponentValue[] | null;
  enumLabels?: Record<string, ComponentText> | null;
  /**
   * 枚举来自共享枚举定义，避免每个组件重复维护选项
   */
  enumRef?: ComponentArtifactRef | null;
  /**
   * 属性面板分组
   */
  group?: string | null;
  order?: number | null;
  /**
   * 是否折叠进「高级」区
   * @default false
   */
  advanced?: boolean | null;
  /**
   * 单位提示，如 px / s / %
   */
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  /**
   * 联动显示条件。属性面板据此显隐，避免无关配置干扰
   */
  when?: ComponentExpr | null;
  /**
   * type=fieldList/columnList/optionList 时的元素类型
   */
  itemType?: ComponentPropType | null;
  /**
   * 复合属性的元素字段定义
   */
  itemProps?: ComponentPropDef[] | null;
  semantic?: ComponentSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 面向设计器的属性类型系统。决定属性面板渲染什么编辑控件，以及出码时如何序列化。新增类型须同步更新属性面板控件表与出码序列化器。
 */
export type ComponentPropType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "text"
  | "json"
  | "enum"
  | "color"
  | "icon"
  | "cssLength"
  | "url"
  | "dateFormat"
  | "fileAccept"
  | "expr"
  | "slot"
  | "node"
  | "nodeList"
  | "style"
  | "actionRef"
  | "pageRef"
  | "entityRef"
  | "dataSourceRef"
  | "fieldRef"
  | "eventRef"
  | "fieldList"
  | "columnList"
  | "searchFieldList"
  | "optionList"
  | "buttonList"
  | "ruleList"
  | "assignee"
  | "validatorList"
  | "stepList";

export interface ComponentSlotDef {
  /**
   * @default "default"
   */
  name?: string | null;
  label?: ComponentText | null;
  description?: ComponentDescription | null;
  /**
   * @default true
   */
  multiple?: boolean | null;
  /**
   * @default false
   */
  required?: boolean | null;
  /**
   * 允许的子组件名白名单；空数组表示不限
   */
  accepts?: string[] | null;
  /**
   * value 表示插槽接收的是作用域数据而非节点树（如表单字段插槽）
   * @default "node"
   */
  scope?: "node" | "value" | null;
  maxItems?: number | null;
  semantic?: ComponentSemantic | null;
}

export interface ComponentEventDef {
  /**
   * 事件名，对应 UINode.handlers 的键，也用于生成 emit('name')
   * @pattern ^[a-z][a-zA-Z0-9]{0,47}$
   */
  name: string;
  label?: ComponentText | null;
  description?: ComponentDescription | null;
  /**
   * 事件负载结构。动作内的表达式以 $ctx.event.<key> 访问
   */
  params?: ComponentEventDefParamsItem[] | null;
  /**
   * @default false
   */
  async?: boolean | null;
  semantic?: ComponentSemantic | null;
}

export interface ComponentEventDefParamsItem {
  key: ComponentKey;
  type: string;
  description?: string | null;
}

/**
 * 组件暴露的可调用能力。动作编排里通过 targetComponent 调用，设计器据此提供组件方法联想 —— 让「逻辑编排」能真正驱动界面，而不只是发请求。
 */
export interface ComponentActionCapability {
  /**
   * @pattern ^[a-z][a-zA-Z0-9]{0,47}$
   */
  name: string;
  label?: ComponentText | null;
  description?: ComponentDescription | null;
  /**
   * @default "ui"
   */
  kind?: "data" | "form" | "list" | "ui" | "upload" | "flow" | "chart" | null;
  params?: Record<string, ComponentValue> | null;
  returns?: string | null;
  semantic?: ComponentSemantic | null;
}

export interface ComponentCapabilities {
  /**
   * 可作为表单字段：参与 $form 模型、必填校验、提交数据收集
   * @default false
   */
  formField?: boolean | null;
  /**
   * 可作为表格列渲染器（配 columnList 使用）
   * @default false
   */
  listColumn?: boolean | null;
  /**
   * 是否允许 bind 数据源
   * @default true
   */
  supportsBinding?: boolean | null;
  /**
   * 是否自身消费数据源（表格/列表/树）
   * @default false
   */
  supportsDataSource?: boolean | null;
  /**
   * 是否允许 loop 配置
   * @default false
   */
  supportsLoop?: boolean | null;
  /**
   * @default true
   */
  supportsVisibility?: boolean | null;
  /**
   * @default true
   */
  supportsResponsive?: boolean | null;
  /**
   * @default true
   */
  supportsStyle?: boolean | null;
  /**
   * @default true
   */
  movable?: boolean | null;
  /**
   * @default true
   */
  resizable?: boolean | null;
  /**
   * @default true
   */
  copyable?: boolean | null;
  /**
   * @default true
   */
  deletable?: boolean | null;
  /**
   * 是否内置虚拟滚动，大数据量列表的判定依据
   * @default false
   */
  virtualScroll?: boolean | null;
  semantic?: ComponentSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 组件与数据源的约定。运行时据此把数据注入组件、暴露刷新/提交能力；出码时据此生成数据源订阅代码。
 */
export interface ComponentDataContract {
  /**
   * @default "none"
   */
  role?: "form" | "table" | "tree" | "detail" | "chart" | "none" | null;
  /**
   * 组件期望的数据形状，用于校验数据源绑定是否合理（L2）
   * @default "none"
   */
  modelShape?: "none" | "object" | "array" | "scalar" | null;
  /**
   * 向数据源回写的字段，如表单字段 key 列表
   */
  emits?: string[] | null;
  /**
   * 消费的数据源类型：entity / api / flow / static / computed
   */
  accepts?: string[] | null;
  /**
   * @default false
   */
  refreshable?: boolean | null;
  /**
   * @default false
   */
  submitable?: boolean | null;
  /**
   * @default false
   */
  pagination?: boolean | null;
  semantic?: ComponentSemantic | null;
}

/**
 * 字段类型到组件的默认映射。设计器从实体自动生成表单/列表时按此表选组件，出码引擎也读它 —— 这是「内置 CRUD 模板」能自动工作的原因。
 */
export interface ComponentFieldBindings {
  /**
   * 适用的 DataSchema FieldType 列表，如 ['string']
   */
  forFieldTypes?: string[] | null;
  /**
   * 适用的 format 细分，如 ['email','phone']
   */
  forFormats?: string[] | null;
  /**
   * 适用的页面类型，如 ['form','list']
   */
  forPageKinds?: string[] | null;
  /**
   * 同类型多组件时的优先级，数值小者优先
   * @default 100
   */
  priority?: number | null;
  /**
   * 是否同时可作为列表列渲染器
   * @default false
   */
  listRenderer?: boolean | null;
  semantic?: ComponentSemantic | null;
}

/* ======================================================================== */
/* bundle.schema.json —— 24 个定义，命名空间前缀 Bundle */
/* ======================================================================== */

/** @alias 该定义是 CommonId 的别名，不引入新结构。 */
export type BundleId = CommonId;

/** @alias 该定义是 CommonKey 的别名，不引入新结构。 */
export type BundleKey = CommonKey;

/** @alias 该定义是 CommonName 的别名，不引入新结构。 */
export type BundleName = CommonName;

/** @alias 该定义是 CommonText 的别名，不引入新结构。 */
export type BundleText = CommonText;

/** @alias 该定义是 CommonDescription 的别名，不引入新结构。 */
export type BundleDescription = CommonDescription;

/** @alias 该定义是 CommonScope 的别名，不引入新结构。 */
export type BundleScope = CommonScope;

/** @alias 该定义是 CommonVersion 的别名，不引入新结构。 */
export type BundleVersion = CommonVersion;

/** @alias 该定义是 Expr 的别名，不引入新结构。 */
export type BundleExpr = Expr;

/** @alias 该定义是 CommonChecksum 的别名，不引入新结构。 */
export type BundleChecksum = CommonChecksum;

/** @alias 该定义是 CommonAssetRef 的别名，不引入新结构。 */
export type BundleAssetRef = CommonAssetRef;

/** @alias 该定义是 CommonSemantic 的别名，不引入新结构。 */
export type BundleSemantic = CommonSemantic;

export interface BundleAppBundle {
  /**
   * 本包遵循的协议版本。运行时拒绝加载高于自身支持版本的主版本号
   * @pattern ^\d+\.\d+$
   */
  protocolVersion: string;
  /**
   * 租户标识。仅出现在信封层，避免每个工件重复携带导致漂移
   */
  tenantId: string;
  app: BundleAppMeta;
  snapshot: BundleSnapshot;
  artifacts: BundleArtifacts;
  assets?: BundleAssetRef[] | null;
  navigation?: BundleNavigation | null;
  publish?: BundlePublishConfig | null;
  /**
   * 工件路径 -> 校验和。用于完整性校验与「内容未变不重复发布」判定
   */
  checksums?: Record<string, BundleChecksum> | null;
  meta?: BundleMeta | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface BundleAppMeta {
  id: BundleId;
  key: BundleKey;
  name: BundleName;
  description?: BundleDescription | null;
  icon?: string | null;
  scope?: BundleScope | null;
  /**
   * 业务领域。教育/办公/通用业务，影响默认模板与权限预设
   */
  type?: "education" | "office" | "business" | "template" | "demo" | null;
  /**
   * 模板市场分类，如 教务管理 / 学籍 / 排课 / 考勤 / 报销 / 招聘
   */
  category?: string | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 快照元数据。version 单调递增，回滚不覆盖历史（rollbackOf 指向被回滚到的版本），使审计链完整。
 */
export interface BundleSnapshot {
  snapshotId: BundleId;
  version: BundleVersion;
  /**
   * 父快照 id。首版缺省
   */
  basedOn?: BundleId | null;
  /**
   * @format date-time
   */
  createdAt: string;
  author: BundleActor;
  /**
   * 变更说明。发布必须填写 —— 没有它版本管理形同虚设
   * @maxLength 500
   */
  message?: string | null;
  /**
   * @default "draft"
   */
  status?: "draft" | "published" | "archived" | "deprecated" | null;
  tags?: string[] | null;
  /**
   * @format date-time
   */
  publishedAt?: string | null;
  publishedBy?: BundleActor | null;
  /**
   * 本快照是从哪个历史快照回滚而来
   */
  rollbackOf?: BundleId | null;
  /**
   * 结构化变更摘要，供发布评审与回滚影响分析
   */
  changeSummary?: BundleChangeEntry[] | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface BundleActor {
  id: string;
  name?: string | null;
  /**
   * @default "user"
   */
  type?: "user" | "ai" | "system" | "import" | null;
  semantic?: BundleSemantic | null;
}

export interface BundleChangeEntry {
  kind: "added" | "modified" | "removed" | "renamed";
  artifactKind: string;
  key?: string | null;
  path?: string | null;
  summary?: string | null;
  /**
   * 破坏性变更需人工确认才能发布
   * @default false
   */
  breaking?: boolean | null;
  semantic?: BundleSemantic | null;
}

export interface BundleArtifacts {
  dataSchemas: DataSchema[];
  uiSchemas?: UISchema[] | null;
  logicSchemas?: LogicSchema[] | null;
  /**
   * 随应用分发的自定义组件契约。平台内建组件不入包
   */
  components?: ComponentContract[] | null;
  enums?: DataEnumDef[] | null;
  roles?: BundleRoleDef[] | null;
  permissions?: BundlePermissionGrant[] | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 角色定义。dataScope 是数据权限的语义层，编译期下推为 SQL 条件；custom 时才用 customRule，避免所有角色都靠手写条件。
 */
export interface BundleRoleDef {
  id: BundleId;
  key: BundleKey;
  name: BundleName;
  description?: BundleDescription | null;
  /**
   * @default "app"
   */
  level?: "system" | "tenant" | "app" | null;
  /**
   * 平台内置角色，租户不可删除（如 租户管理员 / 教师 / 学生 / 家长）
   * @default false
   */
  builtin?: boolean | null;
  /**
   * @default "self"
   */
  dataScope?: "all" | "dept" | "deptAndChildren" | "self" | "custom" | "none" | null;
  /**
   * dataScope=custom 时的行级条件表达式
   */
  customRule?: BundleExpr | null;
  /**
   * 角色继承，权限取并集
   */
  inheritFrom?: BundleKey[] | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface BundlePermissionGrant {
  roleKey: BundleKey;
  /**
   * 资源标识：实体 key / 页面 key / 动作 key / api:xxx / *
   */
  resource: string;
  /**
   * @default "entity"
   */
  resourceType?: "entity" | "page" | "action" | "api" | "flow" | "component" | "menu" | "field" | "all" | null;
  /**
   * 允许的操作。数据操作（create/read/update/delete/list/export/import）+ 流程办理动作（approve/reject/return/transfer/addSign，与 TaskForm.buttons[].outcome 同一套取值）+ 动作编排的 execute 权 + 通配 *。
   */
  actions: ("create" | "read" | "update" | "delete" | "list" | "export" | "import" | "approve" | "reject" | "return" | "transfer" | "addSign" | "execute" | "*")[];
  /**
   * 字段级授权；缺省全部字段
   */
  fields?: BundleKey[] | null;
  /**
   * 附加条件，为真才授权。用于「仅本学院可见」这类场景
   */
  condition?: BundleExpr | null;
  /**
   * 是否向子角色/子部门传递
   * @default true
   */
  inherit?: boolean | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface BundleNavigation {
  menus?: UiMenuItem[] | null;
  defaultRoute?: string | null;
  homePageRef?: string | null;
  /**
   * @default true
   */
  breadcrumb?: boolean | null;
  /**
   * 是否启用多标签页工作台（教务/办公系统常用）
   * @default false
   */
  tabs?: boolean | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * 发布与部署配置。migrationStrategy 是本协议最重要的运维决策：strict 表示 DDL 变更必须人工审核后执行，低代码平台强烈建议默认 strict。
 */
export interface BundlePublishConfig {
  /**
   * 多端发布开关，对应「一键发布」需求
   */
  targets?: BundlePublishConfigTargetsItem[] | null;
  /**
   * @default ["dev","prod"]
   */
  environments?: ("dev" | "test" | "staging" | "prod")[] | null;
  /**
   * 发布到 prod 需要二级审批
   * @default true
   */
  requireApproval?: boolean | null;
  /**
   * @default "strict"
   */
  migrationStrategy?: "auto" | "strict" | "manual" | "none" | null;
  /**
   * 是否允许自动执行 DROP COLUMN / DROP TABLE。默认禁止
   * @default false
   */
  allowDestructive?: boolean | null;
  /**
   * @default true
   */
  backupBefore?: boolean | null;
  /**
   * 可快速回滚的时间窗，超窗需走数据补偿流程
   * @default 72
   */
  rollbackWindowHours?: number | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

export interface BundlePublishConfigTargetsItem {
  platform: "web" | "mobile" | "miniprogram" | "wecom" | "dingtalk" | "desktop";
  /**
   * @default true
   */
  enabled?: boolean | null;
  config?: Record<string, unknown> | null;
  minVersion?: string | null;
  semantic?: BundleSemantic | null;
}

export interface BundleMeta {
  /**
   * 产出该包的工具与版本，如 lcp-designer/0.1.0
   */
  generator?: string | null;
  createdWith?: string | null;
  docs?: string | null;
  changelog?: string[] | null;
  /**
   * AI 参与的记录。为生成质量度量与人工修正回流保留数据
   */
  ai?: BundleMetaAi | null;
  /**
   * 模板市场元数据。安装时以快照为源，安装后与原模板解耦（可选择接收升级）
   */
  marketplace?: BundleMetaMarketplace | null;
  semantic?: BundleSemantic | null;

  /** 扩展键：匹配 ^x- 的额外属性，平台原样透传，不参与校验 */
  [key: string]: unknown;
}

/**
 * AI 参与的记录。为生成质量度量与人工修正回流保留数据
 */
export interface BundleMetaAi {
  /**
   * 由 AI 生成并保留至今的工件路径
   */
  generatedParts?: string[] | null;
  model?: string | null;
  prompt?: string | null;
  /**
   * @minimum 0
   * @maximum 1
   */
  humanEditedRatio?: number | null;
  /**
   * 生成该应用的 AI 服务标识，如 lcp-ai/0.1.0；人工手写填 human
   */
  generator?: string | null;
  /**
   * 本应用中用到/开放的 AI 生成能力，如 form-from-text
   */
  capabilities?: string[] | null;
  note?: string | null;
  semantic?: BundleSemantic | null;
}

/**
 * 模板市场元数据。安装时以快照为源，安装后与原模板解耦（可选择接收升级）
 */
export interface BundleMetaMarketplace {
  listingId?: string | null;
  publisher?: string | null;
  /**
   * @default 0
   */
  price?: number | null;
  license?: string | null;
  installCount?: number | null;
  /**
   * @default true
   */
  upgradeable?: boolean | null;
  /**
   * 是否允许发布到模板市场
   * @default false
   */
  publishable?: boolean | null;
  /**
   * 市场分类，如 education/hr
   */
  category?: string | null;
  previewImage?: CommonAssetRef | null;
  installParams?: BundleInstallParam[] | null;
  semantic?: BundleSemantic | null;
}

/**
 * 应用安装时需要使用者填写的参数（如组织架构来源、审批阈值）。
 */
export interface BundleInstallParam {
  key: BundleKey;
  label: BundleText;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "select" | "json";
  /**
   * @default false
   */
  required?: boolean | null;
  options?: unknown[] | null;
  defaultValue?: BundleValue | null;
  semantic?: BundleSemantic | null;
}

/** @alias 该定义是 CommonValue 的别名，不引入新结构。 */
export type BundleValue = CommonValue;
