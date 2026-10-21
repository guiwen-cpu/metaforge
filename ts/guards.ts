/**
 * 运行时类型守卫与判别器 —— 由 tools/gen-ts.mjs 生成，请勿手工修改。
 *
 * 定位：给「元数据运行时」用，不是给业务代码用的。BFF 聚合层、前端运行时渲染器、
 * 自定义组件沙箱宿主、出码引擎拿到的都是 unknown（来自 JSON / HTTP / postMessage），
 * 进入强类型世界之前先过这里。
 *
 * 边界：只做结构判定，不做语义校验 —— 函数是否存在、字段是否在实体上、
 * 权限动作是否合法，都属于 L2/L3 校验（tools/validate.mjs）的职责。
 *
 * 用法：
 *   if (!isLogicStep(raw)) throw new Error("不是合法的步骤");
 *   switch (logicStepType(raw)) { case "apiCall": ... }
 */
import type {
  CommonText,
  CommonTextDefault,
  DataValidator,
  DataValidatorExpr,
  DataValidatorFileAccept,
  DataValidatorFileMaxSize,
  DataValidatorMax,
  DataValidatorMaxLength,
  DataValidatorMin,
  DataValidatorMinLength,
  DataValidatorPattern,
  DataValidatorRange,
  DataValidatorUniqueIn,
  LogicApiAuth,
  LogicApiAuthApiKey,
  LogicApiAuthBasic,
  LogicApiAuthBearer,
  LogicApiAuthNone,
  LogicApiAuthOauth2,
  LogicApiAuthSignature,
  LogicApiAuthTenant,
  LogicApiCallStep,
  LogicAssignStep,
  LogicBranchStep,
  LogicCallActionStep,
  LogicCloseDialogStep,
  LogicCodeStep,
  LogicCompleteTaskStep,
  LogicConfirmStep,
  LogicCustomStep,
  LogicDelayStep,
  LogicDownloadStep,
  LogicEmitStep,
  LogicFailStep,
  LogicLogStep,
  LogicLoopStep,
  LogicNavigateStep,
  LogicOpenDialogStep,
  LogicParallelStep,
  LogicPrintStep,
  LogicStartFlowStep,
  LogicStep,
  LogicTransactionStep,
  LogicUploadStep,
  LogicValidateStep,
  UiApiDataSource,
  UiComputedDataSource,
  UiDataSource,
  UiEntityDataSource,
  UiFlowDataSource,
  UiHandlerRef,
  UiHandlerRefActionRef,
  UiHandlerRefCode,
  UiHandlerRefSteps,
  UiNodeHandlerRef,
  UiNodeHandlerRefActionRef,
  UiNodeHandlerRefSteps,
  UiStaticDataSource,
} from "./types";

/** 纯对象判定：排除 null 与数组。所有字段型守卫的第一步。 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 穷尽检查：switch 漏掉联合成员时编译期报错。 */
export function assertNever(value: never, hint?: string): never {
  throw new Error("unreachable union member" + (hint === undefined ? "" : " (" + hint + ")") + ": " + JSON.stringify(value));
}

/* common.Text —— 结构联合，2 个变体 */
export function isCommonTextString(value: CommonText): value is string {
  return typeof value === "string";
}

export function isCommonTextDefault(value: CommonText): value is CommonTextDefault {
  return isPlainRecord(value) && "default" in value;
}

/* common.Expr —— 分支模型手写在 expr.ts，用 isExpr / isStrictExpr 判定 */

/* data.Validator —— 判别联合，10 个变体 */
/** 全部 type 判别值，顺序与 Schema 分支顺序一致。 */
export const DATA_VALIDATOR_TYPE_VALUES = ["min", "max", "minLength", "maxLength", "pattern", "range", "fileMaxSize", "fileAccept", "expr", "uniqueIn"] as const;

export type DATA_VALIDATOR_TYPE = (typeof DATA_VALIDATOR_TYPE_VALUES)[number];

/** 宽松判定：结构像 + type 命中任一判别值。运行时入口用这个，不要用 as 强转。 */
export function isDataValidator(value: unknown): value is DataValidator {
  return isPlainRecord(value) && typeof value["type"] === "string" && (DATA_VALIDATOR_TYPE_VALUES as readonly string[]).indexOf(value["type"] as string) >= 0;
}

/** 取判别值。调用前请先用 isDataValidator 收窄，否则拿不到精确类型。 */
export function dataValidatorType(value: DataValidator): DATA_VALIDATOR_TYPE {
  return value.type as DATA_VALIDATOR_TYPE;
}

export function isDataValidatorMin(value: DataValidator): value is DataValidatorMin {
  return value.type === "min";
}

export function isDataValidatorMax(value: DataValidator): value is DataValidatorMax {
  return value.type === "max";
}

export function isDataValidatorMinLength(value: DataValidator): value is DataValidatorMinLength {
  return value.type === "minLength";
}

export function isDataValidatorMaxLength(value: DataValidator): value is DataValidatorMaxLength {
  return value.type === "maxLength";
}

export function isDataValidatorPattern(value: DataValidator): value is DataValidatorPattern {
  return value.type === "pattern";
}

export function isDataValidatorRange(value: DataValidator): value is DataValidatorRange {
  return value.type === "range";
}

export function isDataValidatorFileMaxSize(value: DataValidator): value is DataValidatorFileMaxSize {
  return value.type === "fileMaxSize";
}

export function isDataValidatorFileAccept(value: DataValidator): value is DataValidatorFileAccept {
  return value.type === "fileAccept";
}

export function isDataValidatorExpr(value: DataValidator): value is DataValidatorExpr {
  return value.type === "expr";
}

export function isDataValidatorUniqueIn(value: DataValidator): value is DataValidatorUniqueIn {
  return value.type === "uniqueIn";
}

/* ui.HandlerRef —— 结构联合，3 个变体 */
export function isUiHandlerRefActionRef(value: UiHandlerRef): value is UiHandlerRefActionRef {
  return isPlainRecord(value) && "actionRef" in value;
}

export function isUiHandlerRefSteps(value: UiHandlerRef): value is UiHandlerRefSteps {
  return isPlainRecord(value) && "steps" in value;
}

export function isUiHandlerRefCode(value: UiHandlerRef): value is UiHandlerRefCode {
  return isPlainRecord(value) && "code" in value;
}

/* ui.NodeHandlerRef —— 结构联合，2 个变体 */
export function isUiNodeHandlerRefActionRef(value: UiNodeHandlerRef): value is UiNodeHandlerRefActionRef {
  return isPlainRecord(value) && "actionRef" in value;
}

export function isUiNodeHandlerRefSteps(value: UiNodeHandlerRef): value is UiNodeHandlerRefSteps {
  return isPlainRecord(value) && "steps" in value;
}

/* ui.DataSource —— 判别联合，5 个变体 */
/** 全部 type 判别值，顺序与 Schema 分支顺序一致。 */
export const UI_DATA_SOURCE_TYPE_VALUES = ["entity", "api", "flow", "static", "computed"] as const;

export type UI_DATA_SOURCE_TYPE = (typeof UI_DATA_SOURCE_TYPE_VALUES)[number];

/** 宽松判定：结构像 + type 命中任一判别值。运行时入口用这个，不要用 as 强转。 */
export function isUiDataSource(value: unknown): value is UiDataSource {
  return isPlainRecord(value) && typeof value["type"] === "string" && (UI_DATA_SOURCE_TYPE_VALUES as readonly string[]).indexOf(value["type"] as string) >= 0;
}

/** 取判别值。调用前请先用 isUiDataSource 收窄，否则拿不到精确类型。 */
export function uiDataSourceType(value: UiDataSource): UI_DATA_SOURCE_TYPE {
  return value.type as UI_DATA_SOURCE_TYPE;
}

export function isUiEntityDataSource(value: UiDataSource): value is UiEntityDataSource {
  return value.type === "entity";
}

export function isUiApiDataSource(value: UiDataSource): value is UiApiDataSource {
  return value.type === "api";
}

export function isUiFlowDataSource(value: UiDataSource): value is UiFlowDataSource {
  return value.type === "flow";
}

export function isUiStaticDataSource(value: UiDataSource): value is UiStaticDataSource {
  return value.type === "static";
}

export function isUiComputedDataSource(value: UiDataSource): value is UiComputedDataSource {
  return value.type === "computed";
}

/* logic.Step —— 判别联合，23 个变体 */
/** 全部 type 判别值，顺序与 Schema 分支顺序一致。 */
export const LOGIC_STEP_TYPE_VALUES = ["validate", "assign", "apiCall", "openDialog", "closeDialog", "confirm", "branch", "loop", "parallel", "callAction", "code", "upload", "download", "startFlow", "completeTask", "print", "transaction", "delay", "emit", "log", "custom", "fail", "navigate"] as const;

export type LOGIC_STEP_TYPE = (typeof LOGIC_STEP_TYPE_VALUES)[number];

/** 宽松判定：结构像 + type 命中任一判别值。运行时入口用这个，不要用 as 强转。 */
export function isLogicStep(value: unknown): value is LogicStep {
  return isPlainRecord(value) && typeof value["type"] === "string" && (LOGIC_STEP_TYPE_VALUES as readonly string[]).indexOf(value["type"] as string) >= 0;
}

/** 取判别值。调用前请先用 isLogicStep 收窄，否则拿不到精确类型。 */
export function logicStepType(value: LogicStep): LOGIC_STEP_TYPE {
  return value.type as LOGIC_STEP_TYPE;
}

export function isLogicValidateStep(value: LogicStep): value is LogicValidateStep {
  return value.type === "validate";
}

export function isLogicAssignStep(value: LogicStep): value is LogicAssignStep {
  return value.type === "assign";
}

export function isLogicApiCallStep(value: LogicStep): value is LogicApiCallStep {
  return value.type === "apiCall";
}

export function isLogicOpenDialogStep(value: LogicStep): value is LogicOpenDialogStep {
  return value.type === "openDialog";
}

export function isLogicCloseDialogStep(value: LogicStep): value is LogicCloseDialogStep {
  return value.type === "closeDialog";
}

export function isLogicConfirmStep(value: LogicStep): value is LogicConfirmStep {
  return value.type === "confirm";
}

export function isLogicBranchStep(value: LogicStep): value is LogicBranchStep {
  return value.type === "branch";
}

export function isLogicLoopStep(value: LogicStep): value is LogicLoopStep {
  return value.type === "loop";
}

export function isLogicParallelStep(value: LogicStep): value is LogicParallelStep {
  return value.type === "parallel";
}

export function isLogicCallActionStep(value: LogicStep): value is LogicCallActionStep {
  return value.type === "callAction";
}

export function isLogicCodeStep(value: LogicStep): value is LogicCodeStep {
  return value.type === "code";
}

export function isLogicUploadStep(value: LogicStep): value is LogicUploadStep {
  return value.type === "upload";
}

export function isLogicDownloadStep(value: LogicStep): value is LogicDownloadStep {
  return value.type === "download";
}

export function isLogicStartFlowStep(value: LogicStep): value is LogicStartFlowStep {
  return value.type === "startFlow";
}

export function isLogicCompleteTaskStep(value: LogicStep): value is LogicCompleteTaskStep {
  return value.type === "completeTask";
}

export function isLogicPrintStep(value: LogicStep): value is LogicPrintStep {
  return value.type === "print";
}

export function isLogicTransactionStep(value: LogicStep): value is LogicTransactionStep {
  return value.type === "transaction";
}

export function isLogicDelayStep(value: LogicStep): value is LogicDelayStep {
  return value.type === "delay";
}

export function isLogicEmitStep(value: LogicStep): value is LogicEmitStep {
  return value.type === "emit";
}

export function isLogicLogStep(value: LogicStep): value is LogicLogStep {
  return value.type === "log";
}

export function isLogicCustomStep(value: LogicStep): value is LogicCustomStep {
  return value.type === "custom";
}

export function isLogicFailStep(value: LogicStep): value is LogicFailStep {
  return value.type === "fail";
}

export function isLogicNavigateStep(value: LogicStep): value is LogicNavigateStep {
  return value.type === "navigate";
}

/* logic.ApiAuth —— 判别联合，7 个变体 */
/** 全部 type 判别值，顺序与 Schema 分支顺序一致。 */
export const LOGIC_API_AUTH_TYPE_VALUES = ["none", "tenant", "bearer", "apiKey", "basic", "oauth2", "signature"] as const;

export type LOGIC_API_AUTH_TYPE = (typeof LOGIC_API_AUTH_TYPE_VALUES)[number];

/** 宽松判定：结构像 + type 命中任一判别值。运行时入口用这个，不要用 as 强转。 */
export function isLogicApiAuth(value: unknown): value is LogicApiAuth {
  return isPlainRecord(value) && typeof value["type"] === "string" && (LOGIC_API_AUTH_TYPE_VALUES as readonly string[]).indexOf(value["type"] as string) >= 0;
}

/** 取判别值。调用前请先用 isLogicApiAuth 收窄，否则拿不到精确类型。 */
export function logicApiAuthType(value: LogicApiAuth): LOGIC_API_AUTH_TYPE {
  return value.type as LOGIC_API_AUTH_TYPE;
}

export function isLogicApiAuthNone(value: LogicApiAuth): value is LogicApiAuthNone {
  return value.type === "none";
}

export function isLogicApiAuthTenant(value: LogicApiAuth): value is LogicApiAuthTenant {
  return value.type === "tenant";
}

export function isLogicApiAuthBearer(value: LogicApiAuth): value is LogicApiAuthBearer {
  return value.type === "bearer";
}

export function isLogicApiAuthApiKey(value: LogicApiAuth): value is LogicApiAuthApiKey {
  return value.type === "apiKey";
}

export function isLogicApiAuthBasic(value: LogicApiAuth): value is LogicApiAuthBasic {
  return value.type === "basic";
}

export function isLogicApiAuthOauth2(value: LogicApiAuth): value is LogicApiAuthOauth2 {
  return value.type === "oauth2";
}

export function isLogicApiAuthSignature(value: LogicApiAuth): value is LogicApiAuthSignature {
  return value.type === "signature";
}

