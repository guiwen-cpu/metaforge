import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = `${P}/examples/leave-approval.bundle.json`;
const bundle = JSON.parse(fs.readFileSync(FILE, "utf8")).bundle;

const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let seq = 0;
const uid = () => { seq += 1; let n = seq, s = ""; while (s.length < 6) { s = A[n % 32] + s; n = Math.floor(n / 32); } return "01J8ZQ4K2M0000000000" + s; };

const tref = (kind, key, version = 1) => ({ kind, key, version });
const act = (key, params) => ({ actionRef: tref("action", key), ...(params ? { params } : {}) });
const inline = (arr) => ({ steps: arr });
const st = (o) => ({ id: uid(), ...o });
const n = (component, o = {}) => ({ id: uid(), component, ...o });
const col = (field, o = {}) => ({ field, ...o });
const fld = (field, o = {}) => ({ field, ...o });
const btn = (key, label, o = {}) => ({ key, label, ...o });
const L = (...xs) => ({ $lit: xs.length === 1 ? xs[0] : xs });
const R = (p) => ({ $ref: p });
const F = (name, ...args) => ({ $fn: name, $args: args });
const EQ = (a, b) => F("eq", a, b);
const IN = (a, list) => F("in", a, L(list));

const ds = bundle.artifacts.dataSchemas[0];
const ent = (key) => ds.entities.find(e => e.key === key);
const fldDef = (entity, key) => ent(entity).fields.find(f => f.key === key);

// 幂等：脚本以已落盘的 bundle 为基底增量修改，重复执行时先摘掉本脚本负责的枚举，避免累积
const OWNED_ENUMS = ["urgency", "employee_position", "attachment_kind", "leave_outcome"];
ds.enums = ds.enums.filter(e => !OWNED_ENUMS.includes(e.key));
ds.enums.push(
  { id: uid(), key: "urgency", name: "紧急程度", scope: "app", values: [
    { value: "low", label: "不紧急", color: "info", order: 1 },
    { value: "normal", label: "普通", color: "primary", order: 2 },
    { value: "high", label: "紧急", color: "warning", order: 3 },
    { value: "urgent", label: "特急", color: "danger", order: 4 }],
    semantic: { intent: "特急单据在待办列表中置顶并触发短信提醒", synonyms: ["紧急度"] } },
  { id: uid(), key: "employee_position", name: "岗位类别", scope: "app", values: [
    { value: "teacher", label: "教师", color: "primary", order: 1 },
    { value: "admin", label: "行政", color: "info", order: 2 },
    { value: "logistics", label: "后勤", color: "info", order: 3 },
    { value: "intern", label: "实习", color: "warning", order: 4 }],
    semantic: { intent: "影响年假额度与审批链路" } },
  { id: uid(), key: "attachment_kind", name: "附件类型", scope: "app", values: [
    { value: "image", label: "图片", color: "success", order: 1 },
    { value: "video", label: "视频", color: "warning", order: 2 },
    { value: "document", label: "办公文档", color: "primary", order: 3 },
    { value: "other", label: "其他", color: "info", order: 4 }] },
  { id: uid(), key: "leave_outcome", name: "审批结论", scope: "app", values: [
    { value: "approve", label: "通过", color: "success", order: 1 },
    { value: "reject", label: "驳回", color: "danger", order: 2 },
    { value: "return", label: "退回修改", color: "warning", order: 3 }],
    semantic: { intent: "与 CompleteTaskStep.outcome 取值一一对应，前端按钮与流程结论不得各写一套" } }
);

fldDef("employee", "position").enumRef = tref("enum", "employee_position");
fldDef("leave_request", "urgency").enumRef = tref("enum", "urgency");
fldDef("attachment", "kind").enumRef = tref("enum", "attachment_kind");
fldDef("leave_request", "images").itemType = { type: "image", semantic: { intent: "数组元素是图片资产，控件解析据此落到 x-upload" } };
fldDef("leave_request", "documents").itemType = { type: "file", semantic: { intent: "数组元素是办公文档资产" } };

const flowRef = { kind: "flow", key: "leave_approval", version: 1 };
const pageRefList = { kind: "page", key: "page_leave_list", version: 1 };
const pageRefForm = { kind: "page", key: "page_leave_form", version: 1 };
const pageRefApproval = { kind: "page", key: "page_leave_approval", version: 1 };
const entityLeave = { kind: "entity", key: "leave_request", version: 1 };
const enumRef = (key) => ({ kind: "enum", key, version: 1 });

const uiSchemas = [];
const actions = [];
const apis = [];
const rules = [];
const listeners = [];

// ============================================================ 页面 1：请假列表
const leaveList = {
  id: uid(), key: "page_leave_list", version: 1,
  title: { default: "请假申请", i18n: { "en-US": "Leave Requests" } },
  kind: "list", scope: "app",
  description: "请假单列表：搜索、分页、行内操作（查看/编辑/提交/撤回/删除），数据权限为「本人 + 本部门（按角色）」",
  route: { path: "/leave/requests", name: "LeaveRequestList", layout: "side", keepAlive: true, cache: "page", auth: true, roles: ["student", "teacher", "dept_manager", "school_admin"] },
  params: [
    { key: "from", label: "来源", type: "string", from: "query", required: false, semantic: { intent: "从待办列表跳转时携带，用于高亮来源入口" } }
  ],
  dataSources: [
    {
      id: "ds_leave_page", type: "entity", name: "请假单分页", entityRef: entityLeave, mode: "page",
      select: ["id", "applicant_id", "applicant_name", "dept_id", "leave_type", "urgency", "start_at", "end_at", "days", "reason", "status", "current_task", "created_at", "process_instance_id"],
      include: ["applicant"],
      filter: F("gte", R("$row.created_at"), F("dateAdd", R("$now"), L(-365), L("day"))),
      sort: [{ field: "created_at", direction: "desc", nulls: "last" }],
      page: { pageSize: 10, pageSizes: [10, 20, 50], pageParam: "page", sizeParam: "size", maxPageSize: 200 },
      immediate: true,
      cache: { enabled: false, scope: "page" },
      access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id", deptField: "dept_id" },
      semantic: { intent: "列表主查询。数据权限由 access 声明，编译期为 SQL WHERE 片段并与 filter 叠加 AND，前端不参与过滤" }
    },
    { id: "ds_my_pending", type: "entity", name: "我的待审数", entityRef: entityLeave, mode: "count", filter: F("and", EQ(R("$row.status"), L("pending")), F("isNotEmpty", R("$row.approver_id"))), immediate: true },
    { id: "ds_status_options", type: "static", name: "状态筛选项", data: [{ value: "draft", label: "草稿" }, { value: "pending", label: "审批中" }, { value: "approved", label: "已通过" }, { value: "rejected", label: "已驳回" }, { value: "returned", label: "已退回" }, { value: "cancelled", label: "已撤销" }] },
    {
      id: "ds_leave_one", type: "entity", name: "请假单详情", entityRef: entityLeave, mode: "one",
      pkParam: R("$page.state.detailId"), immediate: false, cache: { enabled: false },
      access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id" },
      semantic: { intent: "抽屉详情用。pkParam 用表达式而不是字符串路径，使详情主键可来自页面状态而非仅限路由参数" }
    }
  ],
  state: {
    query: { type: "object", initial: { page: 1, size: 10 }, description: "搜索条件 + 分页参数，绑定到 x-search-form 与 x-pagination" },
    quickForm: { type: "object", initial: {}, description: "快速申请弹窗的表单模型" },
    selection: { type: "array", initial: [], description: "表格选中行" },
    detailId: { type: "string", initial: null }, detailVisible: { type: "boolean", initial: false },
    quickVisible: { type: "boolean", initial: false }
  },
  layout: n("x-page", {
    props: { title: "请假申请", subtitle: "提交后按假别与天数自动路由审批人", showBreadcrumb: true },
    children: [
      n("x-card", {
        props: { title: "我的请假申请", border: true },
        children: [
          n("x-search-form", {
            props: {
              entityRef: entityLeave, model: R("$page.state.query"), targetDataSourceId: "ds_leave_page", fieldsPerRow: 4, collapsible: true, defaultCollapsed: false,
              searchFieldList: [
                { field: "applicant_name", label: "申请人", op: "like", span: 5, placeholder: "支持模糊匹配" },
                { field: "dept_id", label: "所属部门", op: "in", span: 5, widget: "x-dept-picker" },
                { field: "leave_type", label: "假别", op: "in", span: 4, widget: "x-select" },
                { field: "status", label: "状态", op: "in", span: 4, widget: "x-select" },
                { field: "urgency", label: "紧急度", op: "in", span: 3, widget: "x-select" },
                { field: "start_at", label: "开始时间", op: "between", span: 7, widget: "x-date-picker" }
              ]
            },
            slots: { right: [
              n("x-btn", { props: { text: "新建请假", type: "primary", icon: "Plus" }, handlers: { click: act("leave_open_create") } }),
              n("x-btn", { props: { text: "导出", icon: "Download", permission: F("in", R("$user.roleKeys"), L(["dept_manager", "school_admin"])) }, handlers: { click: act("leave_export_list") } })
            ] }
          }),
          n("x-table", {
            props: {
              entityRef: entityLeave, dataSourceId: "ds_leave_page", rowKey: "id", selection: "multiple", stripe: true, size: "default", autoHeight: true,
              emptyText: "暂无请假记录，点击「新建请假」发起申请",
              columnList: [
                col("applicant_id", { label: "申请人", width: "120", fixed: "left", widget: "x-employee-picker", props: { multiple: false, searchable: false } }),
                col("dept_id", { label: "所属部门", width: "140", widget: "x-dept-picker", props: { multiple: false, mode: "dept" } }),
                col("leave_type", { label: "假别", width: "90", widget: "x-enum-text", enumRef: enumRef("leave_type") }),
                col("urgency", { label: "紧急度", width: "90", widget: "x-enum-text", enumRef: enumRef("urgency") }),
                col("start_at", { label: "开始", width: "150", format: "YYYY-MM-DD HH:mm" }),
                col("end_at", { label: "结束", width: "150", format: "YYYY-MM-DD HH:mm" }),
                col("days", { label: "天数", width: "80", align: "right", sum: true }),
                col("status", { label: "状态", width: "100", widget: "x-status-tag", enumRef: enumRef("leave_status") }),
                col("current_task", { label: "当前节点", width: "130", widget: "x-text", hidden: F("ne", R("$row.status"), L("pending")) }),
                col("created_at", { label: "申请时间", width: "150", sortable: true, format: "YYYY-MM-DD HH:mm" }),
                col("actions", { label: "操作", width: "200", fixed: "right", widget: "x-row-actions", buttons: [
                  btn("detail", "查看", { params: { id: R("$row.id") }, order: 1 }),
                  btn("edit", "编辑", { actionRef: tref("action", "leave_open_edit"), params: { id: R("$row.id") }, visible: IN(R("$row.status"), ["draft", "returned"]), order: 2 }),
                  btn("submit", "提交", { actionRef: tref("action", "leave_submit"), params: { id: R("$row.id") }, visible: IN(R("$row.status"), ["draft", "returned"]), confirm: "提交后将进入审批流程，确认提交？", order: 3 }),
                  btn("recall", "撤回", { params: { id: R("$row.id") }, visible: F("and", EQ(R("$row.status"), L("pending")), EQ(R("$row.applicant_id"), R("$user.id"))), danger: true, confirm: "撤回将终止当前审批，确认撤回？", order: 4 }),
                  btn("remove", "删除", { params: { id: R("$row.id") }, visible: EQ(R("$row.status"), L("draft")), danger: true, confirm: "删除后不可恢复，确认删除？", permission: F("in", R("$user.roleKeys"), L(["school_admin"])), order: 5 })
                ] })
              ]
            },
            handlers: { rowClick: act("leave_open_detail", { id: R("$row.id") }), selectionChange: inline([st({ type: "assign", target: "state.selection", value: R("$ctx.event.rows") })]) }
          }),
          n("x-pagination", { props: { dataSourceId: "ds_leave_page", background: true, pageSizes: [10, 20, 50, 100] } })
        ]
      }),
      n("x-toolbar", { slots: { left: [
        n("x-btn", { props: { text: "批量撤回", type: "warning", plain: true, disabled: F("isEmpty", R("$page.state.selection")) }, handlers: { click: act("leave_batch_recall", { ids: R("$page.state.selection") }) } })
      ] } })
    ]
  }),
  dialogs: {
    dlg_leave_detail: n("x-dialog", {
      props: { model: R("$page.state.detailVisible"), title: "请假单详情", mode: "drawer", width: "860px", showFooter: false },
      children: [
        n("x-descriptions", {
          props: { entityRef: entityLeave, dataSourceId: "ds_leave_one", column: 2, border: true, labelWidth: "110px",
            fieldList: ["applicant_id", "dept_id", "leave_type", "urgency", "start_at", "end_at", "days", "status", "current_task", "created_at", "reason"] }
        }),
        n("x-attachment-list", { props: { bizType: "leave_request", bizId: R("$page.state.detailId"), readonly: true, groupByKind: true } }),
        n("x-approval-timeline", { props: { processInstanceId: R("$data.ds_leave_one.item.process_instance_id"), flowRef, showComment: true, showAssignee: true } })
      ]
    }),
    dlg_leave_quick: n("x-dialog", {
      props: { model: R("$page.state.quickVisible"), title: "快速申请", mode: "dialog", width: "620px" },
      children: [
        n("x-form", {
          props: { entityRef: entityLeave, model: R("$page.state.quickForm"), labelWidth: "100px", columnsPerRow: 2, showActions: false,
            fieldList: [fld("leave_type", { required: true }), fld("urgency"), fld("start_at", { required: true }), fld("end_at", { required: true }), fld("days", { readonly: true }), fld("reason", { span: 24 })] }
        })
      ],
      handlers: { confirm: act("leave_submit", { form: R("$form"), asDraft: false }) }
    })
  },
  handlers: {
    onLoad: inline([
      st({ type: "assign", target: "state.query.applicant_id", value: R("$user.id"), note: "默认只看自己，管理员可在搜索区改选部门" }),
      st({ type: "log", level: "debug", message: L("请假列表已加载"), data: { pageKey: "page_leave_list" } })
    ])
  },
  access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id", fieldPolicy: { id_card: "masked", phone: "masked" } },
  origin: { generator: "human", generatedAt: "2026-10-16T09:12:00+08:00" },
  semantic: { intent: "本人请假单的查看与管理入口", businessDomain: "人事考勤", synonyms: ["请假列表", "我的请假"], aiHint: { generate: "list", constraints: ["必须包含状态筛选", "行操作按钮的可见性用表达式而非页面硬编码"], confidence: 0.9 } }
};
uiSchemas.push(leaveList);

// ============================================================ 页面 2：创建型表单（含图片/视频/办公文件上传）
const leaveForm = {
  id: uid(), key: "page_leave_form", version: 1,
  title: { default: "新建请假申请", i18n: { "en-US": "New Leave Request" } },
  kind: "form", scope: "app",
  description: "创建型表单：新增与编辑共用。含图片（诊断证明）、视频（赛事证明）、办公文档三类上传，全部走 OSS 客户端直传",
  route: { path: "/leave/requests/:id?", name: "LeaveRequestEdit", layout: "side", keepAlive: false, cache: "none", auth: true, roles: ["student", "teacher", "dept_manager"] },
  params: [
    { key: "id", label: "请假单 ID", type: "string", from: "route", required: false, semantic: { intent: "有值为编辑态，无值为新增态；同一份 Schema 覆盖两种场景，靠 pkParam 是否可解析区分" } }
  ],
  dataSources: [
    {
      id: "ds_leave_edit", type: "entity", name: "请假单", entityRef: entityLeave, mode: "one",
      pkParam: R("$route.params.id"), immediate: false,
      access: { roles: ["student", "teacher", "dept_manager"], scope: "self", ownerField: "applicant_id" },
      semantic: { intent: "编辑态回填。新增态下 pkParam 解析为空，运行时不发请求，直接进默认值分支" }
    },
    {
      id: "ds_me", type: "entity", name: "当前登录人档案", entityRef: { kind: "entity", key: "employee", version: 1 }, mode: "one",
      pkParam: R("$user.id"), immediate: true,
      semantic: { intent: "表单默认值来源：申请人、部门、岗位由登录态推导，用户不需要填自己是谁" }
    },
    {
      id: "ds_leave_types", type: "computed", name: "可选假别",
      expr: F("default", F("get", R("$data.ds_me.item.ext"), L("available_leave_types")), L(["personal", "sick", "annual", "compensatory"])),
      dependsOn: ["ds_me"],
      semantic: { intent: "假别不是静态枚举：实习生没有年假，岗位决定可选集合。避免在页面上写死" }
    },
    {
      id: "ds_holidays", type: "api", name: "法定节假日", apiRef: { kind: "api", key: "api_holiday_list", version: 1 },
      params: { year: F("year", R("$now")) }, immediate: true, cache: { enabled: true, ttl: 86400, scope: "tenant" },
      semantic: { intent: "工作日天数计算的依据；按租户缓存一天，避免每次提交都打外部接口" }
    }
  ],
  state: {
    form: { type: "object", initial: {}, description: "表单模型，首次进入由 ds_me 推导默认值" },
    editId: { type: "string", initial: null },
    submitting: { type: "boolean", initial: false },
    daysComputed: { type: "decimal", initial: 0, description: "由逻辑编排写入的工作日天数，只读展示" }
  },
  layout: n("x-page", {
    props: { title: "请假申请", subtitle: "带 * 为必填；病假超过 3 天须上传就诊证明", showBreadcrumb: true, background: "#f5f7fa" },
    children: [
      n("x-card", {
        props: { title: "申请信息", bordered: true },
        children: [
          n("x-form", {
            props: {
              entityRef: entityLeave, model: R("$page.state.form"), labelWidth: "120px", columnsPerRow: 2, showActions: false,
              fieldList: [
                fld("applicant_id", { label: "申请人", widget: "x-employee-picker", required: true, props: { multiple: false } }),
                fld("dept_id", { label: "所属部门", widget: "x-dept-picker", required: true, props: { multiple: false, mode: "dept" } }),
                fld("leave_type", { label: "假别", required: true, help: "可选范围由岗位决定" }),
                fld("urgency", { label: "紧急度", widget: "x-radio-group" }),
                fld("start_at", { label: "开始时间", required: true, props: { type: "datetime" } }),
                fld("end_at", { label: "结束时间", required: true, props: { type: "datetime" } }),
                fld("days", { label: "请假天数", readonly: true, widget: "x-number", help: "按工作日自动计算，提交时以系统计算值为准", props: { precision: 1, unit: "天" } }),
                fld("reason", { label: "请假事由", span: 24, required: true }),
                fld("images", { label: "图片佐证", span: 24, help: "诊断证明、请假条照片，最多 6 张，单张不超过 10MB" }),
                fld("video_proof", { label: "视频佐证", span: 24, help: "可选。如运动队赛事证明，单个不超过 100MB" }),
                fld("documents", { label: "办公文档", span: 24, help: "支持 Word / Excel / PDF，最多 5 个文件" })
              ]
            },
            handlers: {
              submit: act("leave_submit", { form: R("$page.state.form"), editId: R("$page.state.editId"), asDraft: false }),
              reset: inline([st({ type: "assign", target: "state.form", value: L({}) }), st({ type: "emit", event: "ui.toast", payload: { type: "info", message: "已重置" } })])
            }
          })
        ]
      }),
      n("x-toolbar", {
        props: { align: "end", sticky: true },
        slots: { left: [
          n("x-text", { props: { content: F("concat", L("请假天数："), R("$page.state.daysComputed"), L(" 天（已扣除周末与法定节假日）")), size: "13px", color: "#909399" } })
        ], right: [
          n("x-btn", { props: { text: "取消", type: "default" }, handlers: { click: inline([st({ type: "navigate", back: 1, confirmLeave: L("表单尚未保存，确认离开？") })]) } }),
          n("x-btn", { props: { text: "保存草稿", type: "default" }, handlers: { click: act("leave_submit", { form: R("$page.state.form"), asDraft: true }) } }),
          n("x-btn", { props: { text: "提交审批", type: "primary", loading: R("$page.state.submitting") }, handlers: { click: act("leave_submit", { form: R("$page.state.form"), editId: R("$page.state.editId"), asDraft: false }) } })
        ] }
      })
    ]
  }),
  handlers: {
    onLoad: inline([
      st({ type: "branch", cases: [
        { when: R("$route.params.id"), name: "edit", then: [
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_get", version: 1 }, params: { id: R("$route.params.id") }, assignTo: "vars.leaveDetail" }),
          st({ type: "assign", target: "state.form", value: R("$ctx.result") }),
          st({ type: "assign", target: "state.editId", value: R("$route.params.id") })
        ] },
        { when: L(true), name: "create", then: [
          st({ type: "assign", target: "state.form.applicant_id", value: R("$data.ds_me.item.id") }),
          st({ type: "assign", target: "state.form.applicant_name", value: R("$data.ds_me.item.name") }),
          st({ type: "assign", target: "state.form.dept_id", value: R("$data.ds_me.item.dept_id") }),
          st({ type: "assign", target: "state.form.urgency", value: L("normal") }),
          st({ type: "assign", target: "state.form.leave_type", value: F("first", R("$data.ds_leave_types.value")) })
        ] }
      ], else: [st({ type: "log", level: "warn", message: L("表单初始化未命中任何分支") })] })
    ]),
    onParamsChange: inline([st({ type: "emit", event: "ds:ds_leave_edit:refresh" })])
  },
  access: { roles: ["student", "teacher", "dept_manager"], scope: "self", ownerField: "applicant_id" },
  origin: { generator: "template", templateId: "tpl_crud_form_v1", templateVersion: 3, params: { entity: "leave_request", uploadTypes: ["image", "video", "document"] }, generatedAt: "2026-10-16T09:12:00+08:00" },
  semantic: { intent: "创建型表单页，带三类文件上传", businessDomain: "人事考勤", synonyms: ["请假申请页"], aiHint: { generate: "form", constraints: ["未声明 widget 的字段由 Data Schema 推导控件", "上传字段必须声明 pathTemplate 以便多租户隔离"], confidence: 0.95 } }
};
uiSchemas.push(leaveForm);

// ============================================================ 页面 3：审批办理
const leaveApproval = {
  id: uid(), key: "page_leave_approval", version: 1,
  title: { default: "请假审批办理", i18n: { "en-US": "Leave Approval" } },
  kind: "approval", scope: "app",
  description: "审批办理页。同一张页面被多个审批节点复用：节点差异由 Flow.taskForms 声明可编辑字段，页面本身不写死节点逻辑",
  route: { path: "/leave/approval/:taskId", name: "LeaveApproval", layout: "side", keepAlive: false, cache: "none", auth: true, roles: ["teacher", "dept_manager", "school_admin"] },
  params: [
    { key: "taskId", label: "任务 ID", type: "string", from: "route", required: true, semantic: { intent: "Flowable 任务主键；从待办列表点入时携带" } }
  ],
  dataSources: [
    { id: "ds_task", type: "flow", name: "当前任务", flowRef, kind: "instance", immediate: true,
      semantic: { intent: "平台按 taskId 取任务上下文：节点标识、流程实例、发起人、流程变量。$process 根同步填充，二者等价" } },
    {
      id: "ds_leave_form", type: "entity", name: "请假单", entityRef: entityLeave, mode: "one",
      pkParam: R("$data.ds_task.item.businessKey"), dependsOn: ["ds_task"], immediate: false,
      access: { roles: ["teacher", "dept_manager", "school_admin"], scope: "deptAndChildren", deptField: "dept_id" },
      semantic: { intent: "依赖 ds_task 的 businessKey。dependsOn 让运行时自动重查，不需要在页面里手写 watch" }
    },
    { id: "ds_peers", type: "entity", name: "同部门近期请假", entityRef: entityLeave, mode: "list", limit: 5,
      select: ["id", "applicant_name", "leave_type", "start_at", "end_at", "status"],
      filter: F("and", EQ(R("$row.dept_id"), R("$data.ds_leave_form.item.dept_id")), IN(R("$row.status"), ["pending", "approved"])),
      dependsOn: ["ds_leave_form"], immediate: false, sort: [{ field: "start_at", direction: "desc" }],
      semantic: { intent: "审批辅助信息：同部门是否已有人同期请假，帮助判断人力冲突" } }
  ],
  state: {
    form: { type: "object", initial: {}, description: "按任务节点可编辑范围渲染的表单模型" },
    comment: { type: "string", initial: "" },
    outcome: { type: "string", initial: "approve" },
    showTransfer: { type: "boolean", initial: false },
    transferTo: { type: "string", initial: null }
  },
  layout: n("x-page", {
    props: { title: "请假审批", loading: R("$data.ds_task.loading"), showBreadcrumb: true, background: "#f5f7fa" },
    children: [
      n("x-row", { props: { gutter: 16 }, children: [
        n("x-col", { props: { span: 16, xs: 24, lg: 16 }, children: [
          n("x-card", { props: { title: "申请内容", bordered: true }, children: [
            n("x-process-form", {
              props: { flowRef, entityRef: entityLeave, model: R("$page.state.form"), labelWidth: "120px", columnsPerRow: 2,
                semantic: { intent: "缺省不传 taskKey：运行时按当前任务的 taskDefinitionKey 匹配 Flow.taskForms，自动套用该节点的 editableFields / requiredFields / readonlyFields" } }
            }),
            n("x-attachment-list", { props: { bizType: "leave_request", bizId: R("$data.ds_leave_form.item.id"), readonly: true, groupByKind: true, previewInline: true } })
          ] }),
          n("x-card", { props: { title: "审批意见", bordered: true }, children: [
            n("x-approval-actions", {
              props: {
                taskId: R("$process.taskId"), flowRef, commentRequired: R("$process.variables.rejectCommentRequired"),
                commentPlaceholder: "请填写审批意见，驳回时必填", allowTransfer: true, allowAddSign: true, allowReturn: true,
                outcomes: [
                  btn("approve", "通过", { actionRef: tref("action", "leave_approve"), params: { taskId: R("$process.taskId"), comment: R("$page.state.comment"), variables: { days: R("$data.ds_leave_form.item.days") } }, visible: R("$process.variables.allowApprove"), order: 1 }),
                  btn("reject", "驳回", { actionRef: tref("action", "leave_reject"), params: { taskId: R("$process.taskId"), comment: R("$page.state.comment") }, danger: true, confirm: L("驳回后申请人需重新提交，确认驳回？"), order: 2 }),
                  btn("return", "退回修改", { actionRef: tref("action", "leave_return"), params: { taskId: R("$process.taskId"), comment: R("$page.state.comment"), returnTo: R("$process.variables.initiatorTaskKey") }, order: 3 }),
                  btn("transfer", "转办", { visible: EQ(R("$page.state.outcome"), L("transfer")), order: 4 })
                ],
                reasonTemplates: [
                  { value: "proof_missing", label: "佐证材料不全，请补齐后重新提交" },
                  { value: "work_conflict", label: "同期已有他人请假，请调整时间" },
                  { value: "approve_ok", label: "情况属实，同意" }
                ]
              },
              handlers: {
                submit: act("leave_approve", { taskId: R("$process.taskId"), comment: R("$page.state.comment") }),
                transfer: inline([st({ type: "assign", target: "state.showTransfer", value: L(true) })])
              }
            })
          ] })
        ] }),
        n("x-col", { props: { span: 8, xs: 24, lg: 8 }, children: [
          n("x-card", { props: { title: "请假人信息", bordered: true }, children: [
            n("x-descriptions", { props: { entityRef: entityLeave, dataSourceId: "ds_leave_form", column: 1, border: false,
              fieldList: ["applicant_id", "dept_id", "leave_type", "urgency", "days"] } })
          ] }),
          n("x-card", { props: { title: "审批流转", bordered: true, collapsible: true }, children: [
            n("x-approval-timeline", { props: { processInstanceId: R("$process.processInstanceId"), flowRef, showComment: true, showAssignee: true, order: "asc" } })
          ] }),
          n("x-card", { props: { title: "同部门同期请假", bordered: true }, children: [
            n("x-table", { props: { entityRef: entityLeave, dataSourceId: "ds_peers", selection: "none", size: "small", columnList: [
              col("applicant_name", { label: "申请人" }),
              col("leave_type", { label: "假别", widget: "x-enum-text", enumRef: enumRef("leave_type") }),
              col("start_at", { label: "开始", format: "YYYY-MM-DD" }),
              col("end_at", { label: "结束", format: "YYYY-MM-DD" })
            ] } })
          ] })
        ] })
      ] })
    ]
  }),
  dialogs: {
    dlg_transfer: n("x-dialog", {
      props: { model: R("$page.state.showTransfer"), title: "转办", mode: "dialog", width: "520px" },
      children: [n("x-form-item", { props: { label: "转办给", required: true }, children: [
        n("x-employee-picker", { props: { model: R("$page.state.transferTo"), multiple: false, searchable: true } })
      ] })],
      handlers: { confirm: act("leave_transfer", { taskId: R("$process.taskId"), toUserId: R("$page.state.transferTo"), comment: R("$page.state.comment") }) }
    })
  },
  handlers: {
    onLoad: inline([
      st({ type: "assign", target: "state.form", value: R("$data.ds_leave_form.item") }),
      st({ type: "log", level: "info", message: F("concat", L("进入审批节点 "), R("$process.taskKey")) })
    ]),
    onParamsChange: inline([st({ type: "emit", event: "ds:ds_task:refresh" })])
  },
  access: { roles: ["teacher", "dept_manager", "school_admin"], scope: "deptAndChildren", deptField: "dept_id", denyWhen: F("eq", R("$process.variables.initiator"), R("$user.id")) },
  origin: { generator: "template", templateId: "tpl_approval_v1", templateVersion: 2, params: { flow: "leave_approval", layout: "left-form-right-context" }, generatedAt: "2026-10-16T09:12:00+08:00" },
  semantic: { intent: "通用审批办理页：左侧单据与意见、右侧上下文与流转记录", businessDomain: "审批中心", synonyms: ["审批页", "办理页"], aiHint: { generate: "page", constraints: ["审批按钮必须走 CompleteTaskStep", "可编辑字段由 Flow.taskForms 决定，页面不得再声明一遍"], confidence: 0.9 } }
};
uiSchemas.push(leaveApproval);

// ============================================================ 逻辑编排
actions.push(
  {
    id: uid(), key: "leave_open_create", name: "打开创建页", trigger: "manual",
    description: "列表页「新建请假」入口",
    params: [],
    steps: [
      st({ type: "openDialog", dialogKey: "dlg_leave_quick", mode: "dialog", await: false,
        note: "快速申请走弹窗；需要上传佐证时切到完整表单页，两条路径共用 leave_submit 动作" }),
      st({ type: "assign", target: "state.quickVisible", value: L(true) })
    ],
    semantic: { intent: "轻量入口：不离开列表页即可发起申请" }
  },
  {
    id: uid(), key: "leave_open_edit", name: "打开编辑页", trigger: "manual",
    params: [{ key: "id", label: "请假单 ID", type: "string", required: true }],
    steps: [
      st({ type: "navigate", pageRef: pageRefForm, params: { id: R("$ctx.params.id") }, note: "按 pageRef 跳转，路由变化时无需改动作" })
    ]
  },
  {
    id: uid(), key: "leave_submit", name: "提交请假申请", trigger: "onSubmit",
    description: "创建型表单主链路：取节假日 → 服务端算工作日 → 校验 → 草稿/提交分支 → 事务落库 → 发起流程 → 反馈",
    params: [
      { key: "form", label: "表单数据", type: "json", required: true },
      { key: "editId", label: "编辑态下的单据 ID", type: "string", required: false },
      { key: "asDraft", label: "仅存草稿", type: "boolean", defaultValue: false }
    ],
    when: F("ne", R("$ctx.params.form"), L(null)),
    steps: [
      st({ type: "assign", target: "state.submitting", value: L(true) }),
      st({ label: "取法定节假日日历", type: "apiCall", apiRef: { kind: "api", key: "api_holiday_list", version: 1 },
        params: { year: F("year", R("$now")) }, assignTo: "vars.holidays", retry: { maxAttempts: 2, backoff: "linear" } }),
      st({ label: "计算工作日天数", type: "code", lang: "ts", runtime: "server", entry: "calcWorkdays", timeoutMs: 2000,
        sandbox: { network: false, storage: false, dom: false, allowEval: false, memoryLimitMb: 32 },
        inputs: [
          { key: "start", type: "datetime", value: R("$form.start_at") },
          { key: "end", type: "datetime", value: R("$form.end_at") },
          { key: "holidays", type: "array", value: R("$ctx.vars.holidays") },
          { key: "leaveType", type: "string", value: R("$form.leave_type") }
        ],
        outputs: [{ key: "days", type: "decimal" }, { key: "skipped", type: "array" }, { key: "warnings", type: "array" }],
        assignTo: "vars.workdays",
        source: "export default function calcWorkdays(input) {\n  const { start, end, holidays = [], leaveType } = input;\n  if (!start || !end) return { days: 0, skipped: [], warnings: [\"时间未填完整\"] };\n  const holidaySet = new Set((holidays || []).map(h => typeof h === \"string\" ? h : h.date));\n  const oneDay = 86400000;\n  const from = new Date(start); const to = new Date(end);\n  if (to < from) return { days: 0, skipped: [], warnings: [\"结束时间早于开始时间\"] };\n  let days = 0; const skipped = [];\n  for (let t = from.getTime(); t <= to.getTime(); t += oneDay) {\n    const d = new Date(t); const iso = d.toISOString().slice(0, 10);\n    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;\n    if (holidaySet.has(iso)) { skipped.push(iso); continue; }\n    if (weekend) { skipped.push(iso); continue; }\n    days += 1;\n  }\n  const warnings = [];\n  if (leaveType === \"annual\" && days > 15) warnings.push(\"年假超过 15 天需院长审批\");\n  return { days, skipped, warnings };\n}\n",
        note: "工作日计算含法定节假日与调休，纯算法不适合用表达式堆砌，这里用受限 TS 解决；出码时同一段源码原样落到 BFF 模块" }),
      st({ type: "assign", target: "state.daysComputed", value: R("$ctx.vars.workdays.days") }),
      st({ label: "写回表单天数", type: "assign", target: "form.days", value: R("$ctx.vars.workdays.days") }),
      st({ label: "必填与业务校验", type: "validate", scope: "form", server: true, fields: ["applicant_id", "dept_id", "leave_type", "start_at", "end_at", "reason"], message: L("请完善带 * 的必填项") }),
      st({ label: "时间倒挂校验", type: "fail", when: F("lte", R("$ctx.vars.workdays.days"), L(0)), rollback: true,
        level: "error", code: "LEAVE_DURATION_INVALID", fields: ["end_at"], message: L("结束时间必须晚于开始时间") }),
      st({ label: "单个假期上限", type: "fail", when: F("gt", R("$ctx.vars.workdays.days"), L(90)), code: "LEAVE_TOO_LONG", fields: ["end_at"], message: L("单次请假不得超过 90 个工作日，请联系人事处理") }),
      st({ label: "超长预警", type: "emit", when: F("isNotEmpty", R("$ctx.vars.workdays.warnings")), event: "ui.toast",
        payload: { type: "warning", message: F("join", R("$ctx.vars.workdays.warnings"), L("；")) }, sync: true }),
      st({ label: "分支：草稿 or 提交", type: "branch",
        cases: [{ name: "draft", when: R("$ctx.params.asDraft"), then: [
          st({ type: "assign", target: "form.status", value: L("draft") }),
          st({ type: "log", level: "info", message: L("保存草稿，不发起流程") })
        ] }],
        else: [st({ type: "assign", target: "form.status", value: L("pending") })] }),
      st({ label: "落库与附件登记（事务）", type: "transaction", isolation: "readCommitted", readOnly: false, steps: [
        st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_save", version: 1 }, params: { entity: "leave_request", data: R("$form"), id: R("$ctx.params.editId") }, assignTo: "vars.saved" }),
        st({ label: "附件登记 / 签名图上传", type: "upload", provider: "oss", assignTo: "vars.attachments", registerEntity: { kind: "entity", key: "attachment", version: 1 },
          accept: ["jpg", "jpeg", "png", "webp", "mp4", "mov", "pdf", "doc", "docx", "xls", "xlsx"], maxSize: 104857600, maxCount: 12, multiple: true, autoUpload: false,
          pathTemplate: "{tenant}/{app}/leave/attachments/{yyyy}/{MM}/{ulid}.{ext}",
          note: "客户端已直传 OSS，这一步只做 attachment 登记 + 手写签名图补传；与单据落库同事务，失败一起回滚，避免无主附件" })
      ] }),
      st({ label: "发起审批流", type: "startFlow", when: F("not", R("$ctx.params.asDraft")), flowRef,
        businessKey: R("$ctx.vars.saved.id"), assignTo: "vars.processInstanceId", notify: "已提交，等待审批", checkDuplicate: true,
        variables: {
          applicantId: R("$form.applicant_id"), applicantName: R("$form.applicant_name"), deptId: R("$form.dept_id"),
          leaveType: R("$form.leave_type"), urgency: R("$form.urgency"), days: R("$ctx.vars.workdays.days"),
          startAt: R("$form.start_at"), endAt: R("$form.end_at"), needProof: F("and", EQ(R("$form.leave_type"), L("sick")), F("gte", R("$ctx.vars.workdays.days"), L(3)))
        } }),
      st({ type: "emit", event: "ui.toast", payload: { type: "success", message: L("提交成功") } }),
      st({ type: "emit", event: "ds:ds_leave_page:refresh" }),
      st({ type: "navigate", pageRef: pageRefList, note: "回到列表；草稿态则停留并提示已保存" }),
      st({ type: "assign", target: "state.submitting", value: L(false) })
    ],
    transaction: true, idempotent: true, timeoutMs: 30000,
    access: { roles: ["student", "teacher", "dept_manager"], scope: "self", ownerField: "applicant_id" },
    semantic: { intent: "创建/编辑请假单并（可选）发起审批流", businessDomain: "人事考勤", synonyms: ["提交请假", "发起请假"], aiHint: { generate: "flow", constraints: ["先算天数再校验", "附件登记与单据落库同事务"], confidence: 0.9 } }
  }
);

actions.push(
  {
    id: uid(), key: "leave_approve", name: "审批通过", trigger: "onApprove",
    params: [
      { key: "taskId", label: "任务 ID", type: "string", required: true },
      { key: "comment", label: "审批意见", type: "string", required: false },
      { key: "variables", label: "回写流程变量", type: "json", required: false }
    ],
    steps: [
      st({ type: "completeTask", taskId: R("$ctx.params.taskId"), outcome: "approve", comment: R("$ctx.params.comment"),
        variables: R("$ctx.params.variables"), commentRequired: false,
        afterComplete: [st({ type: "emit", event: "ui.toast", payload: { type: "success", message: L("已通过") } })] }),
      st({ type: "emit", event: "ds:ds_task:refresh" }),
      st({ type: "navigate", pageRef: pageRefApproval, note: "办理完留在审批列表，待办数据源随流程推进自动刷新" })
    ],
    idempotent: true,
    access: { roles: ["teacher", "dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "审批通过：写回结论并推进流程", businessDomain: "审批中心", synonyms: ["同意", "通过"], aiHint: { generate: "flow", confidence: 0.95 } }
  },
  {
    id: uid(), key: "leave_reject", name: "审批驳回", trigger: "onReject",
    params: [
      { key: "taskId", label: "任务 ID", type: "string", required: true },
      { key: "comment", label: "驳回原因", type: "string", required: true }
    ],
    steps: [
      st({ label: "驳回原因必填", type: "fail", when: F("isEmpty", R("$ctx.params.comment")), level: "error", code: "LEAVE_REJECT_REASON_REQUIRED",
        fields: ["comment"], message: L("驳回必须填写原因，便于申请人修改后重新提交") }),
      st({ type: "completeTask", taskId: R("$ctx.params.taskId"), outcome: "reject", comment: R("$ctx.params.comment"), commentRequired: true,
        nextAssignee: { type: "initiator" } }),
      st({ type: "emit", event: "ui.toast", payload: { type: "warning", message: L("已驳回") } }),
      st({ type: "navigate", pageRef: pageRefApproval })
    ],
    access: { roles: ["teacher", "dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "驳回并回到申请人，流程实例结束", synonyms: ["不同意", "不通过"] }
  },
  {
    id: uid(), key: "leave_return", name: "退回修改", trigger: "manual",
    params: [
      { key: "taskId", label: "任务 ID", type: "string", required: true },
      { key: "comment", label: "退回说明", type: "string", required: true },
      { key: "returnTo", label: "退回节点", type: "string", required: false }
    ],
    steps: [
      st({ type: "fail", when: F("isEmpty", R("$ctx.params.comment")), code: "LEAVE_RETURN_REASON_REQUIRED", fields: ["comment"], message: L("退回必须说明修改要求") }),
      st({ type: "completeTask", taskId: R("$ctx.params.taskId"), outcome: "return", comment: R("$ctx.params.comment"),
        variables: { returnTo: R("$ctx.params.returnTo") },
        note: "退回不结束流程：实例回到申请人节点，申请人改完可重新提交，审批链保留上下文" }),
      st({ type: "emit", event: "ui.toast", payload: { type: "info", message: L("已退回申请人修改") } })
    ],
    access: { roles: ["teacher", "dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "退回修改，与驳回的区别是流程实例不结束" }
  },
  {
    id: uid(), key: "leave_transfer", name: "转办", trigger: "manual",
    params: [
      { key: "taskId", label: "任务 ID", type: "string", required: true },
      { key: "toUserId", label: "转办给", type: "string", required: true },
      { key: "comment", label: "转办说明", type: "string", required: false }
    ],
    steps: [
      st({ type: "fail", when: F("isEmpty", R("$ctx.params.toUserId")), code: "LEAVE_TRANSFER_TARGET_REQUIRED", fields: ["toUserId"], message: L("请选择转办对象") }),
      st({ type: "fail", when: EQ(R("$ctx.params.toUserId"), R("$user.id")), code: "LEAVE_TRANSFER_TO_SELF", fields: ["toUserId"], message: L("不能转办给自己") }),
      st({ type: "completeTask", taskId: R("$ctx.params.taskId"), outcome: "transfer", comment: R("$ctx.params.comment"),
        nextAssignee: { type: "expression", expr: R("$ctx.params.toUserId") } }),
      st({ type: "emit", event: "ui.toast", payload: { type: "success", message: L("已转办") } })
    ],
    access: { roles: ["dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "转办给他人办理，当前人退出该任务" }
  },
  {
    id: uid(), key: "leave_recall", name: "撤回申请", trigger: "manual",
    params: [{ key: "id", label: "请假单 ID", type: "string", required: true }],
    steps: [
      st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_get", version: 1 }, params: { id: R("$ctx.params.id") }, assignTo: "vars.leave" }),
      st({ label: "仅本人可撤回", type: "fail", when: F("ne", R("$ctx.vars.leave.applicant_id"), R("$user.id")), level: "fatal", code: "LEAVE_RECALL_FORBIDDEN",
        message: L("只能撤回自己提交的申请") }),
      st({ label: "仅审批中可撤回", type: "fail", when: F("ne", R("$ctx.vars.leave.status"), L("pending")), code: "LEAVE_RECALL_STATE_INVALID",
        message: L("当前状态不可撤回，请刷新后重试") }),
      st({ type: "confirm", title: "撤回确认", message: L("撤回将终止当前审批流程，确认撤回？"), danger: true, reasonRequired: false,
        onConfirm: [
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_process_terminate", version: 1 }, params: { processInstanceId: R("$ctx.vars.leave.process_instance_id") }, assignTo: "vars.terminated" }),
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_patch_status", version: 1 }, params: { id: R("$ctx.params.id"), status: "cancelled" }, assignTo: "vars.patched" }),
          st({ type: "emit", event: "ds:ds_leave_page:refresh" }),
          st({ type: "emit", event: "ui.toast", payload: { type: "success", message: L("已撤回") } })
        ],
        onCancel: [st({ type: "log", level: "debug", message: L("用户取消撤回") })] }),
      st({ type: "log", level: "info", message: L("撤回完成"), data: { leaveId: R("$ctx.params.id") } })
    ],
    transaction: false, idempotent: true,
    access: { roles: ["student", "teacher", "dept_manager"], scope: "self", ownerField: "applicant_id" },
    semantic: { intent: "撤回自己审批中的申请", synonyms: ["撤销", "取消申请"] }
  },
  {
    id: uid(), key: "leave_batch_recall", name: "批量撤回", trigger: "manual",
    params: [{ key: "ids", label: "请假单 ID 列表", type: "array", required: true }],
    steps: [
      st({ type: "fail", when: F("isEmpty", R("$ctx.params.ids")), code: "LEAVE_BATCH_EMPTY", message: L("请先勾选需要撤回的申请") }),
      st({ type: "confirm", message: { $tpl: ["将撤回 ", F("size", R("$ctx.params.ids")), " 条申请，确认继续？"] }, danger: true,
        onConfirm: [
          st({ type: "parallel", failFast: false, timeoutMs: 60000, branches: [
            { name: "recall", steps: [
              st({ type: "loop", over: R("$ctx.params.ids"), itemName: "leaveId", indexName: "i", concurrency: 3, maxIterations: 200,
                collect: "vars.results", breakWhen: F("gt", R("$ctx.vars.failCount"), L(20)),
                steps: [
                  st({ type: "callAction", actionRef: { kind: "action", key: "leave_recall", version: 1 }, params: { id: R("$ctx.vars.leaveId") } }),
                  st({ type: "log", level: "info", message: { $tpl: ["已撤回 ", R("$ctx.vars.leaveId")] } })
                ] })
            ] },
            { name: "report", steps: [
              st({ type: "delay", ms: 500, note: "等主分支累积结果后再汇总；演示并行分支的时序配合" })
            ] }
          ] }),
          st({ type: "print", mode: "exportPdf", templateRef: { kind: "asset", key: "tpl_batch_recall", version: 1 },
            data: { results: R("$ctx.vars.results"), operator: R("$user.name") }, assignTo: "vars.report" })
        ] }),
      st({ type: "emit", event: "ds:ds_leave_page:refresh" })
    ],
    timeoutMs: 120000,
    access: { roles: ["dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "批量撤回，演示并行 + 循环 + 收集结果的组合", aiHint: { generate: "flow", constraints: ["循环体内不得有嵌套事务"] } }
  },
  {
    id: uid(), key: "leave_export_list", name: "导出请假明细", trigger: "manual",
    params: [{ key: "query", label: "查询条件", type: "json", required: false }],
    steps: [
      st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_export", version: 1 }, params: { query: R("$ctx.params.query"), format: "xlsx" }, assignTo: "vars.file" }),
      st({ type: "download", url: R("$ctx.vars.file.url"), fileName: F("concat", L("请假明细_"), R("$now"), L(".xlsx")) }),
      st({ type: "log", level: "info", message: L("导出完成") })
    ],
    access: { roles: ["dept_manager", "school_admin"], scope: "deptAndChildren" },
    semantic: { intent: "按当前筛选条件导出，导出动作本身要二次鉴权（数据权限相同）" }
  },
  {
    id: uid(), key: "leave_on_process_end", name: "流程结束回调", trigger: "onWebhook",
    description: "FlowListener(processEnded) 的目标动作：把流程结论写回业务表并通知申请人",
    params: [{ key: "processInstanceId", label: "流程实例", type: "string", required: true }, { key: "outcome", label: "结论", type: "string", required: true }],
    steps: [
      st({ type: "branch", cases: [
        { name: "approved", when: EQ(R("$ctx.params.outcome"), L("approved")), then: [
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_patch_status", version: 1 },
            params: { processInstanceId: R("$ctx.params.processInstanceId"), status: "approved", approved_at: R("$now") }, assignTo: "vars.patched" }),
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_notify_send", version: 1 },
            params: { template: "leave_approved", bizId: R("$ctx.params.processInstanceId") }, assignTo: "vars.notified" })
        ] },
        { name: "rejected", when: EQ(R("$ctx.params.outcome"), L("rejected")), then: [
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_patch_status", version: 1 },
            params: { processInstanceId: R("$ctx.params.processInstanceId"), status: "rejected" }, assignTo: "vars.patched" }),
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_notify_send", version: 1 },
            params: { template: "leave_rejected", bizId: R("$ctx.params.processInstanceId") }, assignTo: "vars.notified" })
        ] }
      ], else: [st({ type: "log", level: "warn", message: L("流程结束但结论未知，需人工核对") })] }),
      st({ type: "emit", event: "ds:ds_leave_page:refresh" })
    ],
    idempotent: true,
    semantic: { intent: "状态迁移的唯一入口：页面不得直接改 status，只能由流程监听器写入" }
  },
  {
    id: uid(), key: "leave_notify_task_arrived", name: "待办到达通知", trigger: "onWebhook",
    params: [
      { key: "taskId", label: "任务 ID", type: "string", required: true },
      { key: "assignee", label: "办理人", type: "string", required: true },
      { key: "urgency", label: "紧急度", type: "string", required: false, defaultValue: "normal" }
    ],
    steps: [
      st({ type: "branch", cases: [
        { name: "urgent", when: F("in", R("$ctx.params.urgency"), L(["high", "urgent"])), then: [
          st({ type: "apiCall", apiRef: { kind: "api", key: "api_notify_send", version: 1 }, params: { template: "todo_urgent_sms", to: R("$ctx.params.assignee"), taskId: R("$ctx.params.taskId") }, assignTo: "vars.sent" })
        ] }
      ], else: [
        st({ type: "apiCall", apiRef: { kind: "api", key: "api_notify_send", version: 1 }, params: { template: "todo_arrived", to: R("$ctx.params.assignee"), taskId: R("$ctx.params.taskId") }, assignTo: "vars.sent" })
      ] }),
      st({ type: "emit", event: "ds:ds_todo:refresh" })
    ],
    access: { roles: ["system"] },
    semantic: { intent: "流程监听器异步触发；特急单据走短信，其余走站内信" }
  },
  {
    id: uid(), key: "leave_cleanup_stale", name: "超期单据清理", trigger: "onSchedule",
    description: "每日 02:00 扫描：草稿超过 30 天自动作废，审批中超过 30 天未流转提醒办理人",
    steps: [
      st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_find_stale", version: 1 }, params: { idleDays: 30 }, assignTo: "vars.stale" }),
      st({ type: "loop", over: R("$ctx.vars.stale.rows"), itemName: "row", concurrency: 5, maxIterations: 5000,
        onError: [st({ type: "log", level: "error", message: L("单条处理失败，继续下一条") })], continueOnError: true,
        steps: [
          st({ type: "branch", cases: [
            { name: "draft", when: EQ(R("$ctx.vars.row.status"), L("draft")), then: [
              st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_patch_status", version: 1 }, params: { id: R("$ctx.vars.row.id"), status: "cancelled" }, assignTo: "vars.patched" })
            ] },
            { name: "pending", when: EQ(R("$ctx.vars.row.status"), L("pending")), then: [
              st({ type: "apiCall", apiRef: { kind: "api", key: "api_notify_send", version: 1 }, params: { template: "todo_overdue", to: R("$ctx.vars.row.approver_id") }, assignTo: "vars.sent" })
            ] }
          ] })
        ] }),
      st({ type: "log", level: "info", message: L("超期清理完成"), data: { scanned: R("$ctx.vars.stale.total") } })
    ],
    idempotent: true, timeoutMs: 600000,
    access: { roles: ["system"] },
    semantic: { intent: "定时任务型动作，演示 onSchedule 触发器与大批量循环", aiHint: { generate: "rule", constraints: ["必须幂等，可重复执行"], confidence: 0.8 } }
  }
);

// ============================================================ 补：详情抽屉动作（列表 rowClick 引用）
actions.push(
  {
    id: uid(), key: "leave_open_detail", name: "打开详情抽屉", trigger: "manual",
    description: "列表行点击。先写 detailId 再开抽屉，随后刷新详情数据源 —— 顺序不可颠倒，ds_leave_one 的 pkParam 依赖 state.detailId",
    params: [{ key: "id", label: "请假单 ID", type: "string", required: true }],
    steps: [
      st({ type: "assign", target: "state.detailId", value: R("$ctx.params.id") }),
      st({ type: "assign", target: "state.detailVisible", value: L(true) }),
      st({ type: "emit", event: "ds:ds_leave_one:refresh", note: "依赖已就绪，此处主动重查；页面亦可只依赖 ds_leave_one.dependsOn 自动重查" })
    ],
    idempotent: true, timeoutMs: 10000,
    semantic: { intent: "列表行点开详情抽屉（只读）", businessDomain: "人事考勤", aiHint: { generate: "detail", confidence: 0.9 } }
  }
);

// ============================================================ API 声明
// 约定：业务 Action 不直连数据库，一律经 Api 声明；泛化 CRUD 走 BFF 元数据驱动通道。
apis.push(
  {
    id: uid(), key: "api_leave_save", name: "保存请假单（泛化 upsert）", kind: "internal", method: "POST",
    path: "/bff/entity/{entity}/save", idempotent: true, timeoutMs: 15000,
    description: "元数据驱动写通道：BFF 依据 DataSchema 校验字段类型/必填/枚举，注入 tenant_id 与审计列后落库。id 为空=新增，有值=更新。",
    request: {
      path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
      body: {
        contentType: "application/json",
        schema: {
          description: "泛化写载荷。字段键必须在 DataSchema 中声明，未知键默认拒绝（strict 策略）",
          type: "object",
          required: ["entity", "data"],
          properties: {
            entity: { type: "string", description: "实体 key，必须与 path 参数一致" },
            id: { type: "string", description: "主键 ULID；缺省=新增" },
            data: { type: "object", description: "字段键值对" },
            expectedVersion: { type: "integer", description: "乐观锁版本号，不匹配返回 409" }
          }
        }
      }
    },
    response: {
      schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, updatedAt: { type: "string" } } }, message: { type: "string" } } },
      successWhen: F("eq", R("$res.body.code"), L(0)),
      mapping: { id: "$.data.id", version: "$.data.version" },
      errorPath: "$.error", errorMessagePath: "$.message"
    },
    retry: { maxAttempts: 3, backoff: "exponential", retryOn: [502, 503, 504] },
    access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id" },
    tags: ["crud", "generic", "write"],
    semantic: { intent: "所有实体的统一写入通道", aiHint: { generate: "api", constraints: ["写接口必须幂等声明", "禁止绕过此通道直接写库"], confidence: 0.95 } }
  },
  {
    id: uid(), key: "api_leave_get", name: "读取请假单", kind: "internal", method: "GET",
    path: "/bff/entity/{entity}/get", idempotent: true, timeoutMs: 8000,
    description: "按主键读取单条。BFF 同时应用行级数据权限（Access.scope）与字段脱敏（Access.fieldPolicy）。",
    request: {
      path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
      query: [
        { key: "id", label: "主键", type: "string", required: true, source: R("$ctx.params.id") },
        { key: "with", label: "附带关联", type: "string", description: "逗号分隔的关联名，如 applicant,dept" }
      ]
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", description: "实体字段键值对，含 created_at / updated_at / created_by 等审计列" } } },
      successWhen: F("eq", R("$res.body.code"), L(0)), mapping: { item: "$.data" }, errorMessagePath: "$.message" },
    cache: { enabled: true, ttl: 15, keyExpr: F("concat", L("leave:get:"), R("$ctx.params.id"), L(":"), R("$user.id")) },
    access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id", fieldPolicy: { id_card: "masked" } },
    tags: ["crud", "generic", "read"],
    semantic: { intent: "实体单条读取的泛化通道" }
  },
  {
    id: uid(), key: "api_leave_delete", name: "删除请假单", kind: "internal", method: "DELETE",
    path: "/bff/entity/{entity}/delete", idempotent: true, timeoutMs: 8000,
    description: "软删除（DataSchema.Entity.softDelete 为 true 时置 deleted_at）。仅在草稿/已撤回状态允许，其余状态由 Rule 拒绝。",
    request: {
      path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
      query: [{ key: "id", label: "主键", type: "string", required: true }, { key: "hard", label: "物理删除", type: "boolean", defaultValue: false }]
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { deleted: { type: "integer" } } } } }, successWhen: F("eq", R("$res.body.code"), L(0)) },
    access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id" },
    tags: ["crud", "generic", "write"],
    semantic: { intent: "实体删除的泛化通道（默认软删）" }
  },
  {
    id: uid(), key: "api_leave_patch_status", name: "改写单据状态", kind: "internal", method: "PATCH",
    path: "/bff/entity/{entity}/patch", idempotent: true, timeoutMs: 8000,
    description: "平台唯一的状态迁移通道：BFF 校验状态机合法迁移、写状态日志后落库。页面与自定义代码均不得直改 status 字段。",
    request: {
      path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
      body: {
        contentType: "application/json",
        schema: {
          type: "object", required: ["id", "patch"], description: "受控局部更新；当前仅放行 status 与 current_task",
          properties: {
            id: { type: "string" }, patch: { type: "object", properties: { status: { type: "string" }, currentTask: { type: "string" } } },
            reason: { type: "string", description: "迁移原因，写入状态日志" }, expectedVersion: { type: "integer" }
          }
        }
      }
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, version: { type: "integer" } } } } }, successWhen: F("eq", R("$res.body.code"), L(0)) },
    access: { roles: ["system", "dept_manager", "school_admin"], scope: "all" },
    tags: ["crud", "state-machine", "write"],
    semantic: { intent: "状态迁移唯一入口", aiHint: { constraints: ["禁止在任何页面或自定义 TS 中直接赋值 status 字段"], confidence: 0.95 } }
  },
  {
    id: uid(), key: "api_leave_find_stale", name: "查询超期单据", kind: "internal", method: "POST",
    path: "/bff/entity/{entity}/findStale", idempotent: true, timeoutMs: 60000,
    description: "定时任务专用：返回超过 idleDays 未流转的单据，含等待中的办理人。分页游标由服务端内部循环消费。",
    request: {
      path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
      body: { contentType: "application/json", schema: { type: "object", properties: { idleDays: { type: "integer", defaultValue: 30 }, statuses: { type: "array", items: { type: "string" } }, limit: { type: "integer", defaultValue: 5000 } } } }
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { rows: { type: "array" }, total: { type: "integer" } } } } },
      successWhen: F("eq", R("$res.body.code"), L(0)), rowsPath: "$.data.rows", totalPath: "$.data.total" },
    access: { roles: ["system"], scope: "all" },
    tags: ["batch", "read"],
    semantic: { intent: "批量运维扫描，仅系统角色可调用" }
  },
  {
    id: uid(), key: "api_leave_export", name: "导出请假单 Excel", kind: "internal", method: "POST",
    path: "/bff/export/excel", idempotent: false, timeoutMs: 120000,
    description: "按当前查询条件导出。服务端流式生成 xlsx 并回传下载令牌，前端据此触发浏览器下载（不经过 OSS 中转）。",
    request: {
      body: {
        contentType: "application/json",
        schema: {
          type: "object", required: ["entity"], properties: {
            entity: { type: "string", defaultValue: "leave_request" }, title: { type: "string" },
            query: { type: "object", description: "与 $page.state.query 同构的过滤条件" },
            columns: { type: "array", items: { type: "object" }, description: "列定义：{ field, label, format }" },
            sorts: { type: "array", items: { type: "object" } }, limit: { type: "integer", defaultValue: 50000 }
          }
        }
      }
    },
    response: { schema: { type: "object", description: "二进制流场景：schema 描述的是响应头里的下载令牌", properties: { code: { type: "integer" }, data: { type: "object", properties: { downloadUrl: { type: "string" }, fileName: { type: "string" }, expiresIn: { type: "integer" } } } } },
      successWhen: F("eq", R("$res.body.code"), L(0)), errorMessagePath: "$.message" },
    tags: ["export", "file"],
    semantic: { intent: "列表导出为办公文档", aiHint: { constraints: ["导出列定义必须复用页面的 columnList，不得另写一套"], confidence: 0.85 } }
  },
  {
    id: uid(), key: "api_holiday_list", name: "法定节假日日历", kind: "rest", method: "GET",
    path: "/holiday/{year}", baseUrl: "https://open.example.gov.cn", timeoutMs: 5000,
    description: "外部开放接口：返回指定年份的节假日与调休安排。带本地缓存与降级（失败时返回空数组，工作日算法退化为仅排除周末）。",
    request: { path: [{ key: "year", label: "年份", type: "integer", required: true }], headers: [{ name: "Accept", type: "string", defaultValue: "application/json" }] },
    response: { schema: { type: "object", properties: { data: { type: "array", items: { type: "object", properties: { date: { type: "string" }, name: { type: "string" }, type: { type: "string", enum: ["holiday", "workday"] } } } } } },
      successWhen: F("eq", R("$res.status"), L(200)), rowsPath: "$.data" },
    auth: { type: "apiKey", name: "X-Api-Key", in: "header", valueRef: "secret:gov_open_api_key" },
    cache: { enabled: true, ttl: 86400, keyExpr: F("concat", L("holiday:"), R("$ctx.params.year")) },
    retry: { maxAttempts: 2, backoff: "linear", retryOn: [502, 503, 504] },
    tags: ["external", "read"],
    semantic: { intent: "第三方日历服务，作为工作日计算的输入", aiHint: { constraints: ["外部依赖必须有超时、重试与降级路径"], confidence: 0.9 } }
  },
  {
    id: uid(), key: "api_oss_sts", name: "获取 OSS STS 临时凭证", kind: "internal", method: "POST",
    path: "/bff/oss/sts", idempotent: true, timeoutMs: 5000,
    description: "客户端直传的凭证颁发入口。BFF 依据当前用户与业务类型生成最小权限、限目录、限时的 STS 凭证，前端据此直传 OSS，不经服务端中转。",
    request: {
      body: {
        contentType: "application/json",
        schema: {
          type: "object", required: ["bizType"], properties: {
            bizType: { type: "string", description: "业务类型，决定路径模板与文件策略" },
            bizId: { type: "string", description: "业务主键，缺省时用会话态临时目录" },
            fileName: { type: "string" }, fileSize: { type: "integer" }, contentType: { type: "string" },
            count: { type: "integer", defaultValue: 1 }
          }
        }
      }
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { accessKeyId: { type: "string" }, accessKeySecret: { type: "string" }, securityToken: { type: "string" }, expiration: { type: "string" }, region: { type: "string" }, bucket: { type: "string" }, endpoint: { type: "string" }, dir: { type: "string" }, objectKeys: { type: "array", items: { type: "string" } } } } } },
      successWhen: F("eq", R("$res.body.code"), L(0)) },
    cache: { enabled: true, ttl: 600, keyExpr: F("concat", L("sts:"), R("$user.id"), L(":"), R("$ctx.params.bizType")) },
    access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "self" },
    tags: ["oss", "upload", "sts"],
    semantic: { intent: "客户端直传凭证颁发；安全边界在服务端计算目录前缀与权限", aiHint: { constraints: ["STS 有效期不得超过 15 分钟", "目录前缀必须含 tenantId 与 userId"], confidence: 0.95 } }
  },
  {
    id: uid(), key: "api_notify_send", name: "发送消息通知", kind: "internal", method: "POST",
    path: "/bff/message/send", idempotent: false, timeoutMs: 8000,
    description: "统一通知出口：站内信/邮件/短信按渠道配置分发。模板由模板市场提供，不接受调用方拼正文。",
    request: {
      body: {
        contentType: "application/json",
        schema: {
          type: "object", required: ["template", "to"], properties: {
            template: { type: "string", description: "模板 key，如 task_arrived / todo_overdue" },
            to: { type: "string", description: "用户 ID 或接收地址；用户 ID 时由服务端解析其偏好渠道" },
            channels: { type: "array", items: { type: "string", enum: ["inbox", "email", "sms", "wechat"] } },
            params: { type: "object", description: "模板变量" }, bizRef: { type: "object", description: "关联业务对象，用于消息中心跳转" }
          }
        }
      }
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { messageId: { type: "string" }, channels: { type: "array" } } } } }, successWhen: F("eq", R("$res.body.code"), L(0)) },
    retry: { maxAttempts: 2, backoff: "linear", retryOn: [503] },
    access: { roles: ["system", "dept_manager", "school_admin"], scope: "all" },
    tags: ["message", "notification"],
    semantic: { intent: "消息统一出口，屏蔽渠道差异" }
  },
  {
    id: uid(), key: "api_process_terminate", name: "终止流程实例", kind: "internal", method: "POST",
    path: "/bff/flow/processes/{processInstanceId}/terminate", idempotent: true, timeoutMs: 10000,
    description: "撤回/作废场景：终止 Flowable 流程实例并清理待办任务。terminate 后必须由 FlowListener 回调业务动作同步单据状态，流程侧不直接改业务表。",
    request: {
      path: [{ key: "processInstanceId", label: "流程实例 ID", type: "string", required: true }],
      body: { contentType: "application/json", schema: { type: "object", properties: { reason: { type: "string" }, deleteHistory: { type: "boolean", defaultValue: false } } } }
    },
    response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { terminated: { type: "boolean" }, processInstanceId: { type: "string" } } } } }, successWhen: F("eq", R("$res.body.code"), L(0)) },
    access: { roles: ["teacher", "dept_manager", "school_admin", "system"], scope: "self", ownerField: "applicant_id" },
    tags: ["flow", "write"],
    semantic: { intent: "流程侧唯一终止入口", aiHint: { constraints: ["终止后必须由监听器回写业务状态，禁止双写"], confidence: 0.9 } }
  }
);

// ============================================================ BPMN 资产引用（内容在文末 assets 中）
const bpmnAssetRef = {
  assetId: "01J8ZQ4K2M00000000000000B1", key: "leave_approval_bpmn", kind: "bpmn", version: 1,
  fileName: "leave-approval.bpmn20.xml", mime: "application/xml", storage: "inline",
  semantic: { intent: "请假审批流程定义。平台只声明引用，内容随快照一起版本化；Flowable 部署时按 assetId+version 取二进制", aiHint: { constraints: ["userTask 的 id 必须与 Flow.taskForms[].taskKey 一一对应，L3 校验会解析 XML 比对"], confidence: 0.9 } }
};

// ============================================================ 业务规则（声明式，跨端共享同一套表达式）
rules.push(
  {
    id: uid(), key: "rule_leave_derive_owner", name: "推导申请人与部门", kind: "derivation",
    description: "创建时若前端未传申请人/部门，则由服务端从会话用户推导，避免前端伪造",
    entityRef: entityLeave, on: "create", priority: 10, enabled: true,
    then: [
      st({ type: "assign", target: "row.applicant_id", when: F("isEmpty", R("$row.applicant_id")), value: R("$user.id") }),
      st({ type: "assign", target: "row.applicant_name", when: F("isEmpty", R("$row.applicant_name")), value: R("$user.name") }),
      st({ type: "assign", target: "row.dept_id", when: F("isEmpty", R("$row.dept_id")), value: R("$user.deptId") })
    ],
    semantic: { intent: "服务端权威地补齐归属字段", aiHint: { constraints: ["归属字段不得信任前端传值"], confidence: 0.95 } }
  },
  {
    id: uid(), key: "rule_sick_proof_required", name: "病假佐证材料强制", kind: "validation",
    description: "病假 3 个工作日及以上必须上传诊断证明；attachment 与单据同事务登记，故此处可直接读 $row.attachments",
    entityRef: entityLeave, on: "create", priority: 20, enabled: true,
    when: F("and", EQ(R("$row.leave_type"), L("sick")), F("gte", R("$row.days"), L(3))),
    then: [
      st({ type: "fail", when: F("isEmpty", R("$row.attachments")), level: "error", rollback: true,
        code: "SICK_PROOF_REQUIRED", fields: ["attachments"], message: L("病假 3 个工作日及以上必须上传诊断证明") })
    ],
    semantic: { intent: "合规校验：用规则而非硬编码，便于各校按自身制度调整阈值", aiHint: { generate: "rule", constraints: ["阈值应可配置化"], confidence: 0.9 } }
  },
  {
    id: uid(), key: "rule_leave_no_overlap", name: "同人请假区间不得重叠", kind: "guard",
    description: "创建/更新时查同人已生效单据的时间区间，命中即拒绝。查询走 Api 声明而非内联 SQL，出码时生成对应 Repository 方法",
    entityRef: entityLeave, on: "any", priority: 30, enabled: true, stopOnFail: true,
    when: F("and", F("isNotEmpty", R("$row.applicant_id")), F("isNotEmpty", R("$row.start_at")), F("isNotEmpty", R("$row.end_at"))),
    then: [
      st({ type: "apiCall", apiRef: { kind: "api", key: "api_leave_find_overlap", version: 1 },
        params: { applicantId: R("$row.applicant_id"), startAt: R("$row.start_at"), endAt: R("$row.end_at"), excludeId: R("$row.id") },
        assignTo: "vars.overlap" }),
      st({ type: "fail", when: F("gt", R("$ctx.vars.overlap.total"), L(0)), level: "error", rollback: true,
        code: "LEAVE_TIME_OVERLAP", fields: ["start_at", "end_at"], message: L("该时间段已有生效中的请假单，请调整时间或先撤回原单") })
    ],
    access: { roles: ["system", "student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id" },
    semantic: { intent: "时间区间冲突守卫", businessDomain: "人事考勤", aiHint: { generate: "rule", confidence: 0.9 } }
  }
);

// 重叠校验所需的查询接口（与上面 Rule 成对出现）
apis.push({
  id: uid(), key: "api_leave_find_overlap", name: "查询同人时间区间重叠", kind: "internal", method: "POST",
  path: "/bff/entity/{entity}/findOverlap", idempotent: true, timeoutMs: 8000,
  description: "半开区间重叠判定：existing.start_at < new.end_at AND existing.end_at > new.start_at，且状态不属于已终止集合",
  request: {
    path: [{ key: "entity", label: "实体 key", type: "string", required: true, defaultValue: "leave_request" }],
    body: { contentType: "application/json", schema: { type: "object", required: ["applicantId", "startAt", "endAt"], properties: {
      applicantId: { type: "string" }, startAt: { type: "datetime" }, endAt: { type: "datetime" },
      excludeId: { type: "string", description: "编辑态排除自身" },
      activeStatuses: { type: "array", items: { type: "string" }, defaultValue: ["pending", "draft", "approved"] } } } }
  },
  response: { schema: { type: "object", properties: { code: { type: "integer" }, data: { type: "object", properties: { rows: { type: "array" }, total: { type: "integer" } } } } },
    successWhen: F("eq", R("$res.body.code"), L(0)), rowsPath: "$.data.rows", totalPath: "$.data.total" },
  access: { roles: ["system", "student", "teacher", "dept_manager", "school_admin"], scope: "self", ownerField: "applicant_id" },
  tags: ["guard", "read"],
  semantic: { intent: "规则专用查询，供 rule_leave_no_overlap 复用" }
});

// ============================================================ 流程定义
const flow = {
  id: uid(), key: "leave_approval", name: "请假审批", engine: "flowable",
  processKey: "leave_approval", bpmnRef: bpmnAssetRef,
  description: "请假审批：申请人提交 → 部门负责人 → （>=3 工作日走院级）→ 结束。节点差异全部由 taskForms 声明，页面不写死节点逻辑",
  category: "人事考勤",
  entityRef: entityLeave,
  statusField: "status",
  startableBy: { type: "role", values: ["student", "teacher", "dept_manager"] },
  variables: [
    { name: "applicantId", direction: "in", type: "string", required: true, source: R("$form.applicant_id"), description: "申请人用户 ID，供 initiator 型办理人解析" },
    { name: "applicantName", direction: "in", type: "string", source: R("$form.applicant_name") },
    { name: "deptId", direction: "in", type: "string", required: true, source: R("$form.dept_id"), description: "申请部门；deptLeader 型办理人依据它解析上级" },
    { name: "leaveType", direction: "in", type: "string", required: true, source: R("$form.leave_type") },
    { name: "urgency", direction: "in", type: "string", defaultValue: "normal", source: R("$form.urgency") },
    { name: "days", direction: "inout", type: "decimal", required: true, source: R("$form.days"), description: "工作日天数。审批节点可改（如院级核减），故为 inout，流程结束后回写单据" },
    { name: "startAt", direction: "in", type: "datetime", source: R("$form.start_at") },
    { name: "endAt", direction: "in", type: "datetime", source: R("$form.end_at") },
    { name: "needProof", direction: "in", type: "boolean", source: F("and", EQ(R("$form.leave_type"), L("sick")), F("gte", R("$form.days"), L(3))), description: "供排他网关条件分支使用" },
    { name: "outcome", direction: "out", type: "string", source: R("$process.variables.outcome"), description: "最终结论 approve/reject/return，由 FlowListener 回写单据 status" },
    { name: "approverComment", direction: "out", type: "string", source: R("$process.variables.comment") }
  ],
  taskForms: [
    {
      taskKey: "applySubmit", name: { default: "申请人提交" }, pageRef: pageRefForm,
      assignee: { type: "initiator" },
      editableFields: ["leave_type", "urgency", "start_at", "end_at", "reason", "images", "video_proof", "documents"],
      requiredFields: ["leave_type", "start_at", "end_at", "reason"],
      readonlyFields: ["days", "status", "applicant_id", "dept_id"],
      dueDateHours: 24,
      semantic: { intent: "流程其实由 leave_submit 启动，此节点用于「退回修改」后重新补充材料" }
    },
    {
      taskKey: "deptLeaderApprove", name: { default: "部门负责人审批" }, pageRef: pageRefApproval,
      assignee: { type: "deptLeader", level: 1, strategy: "any" },
      candidateRoles: ["dept_manager"],
      editableFields: ["days", "urgency"],
      requiredFields: [],
      readonlyFields: ["leave_type", "start_at", "end_at", "reason", "applicant_id"],
      dueDateHours: 48,
      buttons: [
        { key: "approve", label: { default: "同意" }, outcome: "approve", style: "primary" },
        { key: "reject", label: { default: "驳回" }, outcome: "reject", style: "danger", commentRequired: true },
        { key: "return", label: { default: "退回修改" }, outcome: "return", style: "warning", commentRequired: true },
        { key: "transfer", label: { default: "转办" }, outcome: "transfer", style: "default" }
      ],
      semantic: { intent: "部门负责人可核减天数（editableFields 含 days），核减后 days 作为 inout 变量继续流转" }
    },
    {
      taskKey: "schoolApprove", name: { default: "院级审批" }, pageRef: pageRefApproval,
      assignee: { type: "roleInDept", values: ["school_admin"], level: 1 },
      candidateRoles: ["school_admin"],
      editableFields: ["days"],
      requiredFields: [],
      readonlyFields: ["leave_type", "start_at", "end_at", "reason", "applicant_id", "urgency"],
      dueDateHours: 72,
      buttons: [
        { key: "approve", label: { default: "同意" }, outcome: "approve", style: "primary" },
        { key: "reject", label: { default: "驳回" }, outcome: "reject", style: "danger", commentRequired: true }
      ],
      semantic: { intent: "≥3 工作日或病假需佐证时进入；单次超过 15 个工作日的年假亦走此节点" }
    }
  ],
  listeners: [
    { id: uid(), event: "processEnded", on: "process", actionRef: tref("action", "leave_on_process_end"), async: true, order: 10, enabled: true,
      semantic: { intent: "流程结束后统一回写单据状态与结论，业务表状态只由此写入" } },
    { id: uid(), event: "taskCreated", on: "task", actionRef: tref("action", "leave_notify_task_arrived"), async: true, order: 20,
      when: F("ne", R("$process.variables.urgency"), L("low")), enabled: true,
      semantic: { intent: "待办到达即通知；不紧急单据免打扰" } }
  ],
  deployment: { tenantStrategy: "flowableTenantId", historyLevel: "audit", async: true, exclusive: true, autoDeploy: true },
  allowRecall: true, allowReturn: true, allowTransfer: true, allowAddSign: true,
  sla: { dueDateHours: 72, escalateAfterHours: 72, escalateTo: { type: "role", values: ["school_admin"] }, onTimeout: "notify" },
  access: { roles: ["student", "teacher", "dept_manager", "school_admin"], scope: "deptAndChildren", deptField: "dept_id" },
  semantic: { intent: "请假多级审批主线", businessDomain: "人事考勤", synonyms: ["请假审批流", "leave approval"], aiHint: { generate: "flow", constraints: ["节点字段集必须声明在 taskForms 而非页面", "流程侧不得直改业务表"], confidence: 0.9 } }
};

// ============================================================ 角色与权限
bundle.artifacts.roles = [
  { id: uid(), key: "student", name: "学生", level: "app", builtin: true, dataScope: "self",
    description: "只能查看与操作本人的请假单",
    semantic: { intent: "最窄数据范围，用于压测行级数据权限" } },
  { id: uid(), key: "teacher", name: "教职工", level: "app", builtin: true, dataScope: "self",
    description: "与 student 同权限，区分角色便于按岗位类别配置不同审批链" },
  { id: uid(), key: "dept_manager", name: "部门负责人", level: "app", builtin: true, dataScope: "deptAndChildren",
    description: "可查看本部门及下级部门的请假单，并办理所在部门的审批任务", inheritFrom: ["teacher"] },
  { id: uid(), key: "school_admin", name: "院级管理员", level: "app", builtin: true, dataScope: "deptAndChildren",
    description: "院级审批人，同时持有平台管理菜单（设计器/模型/流程/发布）", inheritFrom: ["dept_manager"] },
  { id: uid(), key: "hr_admin", name: "人事专员", level: "app", builtin: true, dataScope: "all",
    description: "全校数据只读 + 导出，不参与审批决策", inheritFrom: ["teacher"] },
  { id: uid(), key: "system", name: "系统", level: "system", builtin: true, dataScope: "all",
    description: "定时任务与监听器专用主体，不下发给任何真实用户",
    semantic: { intent: "供 onSchedule / FlowListener 等无会话场景使用；其调用必须在审计日志中可区分" } }
];

bundle.artifacts.permissions = [
  { roleKey: "student", resource: "leave_request", resourceType: "entity", actions: ["create", "read", "update", "delete"],
    fields: ["leave_type", "urgency", "start_at", "end_at", "reason", "images", "video_proof", "documents", "days", "status"],
    condition: EQ(R("$row.applicant_id"), R("$user.id")), inherit: true,
    semantic: { intent: "本人可增删改查；条件表达式由 BFF 翻译为行级过滤 + 写入校验" } },
  { roleKey: "student", resource: "page_leave_list", resourceType: "page", actions: ["read", "export"], inherit: true },
  { roleKey: "student", resource: "leave_submit", resourceType: "action", actions: ["execute"] },
  { roleKey: "student", resource: "attachment", resourceType: "entity", actions: ["create", "read"], inherit: true,
    fields: ["id", "biz_type", "biz_id", "file_name", "object_key", "mime", "size", "kind", "checksum"] },
  { roleKey: "teacher", resource: "page_leave_form", resourceType: "page", actions: ["read"], inherit: true },
  { roleKey: "dept_manager", resource: "leave_request", resourceType: "entity", actions: ["read"],
    fields: ["applicant_id", "applicant_name", "dept_id", "leave_type", "urgency", "start_at", "end_at", "days", "reason", "status", "created_at"],
    condition: F("in", R("$row.dept_id"), R("$user.deptIds")), inherit: true,
    semantic: { intent: "部门可见；id_card / phone 等敏感字段不在 fields 白名单内即不可见" } },
  { roleKey: "dept_manager", resource: "page_leave_approval", resourceType: "page", actions: ["read"], inherit: true },
  { roleKey: "dept_manager", resource: "action:leave_approve", resourceType: "action", actions: ["execute", "reject", "return", "transfer"] },
  { roleKey: "school_admin", resource: "action:leave_approve", resourceType: "action", actions: ["execute", "reject", "addSign"], inherit: true },
  { roleKey: "school_admin", resource: "leave_request", resourceType: "entity", actions: ["read", "export"], inherit: true,
    fields: ["id", "applicant_id", "applicant_name", "dept_id", "leave_type", "urgency", "start_at", "end_at", "days", "reason", "images", "video_proof", "documents", "status", "current_task", "approver_id", "approved_at", "created_at"] },
  { roleKey: "school_admin", resource: "designer", resourceType: "menu", actions: ["read", "update"], inherit: true,
    semantic: { intent: "设计态入口只授予管理员，运行时用户永远拿不到" } },
  { roleKey: "hr_admin", resource: "leave_request", resourceType: "entity", actions: ["read", "export"],
    fields: ["applicant_id", "applicant_name", "dept_id", "leave_type", "urgency", "start_at", "end_at", "days", "status"],
    condition: EQ(R("$tenant.id"), R("$user.tenantId")), inherit: true,
    semantic: { intent: "全校只读；即便 dataScope=all 也必须显式列字段白名单" } },
  { roleKey: "system", resource: "leave_request", resourceType: "entity", actions: ["read", "update", "delete"], inherit: false },
  { roleKey: "system", resource: "api:api_leave_find_stale", resourceType: "api", actions: ["execute"] }
];

// ============================================================ 导航
bundle.navigation = {
  menus: [
    { id: uid(), key: "menu_leave", title: { default: "请假管理", i18n: { "en-US": "Leave" } }, icon: "Calendar", order: 10,
      roles: ["student", "teacher", "dept_manager", "school_admin", "hr_admin"],
      children: [
        { id: uid(), key: "menu_leave_mine", title: { default: "我的请假" }, icon: "List", order: 10, pageRef: pageRefList, path: "/leave/requests", visible: L(true) },
        { id: uid(), key: "menu_leave_new", title: { default: "发起请假" }, icon: "EditPen", order: 20, pageRef: pageRefForm, path: "/leave/requests/new" },
        { id: uid(), key: "menu_leave_todo", title: { default: "待我审批" }, icon: "Stamp", order: 30, pageRef: pageRefApproval, path: "/leave/approval",
          roles: ["teacher", "dept_manager", "school_admin"],
          badge: R("$data.ds_todo.total"),
          semantic: { intent: "角标直接绑定待办数据源的 total，由运行时自动响应" } }
      ] },
    { id: uid(), key: "menu_leave_admin", title: { default: "考勤报表" }, icon: "DataAnalysis", order: 20, roles: ["dept_manager", "school_admin", "hr_admin"],
      path: "/leave/reports",
      visible: F("in", R("$user.roleKeys"), L(["dept_manager", "school_admin", "hr_admin"])),
      children: [] },
    { id: uid(), key: "menu_platform", title: { default: "平台管理" }, icon: "Setting", order: 90, roles: ["school_admin"],
      children: [
        { id: uid(), key: "menu_platform_model", title: { default: "数据模型" }, icon: "Coin", order: 10, path: "/designer/model" },
        { id: uid(), key: "menu_platform_page", title: { default: "页面设计" }, icon: "Grid", order: 20, path: "/designer/page" },
        { id: uid(), key: "menu_platform_flow", title: { default: "流程设计" }, icon: "Share", order: 30, path: "/designer/flow" },
        { id: uid(), key: "menu_platform_publish", title: { default: "发布与版本" }, icon: "Upload", order: 40, path: "/designer/publish" }
      ] }
  ],
  defaultRoute: "/leave/requests",
  homePageRef: "page_leave_list",
  breadcrumb: true,
  tabs: true,
  semantic: { intent: "菜单树是运行时的导航真相源；roles 与 visible 双保险：前者由 BFF 过滤，后者供前端表达更细的联动" }
};

// ============================================================ 发布配置
bundle.publish = {
  targets: [
    { platform: "web", enabled: true, config: { routerMode: "history", base: "/" } },
    { platform: "mobile", enabled: true, config: { container: "h5", safeArea: true, tabbar: ["home", "todo", "mine"] },
      minVersion: "1.0.0", semantic: { intent: "同一份 Schema，渲染器按断点与容器能力切换布局" } },
    { platform: "miniprogram", enabled: false, config: { appIdEnv: "MP_APPID", subPackages: true } },
    { platform: "wecom", enabled: false, config: { corpIdEnv: "WECOM_CORP_ID", agentIdEnv: "WECOM_AGENT_ID" } }
  ],
  environments: ["dev", "test", "prod"],
  requireApproval: true,
  migrationStrategy: "strict",
  allowDestructive: false,
  backupBefore: true,
  rollbackWindowHours: 72,
  semantic: { intent: "发布 = 生成不可变快照 + 原子推进指针；strict 策略下 DDL 不兼容必须人工确认" }
};

// ============================================================ 页面与逻辑装配
bundle.artifacts.uiSchemas = uiSchemas;

const logicSchema = {
  id: uid(), key: "leave_logic", name: "请假业务逻辑", scope: "app", version: 1,
  description: "请假涉及的全部动作、接口、规则与流程定义。逻辑不得散落在页面里：页面只允许通过 HandlerRef 引用此处声明的 action。",
  actions, apis, flows: [flow], rules,
  access: { roles: ["school_admin"], scope: "all" },
  semantic: { intent: "请假域的后端与前端共享逻辑层", businessDomain: "人事考勤", synonyms: ["请假逻辑"] }
};
bundle.artifacts.logicSchemas = [logicSchema];

// ============================================================ BPMN 资产（inline，随快照版本化）
const bpmnXml = fs.readFileSync(`${P}/examples/leave-approval.bpmn20.xml`, "utf8");
const { createHash } = await import("node:crypto");

// 打印模板以 inline document 资产承载：打印步骤只按 key 引用，正文随快照版本化
const recallReceiptTpl = [
  "<!doctype html>",
  "<html lang=\"zh-CN\">",
  "<head>",
  "<meta charset=\"utf-8\">",
  "<title>批量撤回回执</title>",
  "<style>",
  "body { font: 14px/1.6 -apple-system, 'Segoe UI', sans-serif; margin: 32px; color: #1f2328; }",
  "h1 { font-size: 20px; margin: 0 0 4px; }",
  ".muted { color: #6b7280; }",
  "table { border-collapse: collapse; width: 100%; margin-top: 16px; }",
  "th, td { border: 1px solid #d0d7de; padding: 6px 8px; text-align: left; }",
  "th { background: #f6f8fa; }",
  "</style>",
  "</head>",
  "<body>",
  "<h1>批量撤回回执</h1>",
  "<p class=\"muted\">操作人：{{ operator }}　生成时间：{{ now }}</p>",
  "<table>",
  "<thead><tr><th>#</th><th>单据</th><th>结果</th></tr></thead>",
  "<tbody>{{#each results}}<tr><td>{{@index}}</td><td>{{id}}</td><td>{{status}}</td></tr>{{/each}}</tbody>",
  "</table>",
  "</body>",
  "</html>",
  ""
].join("\n");

bundle.assets = [
  {
    ...bpmnAssetRef,
    size: Buffer.byteLength(bpmnXml, "utf8"),
    checksum: { algo: "sha256", value: createHash("sha256").update(bpmnXml, "utf8").digest("hex") },
    inline: { mediaType: "application/xml", encoding: "utf8", content: bpmnXml }
  },
  {
    assetId: uid(), key: "tpl_batch_recall", kind: "document", version: 1,
    fileName: "batch-recall-receipt.html", mime: "text/html", storage: "inline",
    size: Buffer.byteLength(recallReceiptTpl, "utf8"),
    checksum: { algo: "sha256", value: createHash("sha256").update(recallReceiptTpl, "utf8").digest("hex") },
    inline: { mediaType: "text/html", encoding: "utf8", content: recallReceiptTpl },
    semantic: { intent: "批量撤回回执模板：PrintStep 只声明 templateRef，正文不进 Schema，改版不回溯影响历史单据" }
  }
];

// ============================================================ 快照与元信息
bundle.snapshot.message = "完善版：补齐 API 声明、业务规则、流程定义、BPMN 资产、角色权限与导航";
bundle.snapshot.status = "published";
bundle.snapshot.publishedAt = "2026-10-16T09:12:00+08:00";
bundle.snapshot.publishedBy = { id: "u_1001", name: "张老师", type: "user" };
bundle.snapshot.tags = ["v0.1", "leave", "example", "reference"];
bundle.snapshot.changeSummary = [
  { kind: "added", artifactKind: "dataSchema", key: "leave_core", summary: "employee / leave_request / attachment 三个实体，含 column 与 jsonb 两级存储策略", breaking: false },
  { kind: "added", artifactKind: "uiSchema", key: "page_leave_list", summary: "列表页：搜索、分页、行操作、详情抽屉、快速申请弹窗", breaking: false },
  { kind: "added", artifactKind: "uiSchema", key: "page_leave_form", summary: "创建型表单页：三类 OSS 客户端直传（图片/视频/办公文档）", breaking: false },
  { kind: "added", artifactKind: "uiSchema", key: "page_leave_approval", summary: "审批办理页：节点差异由 Flow.taskForms 驱动", breaking: false },
  { kind: "added", artifactKind: "logicSchema", key: "leave_logic", summary: "14 个动作 + 11 个 API + 3 条规则 + 1 条流程", breaking: false },
  { kind: "added", artifactKind: "asset", key: "leave-approval.bpmn20.xml", summary: "Flowable 流程定义，随快照版本化", breaking: false },
  { kind: "added", artifactKind: "asset", key: "tpl_batch_recall", summary: "批量撤回回执的打印模板（inline document 资产）", breaking: false },
  { kind: "added", artifactKind: "role", key: "student", summary: "自 student 至 system 共 6 个角色，dataScope 覆盖 self / deptAndChildren / all", breaking: false }
];
bundle.meta = {
  ...(bundle.meta || {}),
  generator: "lcp-designer/0.1.0",
  createdWith: "schema-protocol-v0.1",
  docs: "https://lcp.dev/schema/0.1",
  changelog: [
    "0.1.0 首版协议：三种子 Schema + 组件契约 + Bundle 信封层",
    "本轮：补齐 FailStep / NavigateStep；AssetRef.inline 契约收紧；新增 $res 表达式根"
  ],
  ai: {
    generator: "lcp-ai/0.1.0",
    capabilities: ["form-from-text", "page-from-text", "flow-from-text"],
    note: "本样例中的 semantic 字段即 AI 辅助生成的输入锚点；origin.generator 区分 human / template / ai 三种来源"
  },
  marketplace: {
    publishable: true,
    category: "education/hr",
    license: "MIT",
    installParams: [
      { key: "dept_tree_source", label: "组织架构来源", type: "select", required: true, options: ["platform", "wecom", "manual"] },
      { key: "school_approve_threshold", label: "院级审批阈值（工作日）", type: "integer", defaultValue: 3 }
    ],
    semantic: { intent: "安装参数即「应用变量」：市场安装时由管理员填写，落到 tenant 级配置，不修改 Schema" }
  }
};

// ============================================================ 遗留结构修复（幂等）
// 本脚本以「已落盘的 bundle」为基底增量修改，早期种子脚本写入的结构可能已不合当前 Schema。
// 本节每条修复都写成「设为目标值 / 删除非法键」，重复执行不会累积。

// (1) uiHints.accept 不是合法键（上传白名单的唯一合法位置是 uiHints.upload.accept），清理历史遗留
for (const e of ds.entities) {
  for (const f of e.fields) {
    if (f.uiHints && Object.prototype.hasOwnProperty.call(f.uiHints, "accept")) delete f.uiHints.accept;
  }
}

// (2) 表达式树内不允许裸字符串：{$fn,$args} 的字面量实参必须显式包成 {$lit}
//     早期种子把 "dept_manager" 直接当作 in() 的第一个实参，属于表达式歧义（字符串既不一定是字面量、
//     也不一定是取值根），这里统一收敛成 $lit。
const wrapBareArgs = (node) => {
  if (Array.isArray(node)) { for (const v of node) wrapBareArgs(v); return; }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.$args)) node.$args = node.$args.map((a) => (typeof a === "string" ? { $lit: a } : a));
  for (const v of Object.values(node)) wrapBareArgs(v);
};
for (const e of ds.entities) if (e.access && e.access.rowFilter) wrapBareArgs(e.access.rowFilter);
for (const g of bundle.artifacts.permissions || []) if (g.condition !== undefined) wrapBareArgs(g.condition);

// ============================================================ ID 规范化（Crockford Base32）
// uid() 生成的 ULID 天然合规，但早期种子脚本手写的稳定 ID 含 I / L 等非 Crockford 字符，
// 会被 L1 的 pattern ^[0-9A-HJKMNP-TV-Z]{26}$ 拒绝。此处按 Crockford 解码规则全局重映射，
// 且就地改写以保证 ds / ent() / fldDef() 等已捕获的引用同步生效。
const CROCK = { I: "1", L: "1", O: "0", U: "V" };
const OK_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const idMap = new Map();
const fixId = (s) => {
  if (!/^[0-9A-Z]{26}$/.test(s) || OK_ID.test(s)) return s;
  if (!idMap.has(s)) idMap.set(s, [...s].map((ch) => CROCK[ch] ?? ch).join(""));
  return idMap.get(s);
};
const normalizeInPlace = (node) => {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const v = node[i];
      if (typeof v === "string") node[i] = fixId(v); else normalizeInPlace(v);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") node[k] = fixId(v); else normalizeInPlace(v);
    }
  }
};
const collectIds = (node, out) => {
  if (typeof node === "string") { if (/^[0-9A-Z]{26}$/.test(node)) out.add(node); return; }
  if (Array.isArray(node)) { for (const v of node) collectIds(v, out); return; }
  if (node && typeof node === "object") for (const v of Object.values(node)) collectIds(v, out);
};
const idsBefore = new Set();
collectIds(bundle, idsBefore);
const reverse = new Map();
for (const s of idsBefore) {
  const t = fixId(s);
  if (reverse.has(t) && reverse.get(t) !== s) throw new Error(`ID 规范化冲突：${reverse.get(t)} 与 ${s} 都映射为 ${t}`);
  reverse.set(t, s);
}
normalizeInPlace(bundle);
const idsAfter = new Set();
collectIds(bundle, idsAfter);
const stillBad = [...idsAfter].filter((s) => !OK_ID.test(s));
const lost = [...idsBefore].filter((s) => !idsAfter.has(fixId(s)));
if (stillBad.length || lost.length) throw new Error(`ID 规范化未收敛：非法 ${stillBad.length} 个，丢失 ${lost.length} 个`);
console.log("ID 规范化: 重映射 " + idMap.size + " 个，剩余非法 0，丢失 0");

// ============================================================ 落盘（含自检）
fs.writeFileSync(FILE, JSON.stringify({ bundle }, null, 2) + "\n", "utf8");

const dataSchema = bundle.artifacts.dataSchemas[0];
const fieldCount = dataSchema.entities.reduce((n, e) => n + e.fields.length, 0);
console.log("written: " + FILE);
console.log("  bytes          = " + fs.statSync(FILE).size);
console.log("  entities       = " + dataSchema.entities.length + " (" + dataSchema.entities.map(e => e.key).join(", ") + ")");
console.log("  fields         = " + fieldCount + "  column=" + dataSchema.entities.reduce((n, e) => n + e.fields.filter(f => (f.storage || "column") === "column").length, 0) + "  jsonb=" + dataSchema.entities.reduce((n, e) => n + e.fields.filter(f => f.storage === "jsonb").length, 0));
console.log("  enums          = " + dataSchema.enums.length + " (" + dataSchema.enums.map(e => e.key).join(", ") + ")");
console.log("  pages          = " + bundle.artifacts.uiSchemas.length + " (" + bundle.artifacts.uiSchemas.map(p => p.key).join(", ") + ")");
console.log("  actions        = " + actions.length);
console.log("  apis           = " + apis.length);
console.log("  rules          = " + rules.length);
console.log("  flows          = " + logicSchema.flows.length + "  taskForms=" + flow.taskForms.length + "  listeners=" + flow.listeners.length + "  variables=" + flow.variables.length);
console.log("  roles          = " + bundle.artifacts.roles.length);
console.log("  permissions    = " + bundle.artifacts.permissions.length);
console.log("  menus          = " + bundle.navigation.menus.length + " (children=" + bundle.navigation.menus.reduce((n, m) => n + (m.children || []).length, 0) + ")");
console.log("  assets         = " + bundle.assets.length + " (" + bundle.assets[0].checksum.value.slice(0, 12) + "...)");
