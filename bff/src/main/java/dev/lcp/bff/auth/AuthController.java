package dev.lcp.bff.auth;

import dev.lcp.bff.auth.AuthService.LoginResult;
import dev.lcp.bff.identity.IdentityViews.UserView;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 登录与会话接口。登录不需要令牌，其余接口由 TenantFilter 校验 Bearer。 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/login")
  public LoginResult login(@RequestBody LoginRequest request) {
    return auth.login(request == null ? null : request.tenant(),
        request == null ? null : request.username(),
        request == null ? null : request.password());
  }

  @GetMapping("/me")
  public UserView me() {
    return auth.me();
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout() {
    return ResponseEntity.noContent().build();
  }

  public record LoginRequest(String tenant, String username, String password) {
  }
}