package dev.lcp.generated.leave_approval.api.support;

import java.util.Collection;

/**
 * 字段级读策略。默认实现对 sensitive 列一律拒绝 —— 失败时宁可少返回，也不泄露。
 * 接入平台后换成「按 permissions.json 的 fields 白名单」的实现即可，调用方不用改。
 */
public interface LcpFieldPolicy {

  boolean canRead(String column);

  static LcpFieldPolicy denySensitive(Collection<String> sensitiveColumns) {
    return (column) -> !sensitiveColumns.contains(column);
  }

  static LcpFieldPolicy allowAll() {
    return (column) -> true;
  }
}
