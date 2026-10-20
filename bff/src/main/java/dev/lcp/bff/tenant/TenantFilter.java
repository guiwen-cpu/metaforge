package dev.lcp.bff.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.auth.AuthException;
import dev.lcp.bff.auth.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 解析 Bearer JWT 并写入请求级租户上下文。
 *
 * <p>P0 兼容网关注入的 X-Tenant-Id / X-User-Id，但仅在显式开启
 * lcp.auth.dev-headers 时生效；生产环境应关闭并只信任 JWT。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantFilter extends OncePerRequestFilter {

  private final JwtService jwt;
  private final String tenantHeader;
  private final String userHeader;
  private final boolean devHeaders;
  private final ObjectMapper objectMapper;

  public TenantFilter(
      JwtService jwt,
      @Value("${lcp.tenant.header:X-Tenant-Id}") String tenantHeader,
      @Value("${lcp.user.header:X-User-Id}") String userHeader,
      @Value("${lcp.auth.dev-headers:false}") boolean devHeaders,
      ObjectMapper objectMapper) {
    this.jwt = jwt;
    this.tenantHeader = tenantHeader;
    this.userHeader = userHeader;
    this.devHeaders = devHeaders;
    this.objectMapper = objectMapper;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/api/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String uri = request.getRequestURI();
    boolean login = "/api/v1/auth/login".equals(uri);
    String authorization = request.getHeader("Authorization");
    String token = bearer(authorization);

    if (token != null) {
      try {
        JwtService.Claims claims = jwt.verify(token);
        TenantContext.set(claims.tenantId(), claims.userId());
      } catch (AuthException ex) {
        unauthorized(response, ex.getMessage());
        return;
      }
    } else if (login) {
      String tenant = trimToNull(request.getHeader(tenantHeader));
      TenantContext.set(tenant, "anonymous");
    } else if (devHeaders) {
      String tenant = trimToNull(request.getHeader(tenantHeader));
      if (tenant == null) {
        badRequest(response, "缺少租户上下文，请通过网关注入 " + tenantHeader);
        return;
      }
      String user = trimToNull(request.getHeader(userHeader));
      TenantContext.set(tenant, user == null ? "anonymous" : user);
    } else {
      unauthorized(response, "请先登录");
      return;
    }

    try {
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
    }
  }

  private static String bearer(String authorization) {
    if (authorization == null) {
      return null;
    }
    String value = authorization.trim();
    if (!value.regionMatches(true, 0, "Bearer ", 0, 7)) {
      return null;
    }
    String token = value.substring(7).trim();
    return token.isEmpty() ? null : token;
  }

  private void unauthorized(HttpServletResponse response, String message) throws IOException {
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json;charset=UTF-8");
    objectMapper.writeValue(response.getWriter(), Map.of(
        "code", "unauthorized",
        "message", message == null ? "请先登录" : message));
  }

  private void badRequest(HttpServletResponse response, String message) throws IOException {
    response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
    response.setContentType("application/json;charset=UTF-8");
    objectMapper.writeValue(response.getWriter(), Map.of(
        "code", "tenant_required",
        "message", message));
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
