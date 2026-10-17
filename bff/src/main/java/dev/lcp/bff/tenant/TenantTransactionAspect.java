package dev.lcp.bff.tenant;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 把每个生成 Controller 调用包进事务，并在事务内注入 lcp.tenant_id。
 *
 * <p>SET LOCAL 随事务结束自动清理，配合非 owner 的 app 角色，RLS 才能真正兜底。
 * 事务在 Controller 方法返回时提交，早于响应序列化。
 */
@Aspect
@Component
public class TenantTransactionAspect {

  private final TransactionTemplate transactionTemplate;
  private final JdbcTemplate jdbc;

  public TenantTransactionAspect(TransactionTemplate transactionTemplate, JdbcTemplate jdbc) {
    this.transactionTemplate = transactionTemplate;
    this.jdbc = jdbc;
  }

  @Around("within(dev.lcp..*) && @within(org.springframework.web.bind.annotation.RestController)")
  public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
    String tenantId = TenantContext.tenantId();
    if (tenantId == null || tenantId.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return transactionTemplate.execute(status -> {
      jdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)", String.class, tenantId);
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
