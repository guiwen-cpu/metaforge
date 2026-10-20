package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.connector.OutboundHttpClient;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 通知 outbox 后台投递器。外部渠道失败只更新投递状态，不影响审批事务。 */
@Service
public class NotificationDispatcher {

  private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);
  private static final int MAX_ATTEMPTS = 5;
  private static final int BATCH_SIZE = 50;

  private final NamedParameterJdbcTemplate jdbc;
  private final JdbcTemplate plainJdbc;
  private final TransactionTemplate transactions;
  private final OutboundHttpClient outbound;
  private final ObjectMapper json;

  public NotificationDispatcher(
      NamedParameterJdbcTemplate jdbc,
      JdbcTemplate plainJdbc,
      TransactionTemplate transactions,
      OutboundHttpClient outbound,
      ObjectMapper json) {
    this.jdbc = jdbc;
    this.plainJdbc = plainJdbc;
    this.transactions = transactions;
    this.outbound = outbound;
    this.json = json;
  }

  @Scheduled(fixedDelay = 15000, initialDelay = 10000)
  public void dispatch() {
    List<String> tenants;
    try {
      tenants = plainJdbc.queryForList(
          "select tenant_id from public.lcp_active_tenants()", String.class);
    } catch (RuntimeException ex) {
      log.debug("通知 outbox 租户发现失败：{}", ex.getMessage());
      return;
    }
    for (String tenant : tenants) {
      try {
        dispatchTenant(tenant);
      } catch (RuntimeException ex) {
        log.warn("通知 outbox 处理租户 {} 失败：{}", tenant, ex.getMessage());
      }
    }
  }

  private void dispatchTenant(String tenant) {
    List<Delivery> claimed = inTenant(tenant, this::claim);
    for (Delivery delivery : claimed) {
      Outcome outcome;
      TenantContext.set(tenant, "system");
      try {
        outcome = deliver(delivery);
      } finally {
        TenantContext.clear();
      }
      inTenant(tenant, () -> {
        finish(delivery, outcome);
        return null;
      });
    }
  }

  private List<Delivery> claim() {
    String tenant = TenantContext.tenantId();
    plainJdbc.update("""
        update lcp_notification_delivery
           set status = 'failed', next_attempt_at = now(), updated_at = now()
         where tenant_id = ? and status = 'sending'
           and updated_at < now() - interval '5 minutes'
        """, tenant);
    List<Delivery> rows = jdbc.query("""
        select id, channel, connection_ref, recipient, path, payload::text as payload, attempts
          from lcp_notification_delivery
         where tenant_id = :tenant and status in ('pending', 'failed')
           and next_attempt_at <= now()
         order by next_attempt_at asc
         limit :limit
         for update skip locked
        """, new MapSqlParameterSource("tenant", tenant).addValue("limit", BATCH_SIZE),
        NotificationDispatcher::mapDelivery);
    List<Delivery> claimed = new ArrayList<>();
    for (Delivery row : rows) {
      jdbc.update("""
          update lcp_notification_delivery
             set status = 'sending', attempts = attempts + 1, updated_at = now()
           where tenant_id = :tenant and id = :id
          """, new MapSqlParameterSource("tenant", tenant).addValue("id", row.id()));
      claimed.add(row.nextAttempt());
    }
    return claimed;
  }

  private Outcome deliver(Delivery delivery) {
    try {
      JsonNode payload = json.readTree(delivery.payload());
      outbound.postJson(delivery.connectionRef(), delivery.path(), payload);
      return new Outcome(true, false, null);
    } catch (OutboundHttpClient.DeliveryException ex) {
      return new Outcome(false, ex.retryable(), ex.getMessage());
    } catch (Exception ex) {
      return new Outcome(false, false,
          "投递失败（" + ex.getClass().getSimpleName() + "）：" + ex.getMessage());
    }
  }

  private void finish(Delivery delivery, Outcome outcome) {
    String tenant = TenantContext.tenantId();
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant)
        .addValue("id", delivery.id())
        .addValue("error", outcome.error());
    if (outcome.success()) {
      jdbc.update("""
          update lcp_notification_delivery
             set status = 'sent', sent_at = now(), last_error = null, updated_at = now()
           where tenant_id = :tenant and id = :id
          """, params);
      return;
    }
    if (outcome.retryable() && delivery.attempts() < MAX_ATTEMPTS) {
      int delay = Math.min(3600, 30 * (1 << Math.min(6, delivery.attempts() - 1)));
      jdbc.update("""
          update lcp_notification_delivery
             set status = 'failed', last_error = :error,
                 next_attempt_at = now() + (:delay * interval '1 second'),
                 updated_at = now()
           where tenant_id = :tenant and id = :id
          """, params.addValue("delay", delay));
      return;
    }
    jdbc.update("""
        update lcp_notification_delivery
           set status = 'dead', last_error = :error, updated_at = now()
         where tenant_id = :tenant and id = :id
        """, params);
  }

  private <T> T inTenant(String tenant, Supplier<T> action) {
    return transactions.execute(status -> {
      plainJdbc.queryForObject("select set_config('search_path', 'public,flowable', true)",
          String.class);
      plainJdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)",
          String.class, tenant);
      TenantContext.set(tenant, "system");
      try {
        return action.get();
      } finally {
        TenantContext.clear();
      }
    });
  }

  private static Delivery mapDelivery(ResultSet rs, int rowNum) throws SQLException {
    return new Delivery(
        rs.getObject("id", UUID.class),
        rs.getString("channel"),
        rs.getString("connection_ref"),
        rs.getString("recipient"),
        rs.getString("path"),
        rs.getString("payload"),
        rs.getInt("attempts"));
  }

  private record Delivery(
      UUID id,
      String channel,
      String connectionRef,
      String recipient,
      String path,
      String payload,
      int attempts) {

    Delivery nextAttempt() {
      return new Delivery(id, channel, connectionRef, recipient, path, payload, attempts + 1);
    }
  }

  private record Outcome(boolean success, boolean retryable, String error) {
  }
}
