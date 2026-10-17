/**
 * LCP 统一表达式 DSL —— 手写模型（不由 gen-ts.mjs 生成）。
 *
 * 为什么手写：schema 里 common.Expr 是 5 分支 oneOf，机械翻译会得到
 * `{ $lit: unknown } | { $ref: string } | { $fn: string; $args?: Expr[] } | ...`
 * 这种匿名联合，既无法从错误信息里认出分支名，也无法在编译期做穷尽检查。
 * 这里显式命名 5 个 interface，用 type 标量做判别，并额外提供构造器与遍历器。
 *
 * 语义锚点（与 schema/common.schema.json、registry/expression-registry.json 一致）：
 * - 唯一解释器：前端求值器 / BFF 求值器 / Flowable 变量绑定 / 规则引擎 / 数据权限下推
 *   全部读同一份注册表。任何一端私自定义函数视为缺陷。
 * - 歧义规则：对象仅当「恰好含一个 $ 开头的头键，且其余键都是该头键的合法修饰键」
 *   时才是表达式。所以 { "$lit": { "$x": 1 } } 是合法写法，
 *   { "$ref": "..." , "extra": 1 } 不是表达式（会按普通对象处理）。
 * - 需要字面量对象且对象里带 $ 键时，必须用 { "$lit": { ... } } 包裹。
 * - 读取用 $ 前缀根（$page.state.x / $form.x / $row.x）；
 *   写入用相对路径（state.x / form.x / row.x / vars.x），见 AssignStep.target。
 * - $ctx.result 只在「紧邻下一步」有效，下一步执行即被覆盖。
 */

/** 5 个表达式头键，即算子集合。与 expression-registry.json 的 operators 对齐。 */
export type ExprOperator = "$lit" | "$ref" | "$fn" | "$tpl" | "$if";

/** 头键顺序即 schema 里 oneOf 的分支顺序，用于生成错误提示与文档。 */
export const EXPR_HEAD_KEYS: readonly ExprOperator[] = ["$lit", "$ref", "$fn", "$tpl", "$if"];

/** 每个头键允许出现的修饰键（除头键本身）。空数组表示该分支只允许一个键。 */
export const EXPR_MODIFIER_KEYS: Readonly<Record<ExprOperator, readonly string[]>> = {
  "$lit": [],
  "$ref": [],
  "$fn": ["$args"],
  "$tpl": [],
  "$if": ["$then", "$else"],
};

/** 字面量。任意 JSON 值原样返回 —— 它同时是「带 $ 键的对象字面量」的逃生舱。 */
export interface ExprLiteral {
  "$lit": unknown;
}

/**
 * 取值路径。首段必须是注册表 valueRoots 之一。
 * 合法根：$user / $tenant / $env / $now / $page / $route / $form / $row / $rows /
 *        $data / $process / $ctx / $component / $res
 */
export interface ExprReference {
  "$ref": string;
}

/**
 * 注册表函数调用。$fn 只校验非空，函数名与实参数量/类型由 L2 语义校验查注册表。
 * 例：eq($row.applicant_id, $user.id)
 */
export interface ExprFunction {
  "$fn": string;
  "$args"?: Expr[];
}

/**
 * 字符串拼接。元素是字符串字面量或子表达式，不做字符串解析。
 * 刻意不支持 "{a} 审批 {b}" 这类模板串：解析器歧义 + 注入面 + 无法静态分析依赖。
 */
export interface ExprTemplate {
  "$tpl": (string | Expr)[];
}

/** 条件表达式。$else 缺省视为 null。 */
export interface ExprConditional {
  "$if": Expr;
  "$then": Expr;
  "$else"?: Expr;
}

export type Expr = ExprLiteral | ExprReference | ExprFunction | ExprTemplate | ExprConditional;

/* ------------------------------------------------------------------ */
/* 构造器 —— 让出码引擎、AI 生成器、示例构建器不必手写 JSON            */
/* ------------------------------------------------------------------ */

export function lit(value: unknown): ExprLiteral {
  return { "$lit": value };
}

export function ref(path: string): ExprReference {
  return { "$ref": path };
}

export function fn(name: string, ...args: Expr[]): ExprFunction {
  return args.length === 0 ? { "$fn": name } : { "$fn": name, "$args": args };
}

export function tpl(...parts: (string | Expr)[]): ExprTemplate {
  return { "$tpl": parts };
}

export function cond(test: Expr, thenBranch: Expr, elseBranch?: Expr): ExprConditional {
  const expression: ExprConditional = { "$if": test, "$then": thenBranch };
  if (elseBranch !== undefined) expression["$else"] = elseBranch;
  return expression;
}

/* ------------------------------------------------------------------ */
/* 判定与遍历 —— 校验器、编译器、设计器属性面板共用                    */
/* ------------------------------------------------------------------ */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 按歧义规则取出头键：恰好一个 $ 开头的键，且它是已知算子。否则返回 null。
 * 注意这里只看头键，修饰键的合法性交给 isStrictExpr —— 校验器需要区分
 * 「不是表达式」和「是表达式但写了非法修饰键」，后者要报错而不是当作普通对象。
 */
export function exprOperatorOf(value: unknown): ExprOperator | null {
  if (!isPlainObject(value)) return null;
  let head: string | null = null;
  for (const key of Object.keys(value)) {
    if (key.charCodeAt(0) !== 36) continue;
    if (head !== null) return null;
    head = key;
  }
  if (head === null) return null;
  return EXPR_HEAD_KEYS.indexOf(head as ExprOperator) >= 0 ? (head as ExprOperator) : null;
}

/** 宽松判定：命中了头键就算表达式。运行时求值器用这个。 */
export function isExpr(value: unknown): value is Expr {
  return exprOperatorOf(value) !== null;
}

/** 严格判定：头键合法且所有非头键都在该算子的修饰键白名单里。L1 校验用这个。 */
export function isStrictExpr(value: unknown): value is Expr {
  const operator = exprOperatorOf(value);
  if (operator === null) return false;
  const allowed = EXPR_MODIFIER_KEYS[operator];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === operator) continue;
    if (allowed.indexOf(key) < 0) return false;
  }
  return true;
}

/** 深度遍历所有子表达式。返回 false 可提前终止。 */
export function visitExpr(node: Expr, visit: (child: Expr) => boolean | void): void {
  const children = childExprs(node);
  for (const child of children) {
    if (visit(child) === false) return;
    visitExpr(child, visit);
  }
}

/** 直接子表达式。求值器按算子分发时用这个做统一的栈机驱动。 */
export function childExprs(node: Expr): Expr[] {
  if ("$fn" in node) return node["$args"] ?? [];
  if ("$tpl" in node) {
    const parts = node["$tpl"];
    const out: Expr[] = [];
    for (const part of parts) if (typeof part !== "string") out.push(part);
    return out;
  }
  if ("$if" in node) {
    const out: Expr[] = [node["$if"], node["$then"]];
    if (node["$else"] !== undefined) out.push(node["$else"]);
    return out;
  }
  return [];
}

/**
 * 收集表达式依赖的取值根路径（只收 $ref 叶子）。
 * 用途：① 出码引擎据此生成 import 与类型依赖；② 设计器「该字段被哪些逻辑引用」
 * 的反查；③ AI 生成时把可用上下文喂给模型；④ 数据权限下推时判断是否需要行级过滤。
 */
export function collectReferences(node: Expr): string[] {
  const out: string[] = [];
  const visit = (child: Expr): void => {
    if ("$ref" in child) {
      out.push(child["$ref"]);
      return;
    }
    visitExpr(child, visit);
  };
  if ("$ref" in node) out.push(node["$ref"]);
  else visitExpr(node, visit);
  return out;
}

/** 取路径首段（去掉 $ 前缀），如 $page.state.detailId -> "page"。 */
export function referenceRoot(path: string): string {
  const body = path.startsWith("$") ? path.slice(1) : path;
  const dot = body.indexOf(".");
  const bracket = body.indexOf("[");
  const stops = [dot, bracket].filter(index => index >= 0);
  return stops.length === 0 ? body : body.slice(0, Math.min(...stops));
}
