package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.tenant.TenantContext;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 运行时办理人解析。优先查组织模型：部门负责人取本部门或最近上级负责人；
 * 角色取该应用下拥有对应角色的启用用户。查不到时回退到演示配置，避免旧流程断链。
 */
@Component
public class RuntimeUserDirectory {

  private final NamedParameterJdbcTemplate jdbc;
  private final boolean fallback;
  private final String deptLeaderUser;
  private final String schoolAdminUser;

  public RuntimeUserDirectory(
      NamedParameterJdbcTemplate jdbc,
      @Value("${lcp.runtime.fallback-directory:true}") boolean fallback,
      @Value("${lcp.runtime.dept-leader-user:bob}") String deptLeaderUser,
      @Value("${lcp.runtime.school-admin-user:principal}") String schoolAdminUser) {
    this.jdbc = jdbc;
    this.fallback = fallback;
    this.deptLeaderUser = deptLeaderUser;
    this.schoolAdminUser = schoolAdminUser;
  }

  public String resolve(UUID appId, String type, JsonNode spec, Map<String, Object> business) {
    String applicantId = text(business == null ? null : business.get("applicant_id"));
    if (applicantId == null) {
      JsonNode applicant = spec.path("applicantId");
      applicantId = applicant.isTextual() ? applicant.asText() : null;
    }
    String deptId = text(business == null ? null : business.get("dept_id"));
    if (type == null) {
      return null;
    }
    return switch (type) {
      case "initiator" -> applicantId;
      case "deptLeader" -> deptLeader(deptId);
      case "roleInDept" -> roleUser(appId, values(spec), deptId, true);
      case "role" -> roleUser(appId, values(spec), null, false);
      case "user" -> firstValue(spec);
      default -> null;
    };
  }

  public String deptLeader(String deptId) {
    String current = deptId;
    int guard = 0;
    while (current != null && guard++ < 12) {
      List<Map<String, Object>> rows = jdbc.queryForList("""
          select id, parent_id, leader_user_id
            from lcp_department
           where tenant_id = :tenant and id = :id
          """, params().addValue("id", current));
      if (rows.isEmpty()) {
        break;
      }
      Map<String, Object> row = rows.get(0);
      String leader = text(row.get("leader_user_id"));
      if (leader != null && activeUser(leader)) {
        return leader;
      }
      current = text(row.get("parent_id"));
    }
    return fallback ? deptLeaderUser : null;
  }

  private String roleUser(UUID appId, Set<String> roleKeys, String deptId, boolean inDept) {
    if (roleKeys.isEmpty()) {
      return null;
    }
    MapSqlParameterSource params = params().addValue("roles", roleKeys);
    StringBuilder sql = new StringBuilder("""
        select u.id
          from lcp_user_role r
          join lcp_user u on u.tenant_id = r.tenant_id and u.id = r.user_id
         where r.tenant_id = :tenant and u.status = 'active'
           and r.role_key in (:roles)
        """);
    if (appId != null) {
      sql.append(" and (r.app_id = :app or r.app_id is null)");
      params.addValue("app", appId);
    }
    if (inDept && deptId != null) {
      sql.append("""
           and u.dept_id in (
             select c.id from lcp_department c
              join lcp_department d on d.tenant_id = c.tenant_id and d.id = :dept
              where c.tenant_id = :tenant
                and (c.id = :dept or c.path like d.path || '/%')
           )
          """);
      params.addValue("dept", deptId);
    }
    sql.append(" order by u.created_at, u.id limit 1");
    List<String> users = jdbc.queryForList(sql.toString(), params, String.class);
    if (!users.isEmpty()) {
      return users.get(0);
    }
    if (!fallback) {
      return null;
    }
    for (String role : roleKeys) {
      String demo = switch (role) {
        case "dept_manager" -> deptLeaderUser;
        case "school_admin" -> schoolAdminUser;
        default -> null;
      };
      if (demo != null) {
        return demo;
      }
    }
    return null;
  }

  private boolean activeUser(String userId) {
    Integer count = jdbc.queryForObject("""
        select count(*) from lcp_user
         where tenant_id = :tenant and id = :id and status = 'active'
        """, params().addValue("id", userId), Integer.class);
    return count != null && count > 0;
  }

  private Set<String> values(JsonNode spec) {
    Set<String> out = new LinkedHashSet<>();
    for (JsonNode item : spec.path("values")) {
      if (item.isTextual() && !item.asText().isBlank()) {
        out.add(item.asText());
      }
    }
    return out;
  }

  private static String firstValue(JsonNode spec) {
    for (JsonNode item : spec.path("values")) {
      if (item.isTextual() && !item.asText().isBlank()) {
        return item.asText();
      }
    }
    return null;
  }

  private MapSqlParameterSource params() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return new MapSqlParameterSource("tenant", tenant);
  }

  private static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }
}