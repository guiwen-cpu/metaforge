import fs from "node:fs";
const P = "schema/expression-registry.json";
const r = JSON.parse(fs.readFileSync(P, "utf8"));

const ctx = r.valueRoots.find(v => v.name === "$ctx");
ctx.desc = "动作执行上下文。params=动作入参（Action.params 声明的键）；event=触发事件载荷（如表格行点击的 row、上传完成的 files）";
ctx.fields = { params: "object", event: "object", result: "any", error: "object", actionKey: "string", stepIndex: "integer" };

r.queryOperators = [
  { op: "eq", label: "等于", args: 1, sql: "{col} = {p}", widgetHint: "x-input" },
  { op: "ne", label: "不等于", args: 1, sql: "{col} <> {p}", widgetHint: "x-input" },
  { op: "like", label: "包含", args: 1, sql: "{col} ILIKE {p}", widgetHint: "x-input", note: "值由编译器包 % 并由参数绑定，禁止字符串拼接" },
  { op: "startsWith", label: "开头是", args: 1, sql: "{col} ILIKE {p}", widgetHint: "x-input" },
  { op: "in", label: "属于", args: "n", sql: "{col} = ANY({p})", widgetHint: "x-select" },
  { op: "between", label: "区间", args: 2, sql: "{col} BETWEEN {p1} AND {p2}", widgetHint: "x-date-picker", note: "日期区间用 daterange，右端按字段类型补 23:59:59 或加一天" },
  { op: "gt", label: "大于", args: 1, sql: "{col} > {p}", widgetHint: "x-number" },
  { op: "gte", label: "大于等于", args: 1, sql: "{col} >= {p}", widgetHint: "x-number" },
  { op: "lt", label: "小于", args: 1, sql: "{col} < {p}", widgetHint: "x-number" },
  { op: "lte", label: "小于等于", args: 1, sql: "{col} <= {p}", widgetHint: "x-number" },
  { op: "isNull", label: "为空", args: 0, sql: "{col} IS NULL", widgetHint: "x-switch" },
  { op: "notNull", label: "不为空", args: 0, sql: "{col} IS NOT NULL", widgetHint: "x-switch" }
];
r.queryOperatorDocs = "searchFieldList[].op 的取值域，同时是前端控件提示与后端 SQL 下推编译的唯一来源。前端渲染搜索项、BFF 生成 WHERE、出码引擎生成查询函数三处共用；新增算子=改这一段。";

fs.writeFileSync(P, JSON.stringify(r, null, 2) + "\n", "utf8");
console.log("expr registry OK, size:", fs.statSync(P).size, "| roots:", r.valueRoots.length, "| ops:", r.queryOperators.length);
