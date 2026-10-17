package dev.lcp.generated.leave_approval.api.dto;

import dev.lcp.generated.leave_approval.api.support.LcpFilter;
import dev.lcp.generated.leave_approval.api.support.LcpPageQuery;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * employee 的列表查询条件。
 * page / size / sort / order / q / includeDeleted 是公共部分；其余由 dataSchema 推出：
 * 列存的 enum / ref / boolean 出等值过滤，date / datetime / integer / decimal 出区间过滤。
 * toFilters() 里的列名是生成期写死的白名单 —— 请求只能决定值。
 */
public record EmployeeQuery(
    /** 页码，从 1 开始 */
    int page,
    /** 每页条数，上限 200 */
    int size,
    /** 排序字段，必须在 sortable 白名单内 */
    String sort,
    /** asc / desc */
    String order,
    /** 全局搜索词，命中 searchable 列 */
    String q,
    /** 是否包含已软删除的行（需要平台侧授权） */
    boolean includeDeleted,
    /** 身份类型 · 等值筛选 */
    String position,
    /** 入学/入职日期 · 区间下限 */
    LocalDate hireDateFrom,
    /** 入学/入职日期 · 区间上限 */
    LocalDate hireDateTo
) {

  /** 公共分页参数。 */
  public LcpPageQuery toPageQuery() {
    return new LcpPageQuery(page, size, sort, order, q, includeDeleted);
  }

  /** 类型化筛选 → runtime 的白名单过滤条件。列名写死在这里，前端只传值。 */
  public List<LcpFilter> toFilters() {
    List<LcpFilter> filters = new ArrayList<>();
    if (position != null) {
      filters.add(LcpFilter.eq("position", position));
    }
    if (hireDateFrom != null) {
      filters.add(LcpFilter.gte("hire_date", hireDateFrom));
    }
    if (hireDateTo != null) {
      filters.add(LcpFilter.lte("hire_date", hireDateTo));
    }
    return filters;
  }
}
