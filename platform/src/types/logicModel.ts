export type LogicStepType =
  | "validate"
  | "assign"
  | "apiCall"
  | "openDialog"
  | "closeDialog"
  | "confirm"
  | "branch"
  | "loop"
  | "parallel"
  | "callAction"
  | "code"
  | "upload"
  | "download"
  | "startFlow"
  | "completeTask"
  | "print"
  | "transaction"
  | "delay"
  | "emit"
  | "log"
  | "fail"
  | "navigate"
  | "custom";

export interface ArtifactRef {
  kind?: string;
  key?: string;
  id?: string;
  assetId?: string;
  version?: number;
  [key: string]: unknown;
}

export interface LogicSemantic {
  intent?: string;
  aliases?: string[];
  examples?: string[];
  [key: string]: unknown;
}

export interface LogicStep {
  id: string;
  type: LogicStepType | string;
  label?: string;
  note?: string;
  when?: unknown;
  disabled?: boolean;
  continueOnError?: boolean;
  onError?: LogicStep[];
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface ActionParam {
  key: string;
  label?: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  [key: string]: unknown;
}

export type ActionTrigger =
  | "manual"
  | "onLoad"
  | "onSubmit"
  | "onApprove"
  | "onReject"
  | "onSchedule"
  | "onWebhook"
  | "onEntityChange";

export interface LogicAction {
  id: string;
  key: string;
  name: string;
  description?: string;
  trigger?: ActionTrigger | string;
  params?: ActionParam[];
  when?: unknown;
  steps: LogicStep[];
  transaction?: boolean;
  idempotent?: boolean;
  timeoutMs?: number;
  access?: unknown;
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface LogicApi {
  id: string;
  key: string;
  name: string;
  description?: string;
  kind?: string;
  method: string;
  path: string;
  baseUrl?: string;
  connectionRef?: ArtifactRef;
  auth?: unknown;
  timeoutMs?: number;
  retry?: unknown;
  cache?: unknown;
  rateLimit?: unknown;
  request?: unknown;
  response?: unknown;
  before?: LogicStep[];
  after?: LogicStep[];
  mock?: unknown;
  idempotent?: boolean;
  tags?: string[];
  access?: unknown;
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface FlowVariableMapping {
  name: string;
  direction: string;
  source?: unknown;
  type?: string;
  [key: string]: unknown;
}

export interface LogicFlow {
  id: string;
  key: string;
  name: string;
  description?: string;
  engine?: string;
  processKey: string;
  bpmnRef: ArtifactRef;
  variableMappings?: FlowVariableMapping[];
  taskForms?: unknown[];
  listeners?: unknown[];
  allowRecall?: boolean;
  allowReturn?: boolean;
  allowTransfer?: boolean;
  allowAddSign?: boolean;
  access?: unknown;
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface LogicRule {
  id: string;
  key: string;
  name: string;
  description?: string;
  kind: string;
  entityRef?: ArtifactRef;
  on?: string;
  when?: unknown;
  then: LogicStep[];
  priority?: number;
  enabled?: boolean;
  stopOnFail?: boolean;
  access?: unknown;
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface LogicSchema {
  id: string;
  key: string;
  name: string;
  scope?: string;
  version: number;
  description?: string;
  actions: LogicAction[];
  apis: LogicApi[];
  flows: LogicFlow[];
  rules: LogicRule[];
  access?: unknown;
  semantic?: LogicSemantic;
  [key: string]: unknown;
}

export interface LogicIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export type LogicTab = "actions" | "apis" | "flows" | "rules";

export type StepFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "bool"
  | "select"
  | "json"
  | "ref"
  | "code";

export interface StepField {
  key: string;
  label: string;
  kind: StepFieldKind;
  options?: string[];
  refKind?: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
}

export interface StepTypeDef {
  type: LogicStepType;
  label: string;
  group: string;
  icon: string;
  color: string;
  description: string;
  fields: StepField[];
  create: () => LogicStep;
}