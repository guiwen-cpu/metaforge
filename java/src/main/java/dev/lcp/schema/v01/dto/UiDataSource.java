// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 页面数据源。组件只声明消费哪个源，由运行时统一编排（并发请求、缓存、错误、loading），不让每个组件各自发请求。
 * 判别联合：按 type 的取值分派到成员类，成员类持有同名 const 字段作为单一来源。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(value = UiEntityDataSource.class, name = "entity"),
    @JsonSubTypes.Type(value = UiApiDataSource.class, name = "api"),
    @JsonSubTypes.Type(value = UiFlowDataSource.class, name = "flow"),
    @JsonSubTypes.Type(value = UiStaticDataSource.class, name = "static"),
    @JsonSubTypes.Type(value = UiComputedDataSource.class, name = "computed"),
})
public interface UiDataSource {
}
