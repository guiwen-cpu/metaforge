package dev.lcp.bff.auth;

import dev.lcp.bff.auth.AuthService.LoginResult;
import dev.lcp.bff.identity.IdentityViews.UserView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 登录、改密与会话接口。登录不需要令牌，其余接口由 TenantFilter 校验 Bearer。 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/login")
  public LoginResult login(@RequestBody LoginRequest request, HttpServletRequest http) {
    return auth.login(request == null ? null : request.tenant(),
        request == null ? null : request.username(),
        request == null ? null : request.password(),
        clientIp(http), http.getHeader("User-Agent"));
  }

  @GetMapping("/me")
  public UserView me() {
    return auth.me();
  }

  @GetMapping("/password-policy")
  public PasswordPolicy.PolicyView passwordPolicy() {
    return auth.passwordPolicy();
  }

  @PostMapping("/password")
  public UserView changePassword(
      @RequestBody PasswordChangeRequest request, HttpServletRequest http) {
    if (request == null) {
      throw AuthException.badRequest("password_required", "请填写当前密码与新密码");
    }
    return auth.changePassword(request.currentPassword(), request.newPassword(),
        clientIp(http), http.getHeader("User-Agent"));
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout() {
    return ResponseEntity.noContent().build();
  }

  public record LoginRequest(String tenant, String username, String password) {
  }

  public record PasswordChangeRequest(String currentPassword, String newPassword) {
  }

  private static String clientIp(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      return forwarded.split(",", 2)[0].trim();
    }
    String realIp = request.getHeader("X-Real-IP");
    if (realIp != null && !realIp.isBlank()) {
      return realIp.trim();
    }
    return request.getRemoteAddr();
  }
}