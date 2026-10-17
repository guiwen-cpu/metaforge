package dev.lcp.generated.leave_approval.api.support;

/**
 * 当前请求主体。平台侧实现（从会话 / JWT 解析后注入），出码侧只依赖这个接口。
 *
 * 租户与操作人永远来自服务端上下文：请求体或查询参数里即使带了 tenant_id / created_by，
 * runtime 也一律忽略，并用这里返回的值覆盖。
 */
public interface LcpPrincipal {

  String tenantId();

  String userId();
}
