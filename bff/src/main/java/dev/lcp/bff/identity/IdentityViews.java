package dev.lcp.bff.identity;

import java.time.Instant;
import java.util.List;

/** 组织与身份 API 的响应体。字段名统一由 Jackson SNAKE_CASE 输出。 */
public final class IdentityViews {

  private IdentityViews() {
  }

  public record DepartmentView(
      String id,
      String key,
      String name,
      String parentId,
      String path,
      int sort,
      String leaderUserId,
      String leaderName,
      boolean enabled) {
  }

  public record PositionView(
      String id,
      String key,
      String name,
      String deptId,
      String deptName,
      int sort,
      boolean enabled) {
  }

  public record UserRoleView(
      String appId,
      String appKey,
      String roleKey,
      String roleName) {
  }

  public record UserView(
      String id,
      String username,
      String displayName,
      String email,
      String phone,
      String deptId,
      String deptName,
      String positionId,
      String positionName,
      String status,
      List<String> roleKeys,
      List<UserRoleView> roles) {
  }

  public record RoleView(
      String id,
      String key,
      String name,
      String level,
      String dataScope,
      boolean builtin,
      String description,
      String appId) {
  }

  public record AuthAuditView(
      String id,
      String userId,
      String username,
      String eventType,
      boolean success,
      String reason,
      String authMethod,
      String ip,
      String userAgent,
      Instant createdAt) {
  }

  public record OverviewView(
      List<DepartmentView> departments,
      List<PositionView> positions,
      List<UserView> users,
      List<RoleView> roles) {
  }
}