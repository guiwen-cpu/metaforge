package dev.lcp.bff.auth;

import dev.lcp.bff.auth.JwtService.Claims;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.identity.IdentityViews.UserView;
import dev.lcp.bff.tenant.TenantContext;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 登录、会话与当前用户。密码只校验哈希，权限不在令牌里固化。 */
@Service
public class AuthService {

  private final NamedParameterJdbcTemplate jdbc;
  private final JdbcTemplate plainJdbc;
  private final TransactionTemplate transactions;
  private final JwtService jwt;
  private final IdentityService identity;

  public AuthService(
      NamedParameterJdbcTemplate jdbc,
      JdbcTemplate plainJdbc,
      TransactionTemplate transactions,
      JwtService jwt,
      IdentityService identity) {
    this.jdbc = jdbc;
    this.plainJdbc = plainJdbc;
    this.transactions = transactions;
    this.jwt = jwt;
    this.identity = identity;
  }

  public record LoginResult(String token, Instant expiresAt, UserView user) {
  }

  public LoginResult login(String tenant, String username, String password) {
    String tenantId = trim(tenant);
    String loginName = trim(username);
    if (tenantId == null || loginName == null || password == null || password.isBlank()) {
      throw AuthException.unauthorized("租户、用户名与密码不能为空");
    }
    Map<String, Object> account = inTenant(tenantId, "anonymous", () -> {
      List<Map<String, Object>> rows = jdbc.queryForList("""
          select id, username, display_name, password_hash, status
            from lcp_user
           where tenant_id = :tenant and username = :username
          """, new MapSqlParameterSource("tenant", tenantId).addValue("username", loginName));
      return rows.isEmpty() ? null : rows.get(0);
    });
    if (account == null
        || !"active".equals(String.valueOf(account.get("status")))
        || !PasswordHasher.verify(password, String.valueOf(account.get("password_hash")))) {
      throw AuthException.unauthorized("用户名或密码不正确");
    }
    String userId = String.valueOf(account.get("id"));
    String displayName = String.valueOf(account.get("display_name"));
    UserView profile = inTenant(tenantId, userId, () -> identity.profile(userId));
    if (profile == null) {
      throw AuthException.unauthorized("用户不属于当前租户");
    }
    String token = jwt.issue(tenantId, userId, displayName);
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

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}