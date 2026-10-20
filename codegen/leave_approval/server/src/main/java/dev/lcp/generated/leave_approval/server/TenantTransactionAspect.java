package dev.lcp.generated.leave_approval.server;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** 每个 Controller 调用一个事务，并在事务内设置 lcp.tenant_id 供 RLS 使用。 */
@Aspect
@Component
public class TenantTransactionAspect {

  private final TransactionTemplate transactions;
  private final JdbcTemplate jdbc;

  public TenantTransactionAspect(TransactionTemplate transactions, JdbcTemplate jdbc) {
    this.transactions = transactions;
    this.jdbc = jdbc;
  }

  @Around("within(dev.lcp.generated..*) && @within(org.springframework.web.bind.annotation.RestController)")
  public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) return joinPoint.proceed();
    return transactions.execute(status -> {
      jdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)", String.class, tenant);
      try {
        return joinPoint.proceed();
      } catch (RuntimeException | Error ex) {
        throw ex;
      } catch (Throwable ex) {
        throw new IllegalStateException(ex);
      }
    });
  }
}
