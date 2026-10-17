// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.document;

import dev.lcp.schema.v01.dto.ComponentContract;

/**
 * 根容器：component.schema.json 的顶层属性 component 就是 $defs/ComponentContract 的引用，
 * 所以这里只做一层具名继承 —— 文档入口有独立类型名，字段与校验注解仍然只有一份。
 */
public class ComponentSchemaDocument extends ComponentContract {
}
