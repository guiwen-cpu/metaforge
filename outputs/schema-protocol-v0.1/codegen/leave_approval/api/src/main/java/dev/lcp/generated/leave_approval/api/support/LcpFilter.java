package dev.lcp.generated.leave_approval.api.support;

/**
 * 一个已白名单化的过滤条件。列名只能由生成代码给出（LcpFilter.eq("status", value)），
 * 前端传的只是值；runtime 还会再校验列存在于 spec 且为列存。
 */
public record LcpFilter(String column, Op op, Object value) {

  /** 允许出现在 SQL 里的比较运算。字符串是写死的，不来自请求。 */
  public enum Op {
    EQ("="),
    NE("<>"),
    GT(">"),
    GTE(">="),
    LT("<"),
    LTE("<="),
    ILIKE("ilike");

    private final String sql;

    Op(String sql) {
      this.sql = sql;
    }

    public String sql() {
      return sql;
    }
  }

  public static LcpFilter eq(String column, Object value) {
    return new LcpFilter(column, Op.EQ, value);
  }

  public static LcpFilter ne(String column, Object value) {
    return new LcpFilter(column, Op.NE, value);
  }

  public static LcpFilter gt(String column, Object value) {
    return new LcpFilter(column, Op.GT, value);
  }

  public static LcpFilter gte(String column, Object value) {
    return new LcpFilter(column, Op.GTE, value);
  }

  public static LcpFilter lt(String column, Object value) {
    return new LcpFilter(column, Op.LT, value);
  }

  public static LcpFilter lte(String column, Object value) {
    return new LcpFilter(column, Op.LTE, value);
  }

  public static LcpFilter ilike(String column, Object value) {
    return new LcpFilter(column, Op.ILIKE, value);
  }
}
