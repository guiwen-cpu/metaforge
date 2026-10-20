package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 以保存点执行 transaction 步骤。请求级事务由 TenantTransactionAspect 开启，这里使用
 * NESTED 传播，调用方仍可在步骤失败后通过 onError 继续执行。
 */
@Service
public class SpringRuntimeTransactionRunner implements RuntimeTransactionRunner {

  private final PlatformTransactionManager transactions;
  private final JdbcTemplate jdbc;

  public SpringRuntimeTransactionRunner(
      PlatformTransactionManager transactions, JdbcTemplate jdbc) {
    this.transactions = transactions;
    this.jdbc = jdbc;
  }

  @Override
  public JsonNode execute(String isolation, boolean readOnly, Supplier<JsonNode> work) {
    TransactionTemplate template = new TransactionTemplate(transactions);
    template.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
    template.setIsolationLevel(isolationLevel(isolation));
    template.setReadOnly(readOnly);
    String tenantId = TenantContext.tenantId();
    return template.execute(status -> {
      jdbc.queryForObject("select set_config('search_path', 'public,flowable', true)", String.class);
      if (tenantId != null && !tenantId.isBlank()) {
        jdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)", String.class, tenantId);
      }
      return work.get();
    });
  }

  private int isolationLevel(String isolation) {
    return switch (isolation == null ? "" : isolation) {
      case "", "readCommitted" -> TransactionDefinition.ISOLATION_READ_COMMITTED;
      case "repeatableRead" -> TransactionDefinition.ISOLATION_REPEATABLE_READ;
      case "serializable" -> TransactionDefinition.ISOLATION_SERIALIZABLE;
      default -> throw PlatformException.badRequest(
          "unsupported_isolation", "不支持的事务隔离级别：" + isolation);
    };
  }
}