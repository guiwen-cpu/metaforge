package dev.lcp.generated.leave_approval.server;

import dev.lcp.generated.leave_approval.api.support.LcpPrincipal;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

/** 把请求线程上的上下文适配成生成 CRUD 依赖的 LcpPrincipal。 */
@Component
@RequestScope
public class RequestPrincipal implements LcpPrincipal {

  @Override
  public String tenantId() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文");
    }
    return tenant;
  }

  @Override
  public String userId() {
    String user = TenantContext.userId();
    return user == null || user.isBlank() ? "anonymous" : user;
  }
}
