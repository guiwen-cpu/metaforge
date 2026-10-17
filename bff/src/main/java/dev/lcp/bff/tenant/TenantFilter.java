package dev.lcp.bff.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
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
 * 解析租户与操作人。
 *
 * <p>P0 从网关注入的请求头读取；生产环境必须由网关在 JWT/SSO 校验后覆盖这两个头，
 * 不能让浏览器直传。后续替换为 JWT 解析时，只需改这里。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantFilter extends OncePerRequestFilter {

  private final String tenantHeader;
  private final String userHeader;
  private final ObjectMapper objectMapper;

  public TenantFilter(
      @Value("${lcp.tenant.header:X-Tenant-Id}") String tenantHeader,
      @Value("${lcp.user.header:X-User-Id}") String userHeader,
      ObjectMapper objectMapper) {
    this.tenantHeader = tenantHeader;
    this.userHeader = userHeader;
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
    String tenantId = trimToNull(request.getHeader(tenantHeader));
    if (tenantId == null) {
      response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
      response.setContentType("application/json;charset=UTF-8");
      objectMapper.writeValue(response.getWriter(), Map.of(
          "code", "tenant_required",
          "message", "缺少租户上下文，请通过网关注入 " + tenantHeader));
      return;
    }
    String userId = trimToNull(request.getHeader(userHeader));
    TenantContext.set(tenantId, userId == null ? "anonymous" : userId);
    try {
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
    }
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
