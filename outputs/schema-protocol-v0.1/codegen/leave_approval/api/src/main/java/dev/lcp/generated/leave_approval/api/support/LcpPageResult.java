package dev.lcp.generated.leave_approval.api.support;

import java.util.List;

/** 分页结果。items 里每个对象的键就是 Schema 的字段 key（snake_case），前端可直接套 entities.ts 的类型。 */
public record LcpPageResult<T>(List<T> items, long total, int page, int size) {

  public LcpPageResult {
    items = List.copyOf(items);
    page = Math.max(1, page);
    size = Math.max(1, size);
  }

  /** 总页数。Jackson 会把这个访问器序列化成 pages 字段。 */
  public int pages() {
    return (int) ((total + size - 1) / size);
  }
}
