package dev.lcp.generated.leave_approval.api.support;

/** 列表查询的公共部分。各实体的类型化筛选条件放在 <Entity>Query 里，不进 runtime。 */
public record LcpPageQuery(int page, int size, String sort, String order, String q, boolean includeDeleted) {
}
