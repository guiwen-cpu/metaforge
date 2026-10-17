package dev.lcp.generated.leave_approval.api.support;

/**
 * 一个业务字段的运行期描述。runtime 只认这份描述：运行期零反射、零 Schema 解析。
 *
 * flags 为逗号分隔标记：jsonb / req / imm / sens / search / sort
 */
public record LcpColumn(
    String key,
    String kind,
    boolean jsonb,
    boolean required,
    boolean immutable,
    boolean sensitive,
    boolean searchable,
    boolean sortable) {

  public static LcpColumn of(String key, String kind, String flags) {
    java.util.List<String> set = java.util.Arrays.asList(flags.split(","));
    return new LcpColumn(
        key,
        kind,
        set.contains("jsonb"),
        set.contains("req"),
        set.contains("imm"),
        set.contains("sens"),
        set.contains("search"),
        set.contains("sort"));
  }
}
