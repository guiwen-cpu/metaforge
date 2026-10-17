package dev.lcp.generated.leave_approval.api.dto;

import dev.lcp.generated.leave_approval.api.support.LcpFilter;
import dev.lcp.generated.leave_approval.api.support.LcpPageQuery;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * leave_request 的列表查询条件。
 * page / size / sort / order / q / includeDeleted 是公共部分；其余由 dataSchema 推出：
 * 列存的 enum / ref / boolean 出等值过滤，date / datetime / integer / decimal 出区间过滤。
 * toFilters() 里的列名是生成期写死的白名单 —— 请求只能决定值。
 */
public record LeaveRequestQuery(
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
    /** 申请人 · 等值筛选 */
    String applicantId,
    /** 请假类型 · 等值筛选 */
    String leaveType,
    /** 开始时间 · 区间下限 */
    OffsetDateTime startAtFrom,
    /** 开始时间 · 区间上限 */
    OffsetDateTime startAtTo,
    /** 结束时间 · 区间下限 */
    OffsetDateTime endAtFrom,
    /** 结束时间 · 区间上限 */
    OffsetDateTime endAtTo,
    /** 请假天数 · 区间下限 */
    BigDecimal daysFrom,
    /** 请假天数 · 区间上限 */
    BigDecimal daysTo,
    /** 状态 · 等值筛选 */
    String status,
    /** 审批完成时间 · 区间下限 */
    OffsetDateTime approvedAtFrom,
    /** 审批完成时间 · 区间上限 */
    OffsetDateTime approvedAtTo
) {

  /** 公共分页参数。 */
  public LcpPageQuery toPageQuery() {
    return new LcpPageQuery(page, size, sort, order, q, includeDeleted);
  }

  /** 类型化筛选 → runtime 的白名单过滤条件。列名写死在这里，前端只传值。 */
  public List<LcpFilter> toFilters() {
    List<LcpFilter> filters = new ArrayList<>();
    if (applicantId != null) {
      filters.add(LcpFilter.eq("applicant_id", applicantId));
    }
    if (leaveType != null) {
      filters.add(LcpFilter.eq("leave_type", leaveType));
    }
    if (startAtFrom != null) {
      filters.add(LcpFilter.gte("start_at", startAtFrom));
    }
    if (startAtTo != null) {
      filters.add(LcpFilter.lte("start_at", startAtTo));
    }
    if (endAtFrom != null) {
      filters.add(LcpFilter.gte("end_at", endAtFrom));
    }
    if (endAtTo != null) {
      filters.add(LcpFilter.lte("end_at", endAtTo));
    }
    if (daysFrom != null) {
      filters.add(LcpFilter.gte("days", daysFrom));
    }
    if (daysTo != null) {
      filters.add(LcpFilter.lte("days", daysTo));
    }
    if (status != null) {
      filters.add(LcpFilter.eq("status", status));
    }
    if (approvedAtFrom != null) {
      filters.add(LcpFilter.gte("approved_at", approvedAtFrom));
    }
    if (approvedAtTo != null) {
      filters.add(LcpFilter.lte("approved_at", approvedAtTo));
    }
    return filters;
  }
}
