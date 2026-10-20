package dev.lcp.generated.leave_approval.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 独立工程的演示身份入口。账号由 Bundle 角色生成，密码统一走环境变量；
 * 生产部署应换成身份中心 / SSO，业务 CRUD 不需要改动。
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private static final Map<String, String> ROLES = Map.ofEntries(
        Map.entry("student", "学生"),
        Map.entry("teacher", "教职工"),
        Map.entry("dept_manager", "部门负责人"),
        Map.entry("school_admin", "院级管理员"),
        Map.entry("hr_admin", "人事专员"),
        Map.entry("system", "系统")
  );

  private final AuthTokenService tokens;
  private final String expectedTenant;
  private final String password;
  private final long ttlHours;

  public AuthController(
      AuthTokenService tokens,
      @Value("${lcp.demo.tenant:tenant_demo_school}") String expectedTenant,
      @Value("${lcp.demo.password:demo123}") String password,
      @Value("${lcp.demo.token-ttl-hours:12}") long ttlHours) {
    this.tokens = tokens;
    this.expectedTenant = expectedTenant;
    this.password = password;
    this.ttlHours = ttlHours;
  }

  @PostMapping("/login")
  public Map<String, Object> login(@RequestBody LoginRequest body) {
    if (body == null || body.tenant() == null || !expectedTenant.equals(body.tenant().trim())) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "租户或账号不正确");
    }
    String username = body.username() == null ? "" : body.username().trim();
    boolean known = "admin".equals(username) || ROLES.containsKey(username);
    boolean matched = body.password() != null
        && MessageDigest.isEqual(
            password.getBytes(StandardCharsets.UTF_8),
            body.password().getBytes(StandardCharsets.UTF_8));
    if (!known || !matched) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "租户或账号不正确");
    }
    Instant expiry = Instant.now().plus(ttlHours, ChronoUnit.HOURS);
    String token = tokens.issue(expectedTenant, username, expiry);
    return Map.of(
        "token", token,
        "expires_at", OffsetDateTime.now().plusHours(ttlHours).toString(),
        "user", userOf(username));
  }

  @GetMapping("/me")
  public Map<String, Object> me() {
    String user = TenantContext.userId();
    if (user == null || user.isBlank()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "未登录");
    }
    return userOf(user);
  }

  private Map<String, Object> userOf(String username) {
    boolean admin = "admin".equals(username);
    List<String> roles = admin ? new ArrayList<>(ROLES.keySet()) : List.of(username);
    List<Map<String, String>> roleViews = new ArrayList<>();
    for (String role : roles) {
      roleViews.add(Map.of("role_key", role, "role_name", ROLES.getOrDefault(role, "管理员")));
    }
    Map<String, Object> user = new LinkedHashMap<>();
    user.put("id", username);
    user.put("username", username);
    user.put("display_name", admin ? "演示管理员" : ROLES.getOrDefault(username, username));
    user.put("dept_id", null);
    user.put("dept_name", admin ? "平台演示" : "演示部门");
    user.put("role_keys", roles);
    user.put("roles", roleViews);
    return user;
  }

  public record LoginRequest(String tenant, String username, String password) {}
}
