// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
/**
 * LCP 元数据协议 0.1 的 Java 绑定。
 *
 * 本包由 tools/gen-java.mjs 从 schema/*.schema.json 与 registry/*.json 生成，
 * 与 TypeScript 侧的 ts/ 逐类型同名 —— 这是硬约束：AI 提示词、Code Connect、出码引擎
 * 都靠这个名字把两端对上。
 *
 * 分包：
 *   dto      元数据 DTO（判别联合生成 interface + 成员类）
 *   enums    枚举（$defs 级 + 属性级内联枚举）
 *   registry 注册表（字段类型映射 / 表达式 / 内置组件 / 别名）
 *   document 5 份文档型 Schema 的根容器
 *   support  ObjectMapper 装配与 JSONB 契约
 *
 * 要改契约请改 schema/ 或 registry/ 后重新生成，不要手改本包任何文件。
 */
package dev.lcp.schema.v01;
