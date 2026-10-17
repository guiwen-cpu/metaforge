/**
 * LCP Schema Protocol v0.1 —— TypeScript 类型包入口。
 *
 * 消费方与用法：
 *   设计器     ComponentContract + PropDef 驱动属性面板；EXPRESSION_FUNCTIONS 驱动表达式编辑器
 *   运行时     UISchema / LogicSchema 强类型化；guards.ts 收窄 unknown；isStrictExpr 判表达式
 *   出码引擎   FIELD_TYPE_MAPPING 生成实体类型与 DDL；类型形状决定生成联合还是分支
 *   BFF        DataSchema 驱动泛化 CRUD 的 JSONB 读写；EXPRESSION_QUERY_OPERATORS 生成 WHERE
 *   AI 生成器  同一套类型做约束解码；EXPRESSION_DOCS 直接进 system prompt
 */
export * from "./types";
export * from "./expr";
export * from "./text";
export * from "./guards";
export * from "./registry";
