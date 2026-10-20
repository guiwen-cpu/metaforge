package dev.lcp.generated.leave_approval.server;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** 解析 Bearer 令牌；本地联调可用 X-Tenant-Id / X-User-Id，其余 API 一律 401。 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TenantSessionFilter extends OncePerRequestFilter {

  private final AuthTokenService tokens;
  private final boolean allowDevHeaders;

  public TenantSessionFilter(
      AuthTokenService tokens,
      @Value("${lcp.demo.dev-headers:true}") boolean allowDevHeaders) {
    this.tokens = tokens;
    this.allowDevHeaders = allowDevHeaders;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getRequestURI();
    if (!path.startsWith("/api/")) {
      chain.doFilter(request, response);
      return;
    }
    boolean authPath = path.startsWith("/api/v1/auth/");
    String authorization = request.getHeader("Authorization");
    String token = authorization != null && authorization.startsWith("Bearer ")
        ? authorization.substring(7).trim()
        : null;
    AuthTokenService.Session session = tokens.verify(token);
    if (session != null) {
      TenantContext.set(session.tenantId(), session.userId());
    } else if (allowDevHeaders) {
      String tenant = request.getHeader("X-Tenant-Id");
      String user = request.getHeader("X-User-Id");
      if (tenant != null && !tenant.isBlank()) {
        TenantContext.set(tenant.trim(), user == null || user.isBlank() ? "dev" : user.trim());
      }
    }
    try {
      if (authPath) {
        chain.doFilter(request, response);
        return;
      }
      if (TenantContext.tenantId() == null) {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"unauthorized\",\"message\":\"请先登录\"}");
        return;
      }
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
    }
  }
}
