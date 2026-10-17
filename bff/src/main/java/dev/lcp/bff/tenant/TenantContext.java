package dev.lcp.bff.tenant;

/** 请求级租户/操作人上下文。由 TenantFilter 写入，由 LcpPrincipal 读取。 */
public final class TenantContext {

  private static final ThreadLocal<String> TENANT = new ThreadLocal<>();
  private static final ThreadLocal<String> USER = new ThreadLocal<>();

  private TenantContext() {
  }

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
