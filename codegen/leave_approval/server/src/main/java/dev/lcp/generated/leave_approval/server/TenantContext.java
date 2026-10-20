package dev.lcp.generated.leave_approval.server;

/** 单次 HTTP 请求内的租户与用户上下文；由 TenantSessionFilter 写入并清理。 */
public final class TenantContext {

  private static final ThreadLocal<String> TENANT = new ThreadLocal<>();
  private static final ThreadLocal<String> USER = new ThreadLocal<>();

  private TenantContext() {}

  public static void set(String tenantId, String userId) {
    TENANT.set(tenantId);
    USER.set(userId);
  }

  public static String tenantId() {
    return TENANT.get();
  }

  public static String userId() {
    return USER.get();
  }

  public static void clear() {
    TENANT.remove();
    USER.remove();
  }
}
