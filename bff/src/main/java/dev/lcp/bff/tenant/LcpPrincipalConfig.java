package dev.lcp.bff.tenant;

import dev.lcp.generated.leave_approval.api.support.LcpPrincipal;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 单例 Bean 每次调用读取 ThreadLocal，避免请求作用域代理穿透到生成的 Controller。 */
@Configuration
public class LcpPrincipalConfig {

  @Bean
  public LcpPrincipal lcpPrincipal() {
    return new LcpPrincipal() {
      @Override
      public String tenantId() {
        return TenantContext.tenantId();
      }

      @Override
      public String userId() {
        return TenantContext.userId();
      }
    };
  }
}
