// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.registry;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一表达式 DSL 的唯一权威注册表。前端求值器、BFF 求值器、Flowable 变量绑定、规则引擎、数据权限下推、AI 生成校验器全部读这一份。新增函数=改这一个文件；任何一端私自定义函数视为缺陷。
 * 表达式 DSL 注册表，由 schema/expression-registry.json 生成。
 * 设计器补全、AI 生成提示词、服务端求值器、出码引擎四方共用这一份语义。
 */
public final class ExpressionRegistry {
    public static final String PROTOCOL_VERSION = "0.1";

    /** 表达式节点算子：$lit 字面量、$ref 取值、$fn 调用、$tpl 模板串、$if 条件。 */
    public static final List<String> OPERATORS = List.<String>of("$lit", "$ref", "$fn", "$tpl", "$if");

    /** 值类型系统。 */
    public static final List<String> TYPES = List.<String>of("any", "string", "number", "integer", "boolean", "date", "array", "object", "file", "null");

    /** 取值根全集。表达式的数据来源只能挂在这些根上，业务代码不得自造根。 */
    public static final List<String> VALUE_ROOT_NAMES = List.<String>of("$user", "$tenant", "$env", "$now", "$page", "$route", "$form", "$row", "$rows", "$data", "$process", "$ctx", "$component", "$res");

    /** 取值根的约定字段名（租户可扩展，但约定名不能改：出码模板与 AI 提示词都依赖它）。 */
    public static final Map<String, List<String>> VALUE_ROOT_FIELDS = buildValueRootFields();

    private static Map<String, List<String>> buildValueRootFields() {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        fields.put("$user", List.<String>of("id", "name", "username", "tenantId", "deptId", "deptIds", "roleKeys", "email", "phone", "attrs"));
        fields.put("$tenant", List.<String>of("id", "code", "name", "attrs"));
        fields.put("$env", List.<String>of("platform", "locale", "timezone", "appVersion", "mode"));
        fields.put("$now", List.<String>of());
        fields.put("$page", List.<String>of("id", "key", "params", "query", "state"));
        fields.put("$route", List.<String>of("path", "query", "params"));
        fields.put("$form", List.<String>of());
        fields.put("$row", List.<String>of());
        fields.put("$rows", List.<String>of());
        fields.put("$data", List.<String>of());
        fields.put("$process", List.<String>of("processInstanceId", "taskId", "taskKey", "taskName", "initiator", "status", "variables"));
        fields.put("$ctx", List.<String>of("params", "event", "vars", "result", "error", "actionKey", "stepIndex"));
        fields.put("$component", List.<String>of());
        fields.put("$res", List.<String>of("status", "body", "headers"));
        return Collections.unmodifiableMap(fields);
    }

    /**
     * 内置函数。arity 是闭区间 [minArity, maxArity]；variadic 为真表示尾参可变，此时 maxArity 只是建议上限。
     */
    public record Function(String name, String category, int minArity, int maxArity, boolean variadic, String returns, boolean pure, List<String> params, String description) {}

    /** 全部内置函数（97 个）。 */
    public static final List<Function> FUNCTIONS = List.of(
        new Function("eq", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "等于（深度比较，忽略对象键序）"),
        new Function("ne", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "不等于"),
        new Function("lt", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "小于（字符串按字典序，日期按时间序）"),
        new Function("lte", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "小于等于"),
        new Function("gt", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "大于"),
        new Function("gte", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "any"), "大于等于"),
        new Function("between", "comparison", 3, 3, false, "boolean", true, List.<String>of("any", "any", "any"), "闭区间包含"),
        new Function("in", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "array"), "左侧值是否在右侧数组内"),
        new Function("notIn", "comparison", 2, 2, false, "boolean", true, List.<String>of("any", "array"), "取反的 in"),
        new Function("like", "comparison", 2, 2, false, "boolean", true, List.<String>of("string", "string"), "SQL LIKE 语义（% 通配），下推时编译为 ILIKE"),
        new Function("startsWith", "comparison", 2, 2, false, "boolean", true, List.<String>of("string", "string"), "前缀匹配"),
        new Function("endsWith", "comparison", 2, 2, false, "boolean", true, List.<String>of("string", "string"), "后缀匹配"),
        new Function("isNull", "comparison", 1, 1, false, "boolean", true, List.<String>of("any"), "是否为 null 或 undefined"),
        new Function("isNotNull", "comparison", 1, 1, false, "boolean", true, List.<String>of("any"), "非空判断"),
        new Function("isEmpty", "comparison", 1, 1, false, "boolean", true, List.<String>of("any"), "空字符串/空数组/空对象/null 皆为真"),
        new Function("isNotEmpty", "comparison", 1, 1, false, "boolean", true, List.<String>of("any"), "非空判断"),
        new Function("and", "logic", 1, 1, true, "boolean", true, List.<String>of("any"), "逻辑与，短路求值"),
        new Function("or", "logic", 1, 1, true, "boolean", true, List.<String>of("any"), "逻辑或，短路求值"),
        new Function("not", "logic", 1, 1, false, "boolean", true, List.<String>of("any"), "逻辑非"),
        new Function("if", "logic", 3, 3, false, "any", true, List.<String>of("any", "any", "any"), "三元表达式。复杂嵌套优先用 $if 算子以提升可读性"),
        new Function("coalesce", "logic", 1, 1, true, "any", true, List.<String>of("any"), "返回第一个非空值"),
        new Function("default", "logic", 2, 2, false, "any", true, List.<String>of("any", "any"), "空则取默认值"),
        new Function("add", "math", 2, 2, true, "number", true, List.<String>of("number"), "求和（高精度十进制语义，非 IEEE754 累加）"),
        new Function("sub", "math", 2, 2, false, "number", true, List.<String>of("number", "number"), "差"),
        new Function("mul", "math", 2, 2, true, "number", true, List.<String>of("number"), "积"),
        new Function("div", "math", 2, 2, false, "number", true, List.<String>of("number", "number"), "商；除数为 0 时返回 null 而非抛错"),
        new Function("mod", "math", 2, 2, false, "integer", true, List.<String>of("integer", "integer"), "取余"),
        new Function("round", "math", 1, 2, false, "number", true, List.<String>of("number", "integer"), "四舍五入，第二参数为小数位"),
        new Function("floor", "math", 1, 1, false, "number", true, List.<String>of("number"), "向下取整"),
        new Function("ceil", "math", 1, 1, false, "number", true, List.<String>of("number"), "向上取整"),
        new Function("abs", "math", 1, 1, false, "number", true, List.<String>of("number"), "绝对值"),
        new Function("min", "math", 1, 1, true, "number", true, List.<String>of("number"), "最小值，也接受单个数组"),
        new Function("max", "math", 1, 1, true, "number", true, List.<String>of("number"), "最大值，也接受单个数组"),
        new Function("sum", "math", 1, 2, false, "number", true, List.<String>of("array", "string"), "数组求和，第二参数可选指定字段名"),
        new Function("avg", "math", 1, 2, false, "number", true, List.<String>of("array", "string"), "数组均值"),
        new Function("concat", "string", 1, 1, true, "string", true, List.<String>of("string"), "连接为字符串，null/undefined 视为空串"),
        new Function("upper", "string", 1, 1, false, "string", true, List.<String>of("string"), "转大写"),
        new Function("lower", "string", 1, 1, false, "string", true, List.<String>of("string"), "转小写"),
        new Function("trim", "string", 1, 1, false, "string", true, List.<String>of("string"), "去首尾空白"),
        new Function("substr", "string", 2, 3, false, "string", true, List.<String>of("string", "integer", "integer"), "截取子串，start/length"),
        new Function("replace", "string", 3, 3, false, "string", true, List.<String>of("string", "string", "string"), "全部替换（非正则，避免注入）"),
        new Function("split", "string", 2, 2, false, "array", true, List.<String>of("string", "string"), "按分隔符切分"),
        new Function("join", "string", 1, 3, false, "string", true, List.<String>of("array", "string", "string"), "连接数组，可指定分隔符与字段名"),
        new Function("padStart", "string", 3, 3, false, "string", true, List.<String>of("string", "integer", "string"), "左填充，如学号补零"),
        new Function("padEnd", "string", 3, 3, false, "string", true, List.<String>of("string", "integer", "string"), "右填充"),
        new Function("len", "string", 1, 1, false, "integer", true, List.<String>of("any"), "长度：字符串按字符、数组/对象按元素数"),
        new Function("indexOf", "string", 2, 2, false, "integer", true, List.<String>of("string", "string"), "查找位置，未找到返回 -1"),
        new Function("format", "string", 1, 1, true, "string", true, List.<String>of("string"), "占位符格式化，首参含 {0} {1}"),
        new Function("first", "array", 1, 1, false, "any", true, List.<String>of("array"), "首元素"),
        new Function("last", "array", 1, 1, false, "any", true, List.<String>of("array"), "末元素"),
        new Function("nth", "array", 2, 2, false, "any", true, List.<String>of("array", "integer"), "第 n 个元素（0 基）"),
        new Function("slice", "array", 2, 3, false, "array", true, List.<String>of("array", "integer", "integer"), "切片"),
        new Function("filter", "array", 2, 2, false, "array", true, List.<String>of("array", "any"), "过滤，第二参数为子表达式（作用域内新增 $item 与 $index）"),
        new Function("map", "array", 2, 2, false, "array", true, List.<String>of("array", "any"), "映射，作用域同 filter"),
        new Function("sort", "array", 1, 3, false, "array", true, List.<String>of("array", "string", "string"), "排序，可指定字段与方向 asc|desc"),
        new Function("reverse", "array", 1, 1, false, "array", true, List.<String>of("array"), "反转"),
        new Function("unique", "array", 1, 2, false, "array", true, List.<String>of("array", "string"), "去重，可指定字段"),
        new Function("flatten", "array", 1, 2, false, "array", true, List.<String>of("array", "integer"), "展平，深度默认 1"),
        new Function("groupBy", "array", 2, 2, false, "object", true, List.<String>of("array", "string"), "按字段分组为 {key: rows[]}"),
        new Function("pluck", "array", 2, 2, false, "array", true, List.<String>of("array", "string"), "抽取字段为数组"),
        new Function("size", "array", 1, 1, false, "integer", true, List.<String>of("any"), "元素个数"),
        new Function("get", "object", 2, 3, false, "any", true, List.<String>of("object", "string", "any"), "安全深取值，支持 a.b[0].c，缺失返回第三参数或 null"),
        new Function("has", "object", 2, 2, false, "boolean", true, List.<String>of("object", "string"), "路径是否存在"),
        new Function("keys", "object", 1, 1, false, "array", true, List.<String>of("object"), "键数组"),
        new Function("values", "object", 1, 1, false, "array", true, List.<String>of("object"), "值数组"),
        new Function("merge", "object", 1, 1, true, "object", true, List.<String>of("object"), "浅合并，后者覆盖前者"),
        new Function("toNumber", "type", 1, 2, false, "number", true, List.<String>of("any", "any"), "转数字，失败返回第二参数或 null"),
        new Function("toString", "type", 1, 2, false, "string", true, List.<String>of("any", "string"), "转字符串"),
        new Function("toBool", "type", 1, 1, false, "boolean", true, List.<String>of("any"), "转布尔，遵循 'false'/'0'/'' 为假"),
        new Function("toDate", "type", 1, 2, false, "date", true, List.<String>of("any", "string"), "转日期，第二参数为输入格式"),
        new Function("toArray", "type", 1, 1, false, "array", true, List.<String>of("any"), "标量包成单元素数组，数组原样返回"),
        new Function("typeOf", "type", 1, 1, false, "string", true, List.<String>of("any"), "返回 null|string|number|boolean|array|object|date"),
        new Function("now", "date", 0, 0, false, "date", false, List.<String>of(), "当前时间，等价 $now。非纯，禁止用于下推位置"),
        new Function("today", "date", 0, 0, false, "date", false, List.<String>of(), "今日零点"),
        new Function("dateAdd", "date", 3, 3, false, "date", true, List.<String>of("date", "integer", "string"), "日期加减，单位 year|month|week|day|hour|minute"),
        new Function("dateDiff", "date", 2, 3, false, "integer", true, List.<String>of("date", "date", "string"), "日期差，单位默认 day"),
        new Function("formatDate", "date", 1, 2, false, "string", true, List.<String>of("date", "string"), "格式化，默认 yyyy-MM-dd HH:mm:ss"),
        new Function("startOf", "date", 2, 2, false, "date", true, List.<String>of("date", "string"), "区间起点，单位 day|week|month|quarter|year"),
        new Function("endOf", "date", 2, 2, false, "date", true, List.<String>of("date", "string"), "区间终点"),
        new Function("year", "date", 1, 1, false, "integer", true, List.<String>of("date"), "取年，如学期归属"),
        new Function("month", "date", 1, 1, false, "integer", true, List.<String>of("date"), "取月（1-12）"),
        new Function("day", "date", 1, 1, false, "integer", true, List.<String>of("date"), "取日"),
        new Function("maskIdCard", "security", 1, 2, false, "string", true, List.<String>of("string", "integer"), "身份证脱敏，默认保留前 6 后 4"),
        new Function("maskPhone", "security", 1, 1, false, "string", true, List.<String>of("string"), "手机号脱敏 138****8000"),
        new Function("maskName", "security", 1, 1, false, "string", true, List.<String>of("string"), "姓名脱敏，保留姓氏"),
        new Function("maskEmail", "security", 1, 1, false, "string", true, List.<String>of("string"), "邮箱脱敏"),
        new Function("hash", "security", 1, 2, false, "string", true, List.<String>of("string", "string"), "哈希，算法默认 sha256"),
        new Function("uuid", "security", 0, 0, false, "string", false, List.<String>of(), "生成 UUID v4"),
        new Function("entityField", "data", 3, 3, false, "any", false, List.<String>of("string", "string", "any"), "按实体 key + 主键取字段值（BFF 侧带租户与数据权限校验；禁止在 rowFilter 中使用）"),
        new Function("lookup", "data", 2, 3, false, "any", true, List.<String>of("array", "any", "string"), "在本地数组中按主键查行，第三参数指定返回字段"),
        new Function("processVariable", "flow", 1, 2, false, "any", false, List.<String>of("string", "any"), "读取流程变量（审批流页面与流程监听器内可用）"),
        new Function("taskAssignee", "flow", 0, 1, false, "any", false, List.<String>of("string"), "当前任务办理人，参数为任务 key 时查指定任务"),
        new Function("isTaskClaimed", "flow", 0, 0, false, "boolean", false, List.<String>of(), "当前任务是否已被认领"),
        new Function("fileName", "file", 1, 1, false, "string", true, List.<String>of("file"), "取文件名"),
        new Function("fileExt", "file", 1, 1, false, "string", true, List.<String>of("file"), "取扩展名（小写，不含点）"),
        new Function("fileSize", "file", 1, 1, false, "integer", true, List.<String>of("file"), "取字节数"),
        new Function("fileUrl", "file", 1, 2, false, "string", false, List.<String>of("file", "boolean"), "取可访问地址，第二参数为是否强制签发临时签名 URL")
    );

    /** 取值根。fields 是「约定字段名 -> 值类型」；nullable 为真表示该根在部分场景下不存在（如流程外的 $process）。 */
    public record ValueRoot(String name, String type, boolean nullable, String description, List<String> fields) {}

    public static final List<ValueRoot> VALUE_ROOTS = List.of(
        new ValueRoot("$user", "object", false, "当前用户。fields 为约定字段，租户可扩展至 user.attrs.*", List.<String>of("id", "name", "username", "tenantId", "deptId", "deptIds", "roleKeys", "email", "phone", "attrs")),
        new ValueRoot("$tenant", "object", false, "当前租户", List.<String>of("id", "code", "name", "attrs")),
        new ValueRoot("$env", "object", false, "运行环境", List.<String>of("platform", "locale", "timezone", "appVersion", "mode")),
        new ValueRoot("$now", "string", false, "当前时间 ISO8601，每次求值稳定（同一动作链内冻结）", List.<String>of()),
        new ValueRoot("$page", "object", false, "当前页面上下文。state 暴露 UISchema.state 声明的状态变量（读用 $page.state.x；写用 AssignStep.target 的相对路径 state.x）", List.<String>of("id", "key", "params", "query", "state")),
        new ValueRoot("$route", "object", false, "当前路由", List.<String>of("path", "query", "params")),
        new ValueRoot("$form", "object", true, "当前表单模型（创建型/编辑型表单的字段值），键为字段 key", List.<String>of()),
        new ValueRoot("$row", "object", true, "当前行（表格行操作、详情页主体）", List.<String>of()),
        new ValueRoot("$rows", "array", true, "当前列表已加载数据", List.<String>of()),
        new ValueRoot("$data", "object", false, "按 dataSourceId 索引的数据源结果：$data.dsUsers.rows / .total / .page / .loading / .item", List.<String>of()),
        new ValueRoot("$process", "object", true, "审批流上下文，非流程页面为 null", List.<String>of("processInstanceId", "taskId", "taskKey", "taskName", "initiator", "status", "variables")),
        new ValueRoot("$ctx", "object", false, "动作执行上下文。result=紧邻上一步的结果（下一步即被覆盖，跨步骤请用 vars）；vars=动作链内的临时变量（assignTo 前缀 vars 写入）；params=动作入参；event=触发事件载荷", List.<String>of("params", "event", "vars", "result", "error", "actionKey", "stepIndex")),
        new ValueRoot("$component", "object", true, "组件作用域内可用：$component.id / .key / .props", List.<String>of()),
        new ValueRoot("$res", "object", true, "HTTP 响应对象。仅在 Api.response 的解析表达式（successWhen / mapping / rowsPath / totalPath / errorPath / errorMessagePath）内可用：$res.status 为 HTTP 状态码，$res.body 为解析后的响应体，$res.headers 为响应头。步骤外读响应体请用 assignTo 落到 $ctx.vars.x。", List.<String>of("status", "body", "headers"))
    );

    /** 查询算子：设计器「查询条件」面板直接读这张表生成下拉与 SQL 片段。{col} 是列占位，{p} 是参数占位。 */
    public record QueryOperator(String op, String label, int args, String sql, String widgetHint, String note) {}

    public static final List<QueryOperator> QUERY_OPERATORS = List.of(
        new QueryOperator("eq", "等于", 1, "{col} = {p}", "x-input", null),
        new QueryOperator("ne", "不等于", 1, "{col} <> {p}", "x-input", null),
        new QueryOperator("like", "包含", 1, "{col} ILIKE {p}", "x-input", "值由编译器包 % 并由参数绑定，禁止字符串拼接"),
        new QueryOperator("startsWith", "开头是", 1, "{col} ILIKE {p}", "x-input", null),
        new QueryOperator("in", "属于", n, "{col} = ANY({p})", "x-select", null),
        new QueryOperator("between", "区间", 2, "{col} BETWEEN {p1} AND {p2}", "x-date-picker", "日期区间用 daterange，右端按字段类型补 23:59:59 或加一天"),
        new QueryOperator("gt", "大于", 1, "{col} > {p}", "x-number", null),
        new QueryOperator("gte", "大于等于", 1, "{col} >= {p}", "x-number", null),
        new QueryOperator("lt", "小于", 1, "{col} < {p}", "x-number", null),
        new QueryOperator("lte", "小于等于", 1, "{col} <= {p}", "x-number", null),
        new QueryOperator("isNull", "为空", 0, "{col} IS NULL", "x-switch", null),
        new QueryOperator("notNull", "不为空", 0, "{col} IS NOT NULL", "x-switch", null)
    );

    private ExpressionRegistry() {}
}
