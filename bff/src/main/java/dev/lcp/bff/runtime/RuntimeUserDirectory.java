package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 运行时演示用办理人目录。阶段 5 接入组织模型后，这里替换为真正的角色 / 部门解析。
 */
@Component
public class RuntimeUserDirectory {

  private final String deptLeaderUser;
  private final String schoolAdminUser;

  public RuntimeUserDirectory(
      @Value("${lcp.runtime.dept-leader-user:bob}") String deptLeaderUser,
      @Value("${lcp.runtime.school-admin-user:principal}") String schoolAdminUser) {
    this.deptLeaderUser = deptLeaderUser;
    this.schoolAdminUser = schoolAdminUser;
  }

  public String userForRole(String role) {
    if (role == null) {
      return null;
    }
    return switch (role) {
      case "dept_manager" -> deptLeaderUser;
      case "school_admin" -> schoolAdminUser;
      default -> null;
    };
  }

  public String resolve(String type, JsonNode spec, Object applicantId) {
    if ("initiator".equals(type)) {
      return applicantId == null ? null : String.valueOf(applicantId);
    }
    if ("deptLeader".equals(type)) {
      return deptLeaderUser;
    }
    if ("roleInDept".equals(type) || "role".equals(type)) {
      for (JsonNode role : spec.path("values")) {
        String user = userForRole(role.asText());
        if (user != null) {
          return user;
        }
      }
    }
    if ("user".equals(type)) {
      JsonNode values = spec.path("values");
      return values.size() > 0 ? values.get(0).asText() : null;
    }
    return null;
  }

  public String deptLeaderUser() {
    return deptLeaderUser;
  }

  public String schoolAdminUser() {
    return schoolAdminUser;
  }
}
