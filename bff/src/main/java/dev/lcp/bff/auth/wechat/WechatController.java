package dev.lcp.bff.auth.wechat;

import dev.lcp.bff.auth.AuthService.LoginResult;
import dev.lcp.bff.auth.wechat.WechatService.ConfigView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 小程序微信登录。配置接口只暴露 AppID 与租户，不返回 AppSecret。 */
@RestController
@RequestMapping("/api/v1/auth/wechat")
public class WechatController {

  private final WechatService wechat;

  public WechatController(WechatService wechat) {
    this.wechat = wechat;
  }

  @GetMapping("/config")
  public ConfigView config() {
    return wechat.config();
  }

  @PostMapping("/login")
  public LoginResult login(@RequestBody WechatLoginRequest request, HttpServletRequest http) {
    return wechat.login(
        request == null ? null : request.code(),
        request == null ? null : request.tenant(),
        clientIp(http), http.getHeader("User-Agent"));
  }

  public record WechatLoginRequest(String code, String tenant) {
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