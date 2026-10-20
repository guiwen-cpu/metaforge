import type { DataSchema } from "./dataModel";
import type { ComponentDef, UISchema } from "./uiModel";

export interface FieldOption {
  label: string;
  value: string;
}

export interface RuntimeMenuItem {
  id: string;
  key: string;
  title: string;
  icon?: string | null;
  path?: string | null;
  url?: string | null;
  target?: string | null;
  page_key?: string | null;
  order: number;
  children: RuntimeMenuItem[];
}

export interface RuntimePageLink {
  key: string;
  title: string;
  path?: string | null;
  kind: string;
}

export interface RuntimeNavigation {
  app_id: string;
  app_key: string;
  app_name: string;
  version_no: number;
  role_keys: string[];
  menus: RuntimeMenuItem[];
  default_route?: string | null;
  home_page_ref?: string | null;
  breadcrumb: boolean;
  tabs: boolean;
  pages: RuntimePageLink[];
}

export interface RuntimePageView {
  key: string;
  title: string;
  kind: string;
  path?: string | null;
  version_no: number;
  page: UISchema;
  data_schemas: DataSchema[];
  components: ComponentDef[];
  actions: RuntimeActionDefinition[];
  /** 当前用户可执行的动作；缺省表示旧后端未下发，前端不做能力过滤。 */
  allowed_actions?: string[];
}

/** 发布态动作定义。steps 保留原始 JSON，由运行时按步骤类型分工执行。 */
export interface RuntimeActionDefinition {
  id?: string;
  key: string;
  name?: string;
  description?: string;
  trigger?: string;
  when?: unknown;
  steps?: RuntimeStep[];
  params?: RuntimeActionParam[];
  access?: Record<string, unknown>;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface RuntimeActionParam {
  key: string;
  type?: string;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface RuntimeStep {
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface DataSourceQueryFilter {
  field: string;
  op: string;
  value: unknown;
}

export interface DataSourceSort {
  field: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last" | null;
}

export interface DataSourceQueryPayload {
  state?: Record<string, unknown>;
  query?: Record<string, unknown>;
  filters?: DataSourceQueryFilter[];
  sort?: DataSourceSort[];
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
  routeQuery?: Record<string, unknown>;
}

export interface DataSourceQueryResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  size: number;
  item?: Record<string, unknown> | null;
}

/** 页面级数据源快照，既供表达式取值，也供表格/分页读取。 */
export interface RuntimeDataSourceState extends DataSourceQueryResult {
  id: string;
  loading: boolean;
  error?: string | null;
}

export interface RuntimeField {
  key: string;
  label: string;
  type: string;
  value: unknown;
  options?: FieldOption[] | null;
  widget?: string | null;
}

export interface RuntimeAction {
  key: string;
  label: string;
  outcome: string;
  style: string;
  comment_required: boolean;
}

export interface TaskFormView {
  task_key: string;
  name: string;
  page_key?: string | null;
  assignee_type?: string | null;
  actions: RuntimeAction[];
  editable_fields: string[];
  readonly_fields: string[];
}

export interface FlowView {
  key: string;
  name: string;
  process_key: string;
  process_definition_id?: string | null;
  deployed: boolean;
  task_forms: TaskFormView[];
}

export interface TimelineItem {
  activity_id: string;
  name?: string | null;
  type: string;
  assignee?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_ms?: number | null;
  status: string;
}

export interface TaskSummary {
  task_id: string;
  task_key: string;
  task_name: string;
  process_instance_id: string;
  process_definition_id: string;
  business_key: string;
  business_title: string;
  flow_key: string;
  flow_name: string;
  assignee?: string | null;
  applicant_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  due_at?: string | null;
}

export interface TaskDetail extends TaskSummary {
  can_act: boolean;
  finished: boolean;
  business: Record<string, unknown>;
  fields: RuntimeField[];
  variables: Record<string, unknown>;
  actions: RuntimeAction[];
  editable_fields: string[];
  readonly_fields: string[];
  timeline: TimelineItem[];
}

export interface InstanceView {
  process_instance_id: string;
  process_definition_id: string;
  business_key: string;
  business_title: string;
  flow_key: string;
  flow_name: string;
  finished: boolean;
  status?: string | null;
  business: Record<string, unknown>;
  variables: Record<string, unknown>;
  fields: RuntimeField[];
  active_tasks: TaskSummary[];
  timeline: TimelineItem[];
}

export interface InstanceSummary {
  process_instance_id: string;
  process_definition_id: string;
  business_key: string;
  flow_key: string;
  flow_name: string;
  business_title: string;
  applicant_id?: string | null;
  status?: string | null;
  finished: boolean;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface StartInstancePayload {
  business_id?: string;
  business?: Record<string, unknown>;
  variables?: Record<string, unknown>;
}

export interface CompleteTaskPayload {
  outcome?: string;
  comment?: string;
  variables?: Record<string, unknown>;
}

export interface TransferTaskPayload {
  to_user_id: string;
  comment?: string;
}

export interface NotificationItem {
  id: string;
  app_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  biz_type?: string | null;
  biz_id?: string | null;
  created_at?: string | null;
  read_at?: string | null;
  read: boolean;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

export interface NotificationReadResult {
  updated: number;
  unread: number;
}

export interface UnreadCount {
  unread: number;
}

export interface StartResult {
  process_instance_id: string;
  business_id: string;
  flow_key: string;
  current_task_key?: string | null;
  assignee?: string | null;
  task?: TaskDetail | null;
}

export interface StepTrace {
  step_id: string;
  type: string;
  label?: string | null;
  status: string;
  duration_ms: number;
  message?: string | null;
  result?: unknown;
  children?: StepTrace[] | null;
}

export interface ActionError {
  code: string;
  message?: string | null;
  fields?: string[] | null;
  rollback: boolean;
}

export interface ActionWritebackAdvance {
  outcome: string;
  comment?: unknown;
  status?: string | null;
  message?: string | null;
}

export interface ActionWriteback {
  variables?: Record<string, unknown> | null;
  business?: Record<string, unknown> | null;
  advance?: ActionWritebackAdvance | null;
  applied?: Record<string, unknown> | null;
}

export interface ActionExecutionResult {
  app_key: string;
  version_no: number;
  action_key: string;
  status: string;
  duration_ms: number;
  result?: unknown;
  vars?: Record<string, unknown> | null;
  events?: unknown[] | null;
  trace: StepTrace[];
  error?: ActionError | null;
  writeback?: ActionWriteback | null;
  run_id?: string | null;
  state?: Record<string, unknown> | null;
}

export interface ExecuteActionPayload {
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
  event?: Record<string, unknown>;
}

export interface RuntimeApiInvokePayload {
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
  resultPath?: string | null;
}

export interface ActionRunSummary {
  id: string;
  action_key: string;
  status: string;
  version_no: number;
  user_id?: string | null;
  task_id?: string | null;
  process_instance_id?: string | null;
  business_id?: string | null;
  duration_ms: number;
  replayed_from?: string | null;
  created_at?: string | null;
}

export interface ActionRunDetail extends ActionRunSummary {
  params?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  result?: unknown;
  vars?: Record<string, unknown> | null;
  trace?: StepTrace[] | null;
  error?: ActionError | null;
  writeback?: ActionWriteback | null;
}

export interface ActionRunFeed {
  items: ActionRunSummary[];
  total: number;
}
