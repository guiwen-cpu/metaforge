package dev.lcp.bff.auth;

import dev.lcp.bff.auth.JwtService.Claims;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.identity.IdentityViews.UserView;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 登录、改密、会话与当前用户。密码只校验哈希，权限不在令牌里固化。 */
@Service
public class AuthService {

  private final NamedParameterJdbcTemplate jdbc;
  private final JdbcTemplate plainJdbc;
  private final TransactionTemplate transactions;
  private final JwtService jwt;
  private final IdentityService identity;
  private final PasswordPolicy passwords;
  private final int maxFailedAttempts;
  private final int lockMinutes;

  public AuthService(
      NamedParameterJdbcTemplate jdbc,
      JdbcTemplate plainJdbc,
      TransactionTemplate transactions,
      JwtService jwt,
      IdentityService identity,
      PasswordPolicy passwords,
      @Value("${lcp.auth.lockout.max-failed-attempts:5}") int maxFailedAttempts,
      @Value("${lcp.auth.lockout.minutes:15}") int lockMinutes) {
    this.jdbc = jdbc;
    this.plainJdbc = plainJdbc;
    this.transactions = transactions;
    this.jwt = jwt;
    this.identity = identity;
    this.passwords = passwords;
    this.maxFailedAttempts = Math.max(1, maxFailedAttempts);
    this.lockMinutes = Math.max(1, lockMinutes);
  }

  public record LoginResult(String token, Instant expiresAt, UserView user) {
  }

  /** 外部 IdP 规范化后的身份；linkBy / autoCreate 决定首次登录如何落到本地账号。 */
  public record ExternalIdentity(
      String tenant,
      String provider,
      String subject,
      String username,
      String email,
      String displayName,
      String linkBy,
      boolean autoCreate) {
  }

  public PasswordPolicy.PolicyView passwordPolicy() {
    return passwords.view();
  }

  public LoginResult login(
      String tenant, String username, String password, String ip, String userAgent) {
    String tenantId = trim(tenant);
    String loginName = trim(username);
    if (tenantId == null || loginName == null || password == null || password.isBlank()) {
      throw AuthException.unauthorized("租户、用户名与密码不能为空");
    }
    Attempt attempt = inTenant(
        tenantId, "anonymous", () -> attemptLogin(tenantId, loginName, password, ip, userAgent));
    if (!attempt.success() || attempt.profile() == null) {
      throw AuthException.unauthorized("用户名或密码不正确，或账号已被临时锁定");
    }
    UserView profile = attempt.profile();
    String token = jwt.issue(tenantId, profile.id(), profile.displayName());
    Claims claims = jwt.verify(token);
    return new LoginResult(token, claims.expiresAt(), profile);
  }

  public UserView changePassword(String currentPassword, String newPassword, String ip,
      String userAgent) {
    String tenantId = TenantContext.tenantId();
    String userId = TenantContext.userId();
    if (tenantId == null || tenantId.isBlank() || userId == null || userId.isBlank()) {
      throw AuthException.unauthorized("缺少登录用户");
    }
    PasswordChange result = inTenant(tenantId, userId, () -> {
      List<Map<String, Object>> rows = jdbc.queryForList("""
          select id, username, display_name, password_hash, status
            from lcp_user
           where tenant_id = :tenant and id = :user
          """, params(tenantId).addValue("user", userId));
      if (rows.isEmpty()) {
        return new PasswordChange(false, null);
      }
      Map<String, Object> row = rows.get(0);
      String username = str(row.get("username"));
      String displayName = str(row.get("display_name"));
      boolean active = "active".equals(str(row.get("status")));
      if (!active || !PasswordHasher.verify(
          currentPassword, str(row.get("password_hash")))) {
        audit(tenantId, userId, username, "password_change", false, "bad_current_password",
            ip, userAgent);
        return new PasswordChange(false, null);
      }
      passwords.validate(newPassword, username, displayName);
      jdbc.update("""
          update lcp_user
             set password_hash = :hash,
                 password_changed_at = now(),
                 failed_login_count = 0,
                 locked_until = null,
                 updated_at = now()
           where tenant_id = :tenant and id = :user
          """, params(tenantId).addValue("user", userId)
          .addValue("hash", PasswordHasher.hash(newPassword)));
      audit(tenantId, userId, username, "password_change", true, null, ip, userAgent);
      return new PasswordChange(true, identity.profile(userId));
    });
    if (!result.success() || result.profile() == null) {
      throw AuthException.badRequest("password_change_failed", "当前密码不正确");
    }
    return result.profile();
  }

  public LoginResult loginExternal(
      ExternalIdentity external, String authMethod, String ip, String userAgent) {
    String tenant = trim(external == null ? null : external.tenant());
    String provider = trim(external == null ? null : external.provider());
    String subject = trim(external == null ? null : external.subject());
    if (tenant == null || provider == null || subject == null) {
      throw AuthException.badRequest("sso_identity_invalid",
          "统一身份缺少租户、提供方或用户标识");
    }
    ExternalIdentity normalized = new ExternalIdentity(
        tenant, provider, subject,
        limit(trim(external.username()), 128),
        limit(trim(external.email()), 256),
        limit(trim(external.displayName()), 128),
        external.linkBy(), external.autoCreate());
    Attempt attempt = inTenant(
        tenant, "anonymous",
        () -> attemptExternal(normalized, authMethod, ip, userAgent));
    if (!attempt.success() || attempt.profile() == null) {
      throw AuthException.forbidden("统一身份未绑定本地账号或账号不可用");
    }
    UserView profile = attempt.profile();
    String token = jwt.issue(tenant, profile.id(), profile.displayName());
    Claims claims = jwt.verify(token);
    return new LoginResult(token, claims.expiresAt(), profile);
  }

  public UserView me() {
    String userId = TenantContext.userId();
    if (userId == null || userId.isBlank()) {
      throw AuthException.unauthorized("缺少登录用户");
    }
    UserView profile = identity.profile(userId);
    if (profile == null) {
      throw AuthException.unauthorized("登录用户不存在或已被禁用");
    }
    if (!"active".equals(profile.status())) {
      throw AuthException.unauthorized("登录用户已被禁用");
    }
    return profile;
  }

  private Attempt attemptLogin(
      String tenant, String loginName, String password, String ip, String userAgent) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
        select id, username, display_name, password_hash, status,
               failed_login_count, locked_until
          from lcp_user
         where tenant_id = :tenant and username = :username
        """, params(tenant).addValue("username", loginName));
    if (rows.isEmpty()) {
      audit(tenant, null, loginName, "login_failure", false, "user_not_found", ip, userAgent);
      return new Attempt(false, null);
    }
    Map<String, Object> account = rows.get(0);
    String userId = str(account.get("id"));
    String username = str(account.get("username"));
    if (!"active".equals(str(account.get("status")))) {
      audit(tenant, userId, username, "login_failure", false, "user_disabled", ip, userAgent);
      return new Attempt(false, null);
    }
    Instant now = Instant.now();
    Instant lockedUntil = instant(account.get("locked_until"));
    if (lockedUntil != null && lockedUntil.isAfter(now)) {
      audit(tenant, userId, username, "login_failure", false, "account_locked", ip, userAgent);
      return new Attempt(false, null);
    }
    int failedCount = number(account.get("failed_login_count"));
    if (lockedUntil != null) {
      failedCount = 0;
    }
    if (!PasswordHasher.verify(password, str(account.get("password_hash")))) {
      int next = failedCount + 1;
      Timestamp lock = next >= maxFailedAttempts
          ? Timestamp.from(now.plus(lockMinutes, ChronoUnit.MINUTES)) : null;
      jdbc.update("""
          update lcp_user
             set failed_login_count = :failed,
                 locked_until = :locked,
                 updated_at = now()
           where tenant_id = :tenant and id = :user
          """, params(tenant).addValue("user", userId).addValue("failed", next)
          .addValue("locked", lock));
      audit(tenant, userId, username, "login_failure", false, "bad_password", ip, userAgent);
      return new Attempt(false, null);
    }
    jdbc.update("""
        update lcp_user
           set failed_login_count = 0,
               locked_until = null,
               last_login_at = now(),
               last_login_ip = :ip,
               updated_at = now()
         where tenant_id = :tenant and id = :user
        """, params(tenant).addValue("user", userId).addValue("ip", limit(ip, 128)));
    UserView profile = identity.profile(userId);
    if (profile == null) {
      audit(tenant, userId, username, "login_failure", false, "profile_missing", ip, userAgent);
      return new Attempt(false, null);
    }
    audit(tenant, userId, username, "login_success", true, null, ip, userAgent);
    return new Attempt(true, profile);
  }

  private Attempt attemptExternal(
      ExternalIdentity external, String authMethod, String ip, String userAgent) {
    Map<String, Object> account = boundAccount(external);
    if (account == null && linkable(external.linkBy())) {
      account = linkableAccount(external);
      if (account != null) {
        bind(external, str(account.get("id")));
      }
    }
    if (account == null && external.autoCreate()) {
      account = createExternalAccount(external);
    }
    if (account == null) {
      audit(external.tenant(), null, external.username(), "login_failure", false,
          "sso_user_not_found", ip, userAgent, authMethod);
      return new Attempt(false, null);
    }
    String userId = str(account.get("id"));
    String username = str(account.get("username"));
    if (!"active".equals(str(account.get("status")))) {
      audit(external.tenant(), userId, username, "login_failure", false,
          "user_disabled", ip, userAgent, authMethod);
      return new Attempt(false, null);
    }
    jdbc.update("""
        update lcp_user
           set last_login_at = now(),
               last_login_ip = :ip,
               updated_at = now()
         where tenant_id = :tenant and id = :user
        """, params(external.tenant()).addValue("user", userId).addValue("ip", limit(ip, 128)));
    UserView profile = identity.profile(userId);
    if (profile == null) {
      audit(external.tenant(), userId, username, "login_failure", false,
          "profile_missing", ip, userAgent, authMethod);
      return new Attempt(false, null);
    }
    audit(external.tenant(), userId, username, "login_success", true, null,
        ip, userAgent, authMethod);
    return new Attempt(true, profile);
  }

  private Map<String, Object> boundAccount(ExternalIdentity external) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
        select id, username, display_name, status
          from lcp_user
         where tenant_id = :tenant and sso_provider = :provider and sso_subject = :subject
        """, params(external.tenant()).addValue("provider", external.provider())
        .addValue("subject", external.subject()));
    return rows.isEmpty() ? null : rows.get(0);
  }

  private Map<String, Object> linkableAccount(ExternalIdentity external) {
    boolean byEmail = "email".equals(external.linkBy());
    String value = byEmail ? external.email() : external.username();
    if (value == null || value.isBlank()) {
      return null;
    }
    String column = byEmail ? "email" : "username";
    List<Map<String, Object>> rows = jdbc.queryForList("""
        select id, username, display_name, status
          from lcp_user
         where tenant_id = :tenant
           and lower(%s) = lower(:value)
           and (sso_subject is null or (sso_provider = :provider and sso_subject = :subject))
        """.formatted(column), params(external.tenant()).addValue("value", value)
        .addValue("provider", external.provider()).addValue("subject", external.subject()));
    return rows.isEmpty() ? null : rows.get(0);
  }

  private void bind(ExternalIdentity external, String userId) {
    jdbc.update("""
        update lcp_user
           set sso_provider = :provider,
               sso_subject = :subject,
               updated_at = now()
         where tenant_id = :tenant and id = :user
           and (sso_subject is null or (sso_provider = :provider and sso_subject = :subject))
        """, params(external.tenant()).addValue("user", userId)
        .addValue("provider", external.provider()).addValue("subject", external.subject()));
  }

  private Map<String, Object> createExternalAccount(ExternalIdentity external) {
    String base = external.username();
    if (base == null || base.isBlank()) {
      base = "sso_" + external.subject().replaceAll("[^A-Za-z0-9_-]", "_");
    }
    String displayName = external.displayName() == null || external.displayName().isBlank()
        ? base : external.displayName();
    for (int attempt = 0; attempt < 3; attempt++) {
      String username = attempt == 0 ? base : base + "_" + UUID.randomUUID().toString().substring(0, 6);
      String userId = "sso_" + UUID.randomUUID();
      try {
        jdbc.update("""
            insert into lcp_user
              (id, tenant_id, username, display_name, email, password_hash,
               status, sso_provider, sso_subject)
            values
              (:id, :tenant, :username, :display, :email, '!',
               'active', :provider, :subject)
            """, params(external.tenant()).addValue("id", userId)
            .addValue("username", limit(username, 128))
            .addValue("display", limit(displayName, 128))
            .addValue("email", external.email())
            .addValue("provider", external.provider())
            .addValue("subject", external.subject()));
        return accountById(external.tenant(), userId);
      } catch (DuplicateKeyException ex) {
        // 用户名竞争时追加随机后缀重试。
      }
    }
    return null;
  }

  private Map<String, Object> accountById(String tenant, String userId) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
        select id, username, display_name, status
          from lcp_user
         where tenant_id = :tenant and id = :user
        """, params(tenant).addValue("user", userId));
    return rows.isEmpty() ? null : rows.get(0);
  }

  private static boolean linkable(String linkBy) {
    return "username".equals(linkBy) || "email".equals(linkBy);
  }

  private void audit(
      String tenant, String userId, String username, String event, boolean success,
      String reason, String ip, String userAgent) {
    audit(tenant, userId, username, event, success, reason, ip, userAgent, "password");
  }

  private void audit(
      String tenant, String userId, String username, String event, boolean success,
      String reason, String ip, String userAgent, String authMethod) {
    jdbc.update("""
        insert into lcp_auth_audit
          (id, tenant_id, user_id, username, event_type, success, reason,
           auth_method, ip, user_agent)
        values
          (:id, :tenant, :user, :username, :event, :success, :reason,
           :method, :ip, :agent)
        """, new MapSqlParameterSource("id", UUID.randomUUID())
        .addValue("tenant", tenant)
        .addValue("user", userId)
        .addValue("username", username == null ? "" : username)
        .addValue("event", event)
        .addValue("success", success)
        .addValue("reason", reason)
        .addValue("method", authMethod == null || authMethod.isBlank() ? "password" : authMethod)
        .addValue("ip", limit(ip, 128))
        .addValue("agent", limit(userAgent, 512)));
  }

  private <T> T inTenant(String tenant, String userId, Supplier<T> action) {
    return transactions.execute(status -> {
      plainJdbc.queryForObject("select set_config('search_path', 'public,flowable', true)",
          String.class);
      plainJdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)", String.class, tenant);
      TenantContext.set(tenant, userId);
      try {
        return action.get();
      } finally {
        TenantContext.clear();
      }
    });
  }

  private MapSqlParameterSource params(String tenant) {
    return new MapSqlParameterSource("tenant", tenant);
  }

  private static Instant instant(Object value) {
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant();
    }
    if (value instanceof java.time.OffsetDateTime offset) {
      return offset.toInstant();
    }
    if (value instanceof Instant instant) {
      return instant;
    }
    return null;
  }

  private static int number(Object value) {
    return value instanceof Number number ? number.intValue() : 0;
  }

  private static String limit(String value, int length) {
    if (value == null) {
      return null;
    }
    return value.length() <= length ? value : value.substring(0, length);
  }

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String str(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private record Attempt(boolean success, UserView profile) {
  }

  private record PasswordChange(boolean success, UserView profile) {
  }
}
