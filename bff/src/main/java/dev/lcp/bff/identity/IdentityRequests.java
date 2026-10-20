package dev.lcp.bff.identity;

import java.util.List;
import java.util.UUID;

/** 组织与身份 API 的请求体。 */
public final class IdentityRequests {

  private IdentityRequests() {
  }

  public record DepartmentRequest(
      String id,
      String key,
      String name,
      String parentId,
      Integer sort,
      String leaderUserId,
      Boolean enabled) {
  }

  public record PositionRequest(
      String id,
      String key,
      String name,
      String deptId,
      Integer sort,
      Boolean enabled) {
  }

  public record UserRequest(
      String id,
      String username,
      String displayName,
      String email,
      String phone,
      String password,
      String deptId,
      String positionId,
      String status,
      UUID appId,
      List<String> roleKeys) {
  }

  public record UserRolesRequest(UUID appId, List<String> roleKeys) {
  }
}