package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationFeed;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationReadResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationView;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** 站内通知：审批事件落库、未读数与已读状态。 */
@Service
public class NotificationService {

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  private final NamedParameterJdbcTemplate jdbc;

  public NotificationService(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * 写入站内通知。同一用户对同一业务对象的同类型未读通知只保留一条，
   * 避免重复打开任务或转办往返时刷屏。
   */
  public UUID send(
      UUID appId,
      String userId,
      String type,
      String title,
      String body,
      String link,
      String bizType,
      String bizId) {
    if (appId == null || trimToNull(userId) == null || trimToNull(type) == null) {
      return null;
    }
    UUID id = UUID.randomUUID();
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("id", id)
        .addValue("tenant", tenant())
        .addValue("app", appId)
        .addValue("user", userId.trim())
        .addValue("type", type)
        .addValue("title", trimToNull(title) == null ? type : title.trim())
        .addValue("body", trimToNull(body))
        .addValue("link", trimToNull(link))
        .addValue("bizType", trimToNull(bizType))
        .addValue("bizId", trimToNull(bizId));
    List<UUID> inserted = jdbc.query("""
        insert into lcp_notification
          (id, tenant_id, app_id, user_id, type, title, body, link, biz_type, biz_id)
        values
          (:id, :tenant, :app, :user, :type, :title, :body, :link, :bizType, :bizId)
        on conflict (tenant_id, user_id, type, biz_type, biz_id)
          where read_at is null and biz_id is not null
        do nothing
        returning id
        """, params, (rs, rowNum) -> rs.getObject("id", UUID.class));
    if (!inserted.isEmpty()) {
      return inserted.get(0);
    }
    List<UUID> existing = jdbc.query("""
        select id from lcp_notification
         where tenant_id = :tenant and app_id = :app and user_id = :user
           and type = :type and biz_type = :bizType and biz_id = :bizId
           and read_at is null
         order by created_at desc limit 1
        """, params, (rs, rowNum) -> rs.getObject("id", UUID.class));
    return existing.isEmpty() ? null : existing.get(0);
  }

  /** 外部渠道只写 outbox。投递失败由调度器重试，不回滚审批事务。 */
  public UUID enqueue(
      UUID appId,
      UUID notificationId,
      String channel,
      String connectionRef,
      String recipient,
      String path,
      JsonNode payload,
      String idempotencyKey) {
    if (appId == null || trimToNull(channel) == null || trimToNull(idempotencyKey) == null) {
      return null;
    }
    UUID id = UUID.randomUUID();
    int changed = jdbc.update("""
        insert into lcp_notification_delivery
          (id, tenant_id, app_id, notification_id, channel, connection_ref, recipient,
           path, payload, idempotency_key)
        values
          (:id, :tenant, :app, :notification, :channel, :connectionRef, :recipient,
           :path, cast(:payload as jsonb), :idempotencyKey)
        on conflict (tenant_id, idempotency_key, channel, recipient) do nothing
        """, new MapSqlParameterSource()
            .addValue("id", id)
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("notification", notificationId)
            .addValue("channel", channel)
            .addValue("connectionRef", trimToNull(connectionRef))
            .addValue("recipient", trimToNull(recipient) == null ? "default" : recipient.trim())
            .addValue("path", trimToNull(path))
            .addValue("payload", payload == null ? "{}" : payload.toString())
            .addValue("idempotencyKey", idempotencyKey.trim()));
    return changed == 0 ? null : id;
  }

  public NotificationFeed list(UUID appId, int limit) {
    int size = Math.max(1, Math.min(limit, 100));
    List<NotificationView> items = jdbc.query("""
        select id, app_id, type, title, body, link, biz_type, biz_id, created_at, read_at
        from lcp_notification
        where tenant_id = :tenant and app_id = :app and user_id = :user
        order by created_at desc
        limit :limit
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("user", user())
            .addValue("limit", size), NotificationService::map);
    return new NotificationFeed(items, unreadCount(appId));
  }

  public NotificationFeed listAll(int limit) {
    int size = Math.max(1, Math.min(limit, 100));
    List<NotificationView> items = jdbc.query("""
        select id, app_id, type, title, body, link, biz_type, biz_id, created_at, read_at
        from lcp_notification
        where tenant_id = :tenant and user_id = :user
        order by created_at desc
        limit :limit
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("user", user())
            .addValue("limit", size), NotificationService::map);
    return new NotificationFeed(items, unreadCountAll());
  }

  public long unreadCount(UUID appId) {
    Long count = jdbc.queryForObject("""
        select count(*) from lcp_notification
        where tenant_id = :tenant and app_id = :app and user_id = :user and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("user", user()), Long.class);
    return count == null ? 0 : count;
  }

  public long unreadCountAll() {
    Long count = jdbc.queryForObject("""
        select count(*) from lcp_notification
        where tenant_id = :tenant and user_id = :user and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("user", user()), Long.class);
    return count == null ? 0 : count;
  }

  public NotificationView markRead(UUID appId, UUID id) {
    jdbc.update("""
        update lcp_notification set read_at = now()
        where tenant_id = :tenant and app_id = :app and user_id = :user
          and id = :id and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("user", user())
            .addValue("id", id));
    List<NotificationView> rows = jdbc.query("""
        select id, app_id, type, title, body, link, biz_type, biz_id, created_at, read_at
        from lcp_notification
        where tenant_id = :tenant and app_id = :app and user_id = :user and id = :id
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("user", user())
            .addValue("id", id), NotificationService::map);
    if (rows.isEmpty()) {
      throw PlatformException.notFound("通知 " + id + " 不存在");
    }
    return rows.get(0);
  }

  public NotificationView markRead(UUID id) {
    jdbc.update("""
        update lcp_notification set read_at = now()
        where tenant_id = :tenant and user_id = :user and id = :id and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("user", user())
            .addValue("id", id));
    List<NotificationView> rows = jdbc.query("""
        select id, app_id, type, title, body, link, biz_type, biz_id, created_at, read_at
        from lcp_notification
        where tenant_id = :tenant and user_id = :user and id = :id
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("user", user())
            .addValue("id", id), NotificationService::map);
    if (rows.isEmpty()) {
      throw PlatformException.notFound("通知 " + id + " 不存在");
    }
    return rows.get(0);
  }

  public NotificationReadResult markAllRead(UUID appId) {
    int updated = jdbc.update("""
        update lcp_notification set read_at = now()
        where tenant_id = :tenant and app_id = :app and user_id = :user and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("app", appId)
            .addValue("user", user()));
    return new NotificationReadResult(updated, 0);
  }

  public NotificationReadResult markAllRead() {
    int updated = jdbc.update("""
        update lcp_notification set read_at = now()
        where tenant_id = :tenant and user_id = :user and read_at is null
        """, new MapSqlParameterSource()
            .addValue("tenant", tenant())
            .addValue("user", user()));
    return new NotificationReadResult(updated, 0);
  }

  private static NotificationView map(ResultSet rs, int rowNum) throws SQLException {
    Timestamp readAt = rs.getTimestamp("read_at");
    return new NotificationView(
        rs.getString("id"),
        rs.getString("app_id"),
        rs.getString("type"),
        rs.getString("title"),
        rs.getString("body"),
        rs.getString("link"),
        rs.getString("biz_type"),
        rs.getString("biz_id"),
        at(rs.getTimestamp("created_at")),
        at(readAt),
        readAt != null);
  }

  private static OffsetDateTime at(Timestamp value) {
    return value == null ? null : value.toInstant().atZone(ZONE).toOffsetDateTime();
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return tenant;
  }

  private static String user() {
    String user = TenantContext.userId();
    return user == null || user.isBlank() ? "anonymous" : user;
  }
}
