import fs from "node:fs";
const P = "schema/expression-registry.json";
const r = JSON.parse(fs.readFileSync(P, "utf8"));
const ctx = r.valueRoots.find(v => v.name === "$ctx");
ctx.desc = "动作执行上下文。result=紧邻上一步的结果（下一步即被覆盖，跨步骤请用 vars）；vars=动作链内的临时变量（assignTo 前缀 vars 写入）；params=动作入参；event=触发事件载荷";
ctx.fields = { params: "object", event: "object", vars: "object", result: "any", error: "object", actionKey: "string", stepIndex: "integer" };
r.assignToConvention = "结果落点约定：任何步骤的 assignTo 都接受 state.x / form.x / row.x / rows.x / vars.x 五类相对路径。state 写页面状态、form 写当前表单模型、row 写当前行、vars 写动作链临时变量。读回时分别用 $page.state.x / $form.x / $row.x / $ctx.vars.x。仅「紧邻下一步」读上一步原始结果才用 $ctx.result —— 这是新手最常踩的坑（下一步执行后 result 即被覆盖）。";
fs.writeFileSync(P, JSON.stringify(r, null, 2) + "\n", "utf8");
console.log("ctx.vars added");
