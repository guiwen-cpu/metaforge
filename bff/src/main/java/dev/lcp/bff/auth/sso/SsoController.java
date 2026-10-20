package dev.lcp.bff.auth.sso;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 统一身份登录入口、提供方回调与一次性 ticket 兑换。 */
@RestController
@RequestMapping("/api/v1/auth/sso")
public class SsoController {

  private final SsoService sso;

  public SsoController(SsoService sso) {
    this.sso = sso;
  }

  @GetMapping("/config")
  public ResponseEntity<SsoService.ConfigView> config() {
    return ResponseEntity.ok()
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .body(sso.config());
  }

  @GetMapping("/start")
  public ResponseEntity<Void> start(
      @RequestParam(required = false) String redirect,
      HttpServletRequest request) {
    return redirect(sso.start(redirect, request));
  }

  @GetMapping("/callback")
  public ResponseEntity<Void> callback(
      @RequestParam(required = false) String code,
      @RequestParam(required = false) String ticket,
      @RequestParam(required = false) String state,
      HttpServletRequest request) {
    SsoService.CallbackResult result = sso.callback(
        code, ticket, state, clientIp(request), request.getHeader("User-Agent"));
    String location = sso.frontendBase(request) + sso.frontendCallback()
        + "#ticket=" + encode(result.ticket())
        + "&redirect=" + encode(result.redirect());
    return redirect(location);
  }

  @PostMapping("/exchange")
  public ResponseEntity<SsoService.ExchangeResult> exchange(
      @RequestBody(required = false) ExchangeRequest request) {
    return ResponseEntity.ok()
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .body(sso.exchange(request == null ? null : request.ticket()));
  }

  public record ExchangeRequest(String ticket) {
  }

  private static ResponseEntity<Void> redirect(String location) {
    return ResponseEntity.status(HttpStatus.FOUND)
        .header(HttpHeaders.LOCATION, location)
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header("Referrer-Policy", "no-referrer")
        .build();
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
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
