/**
 * 可本地化文本的读写工具 —— 手写（不由 gen-ts.mjs 生成）。
 *
 * common.Text 允许两种写法：
 *   "提交"                                  // 裸字符串，等价于 { default: "提交" }
 *   { default: "提交", i18n: { "en-US": "Submit" } }
 *
 * 为什么允许裸字符串：Schema 是给人手写、给 AI 生成的，label/placeholder/message
 * 这类字段占 Schema 字面量的绝大多数，强制写对象会让可读性崩塌。
 * 代价是每个消费方都要处理两种形态 —— 所以统一收敛到这两个函数，禁止各处自行判断。
 */
import type { CommonText } from "./types";

/**
 * 取出用于「当前 locale」的文案。
 * 优先级：i18n[locale] -> i18n[语言主语种] -> default。
 * 缺省返回空串而不是 undefined：调用方多是模板渲染，空串比 undefined 更好处理。
 */
export function readText(value: CommonText | null | undefined, locale?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (locale) {
    const exact = value.i18n?.[locale];
    if (exact !== undefined) return exact;
    const dash = locale.indexOf("-");
    if (dash > 0) {
      const primary = value.i18n?.[locale.slice(0, dash)];
      if (primary !== undefined) return primary;
    }
  }
  return value.default;
}

/** 把裸字符串规范成 { default } 形态，便于写回 Schema 或做深度比较。 */
export function normalizeText(value: CommonText): Exclude<CommonText, string> {
  return typeof value === "string" ? { default: value } : value;
}

/** 构造多语言文案。i18n 为空时退化为裸字符串，保持 Schema 简洁。 */
export function i18nText(defaultText: string, i18n?: Record<string, string>): CommonText {
  if (!i18n || Object.keys(i18n).length === 0) return defaultText;
  return { default: defaultText, i18n };
}

/** 列出该文案覆盖的所有 locale，用于「缺失翻译」体检。 */
export function coveredLocales(value: CommonText): string[] {
  return typeof value === "string" ? [] : Object.keys(value.i18n ?? {});
}
