package dev.lcp.bff.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.identity.RoleSyncService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.engine.ExpressionEngine;
import dev.lcp.bff.tenant.TenantContext;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 发布件权限求值。角色定义与授权都来自 Bundle；组织表只决定「谁拥有哪个角色」。
 * 行级条件用 ExpressionEngine 求值，字段白名单取并集。
 */
@Service
public class PermissionService {

  private final PublishedBundleService bundles;
  private final IdentityService identity;
  private final RoleSyncService roles;
  private final ExpressionEngine expressions;
  private final ObjectMapper json;

  public PermissionService(
      PublishedBundleService bundles,
      IdentityService identity,
      RoleSyncService roles,
      ExpressionEngine expressions,
      ObjectMapper json) {
    this.bundles = bundles;
    this.identity = identity;
    this.roles = roles;
    this.expressions = expressions;
    this.json = json;
  }

  public record Grant(
      String roleKey,
      String resourceType,
      String resource,
      Set<String> actions,
      Set<String> fields,
      boolean fieldsRestricted,
      JsonNode condition,
      String dataScope,
      JsonNode customRule) {
  }

  public record Access(UUID appId, String resourceType, String resource, List<Grant> grants) {
  }

  // ------------------------------------------------------------ 资源级授权

  public Access access(UUID appId, String resourceType, String resource) {
    PublishedBundle published = bundles.load(appId);
    roles.syncIfNeeded(appId, published.versionNo(), published.content());
    JsonNode bundle = published.content();
    Set<String> effective = effectiveRoles(appId, bundle);
    List<Grant> grants = new ArrayList<>();
    for (JsonNode permission : bundle.path("artifacts").path("permissions")) {
      String roleKey = permission.path("roleKey").asText(null);
      if (roleKey == null || !effective.contains(roleKey)) {
        continue;
      }
      String grantType = permission.path("resourceType").asText("entity");
      String grantResource = permission.path("resource").asText("");
      if (!matches(grantType, grantResource, resourceType, resource)) {
        continue;
      }
      JsonNode role = findRole(bundle, roleKey);
      Set<String> actions = new LinkedHashSet<>();
      for (JsonNode action : permission.path("actions")) {
        actions.add(action.asText());
      }
      Set<String> fields = new LinkedHashSet<>();
      boolean restricted = permission.has("fields") && permission.get("fields").size() > 0;
      if (restricted) {
        for (JsonNode field : permission.path("fields")) {
          fields.add(field.asText());
        }
      }
      grants.add(new Grant(roleKey, grantType, grantResource, actions, fields, restricted,
          permission.get("condition"),
          role == null ? "self" : role.path("dataScope").asText("self"),
          role == null ? null : role.get("customRule")));
    }
    return new Access(appId, resourceType, resource, grants);
  }

  public boolean can(UUID appId, String resourceType, String resource, String action) {
    for (Grant grant : access(appId, resourceType, resource).grants()) {
      if (allows(grant, action)) {
        return true;
      }
    }
    return false;
  }

  public void require(UUID appId, String resourceType, String resource, String action) {
    if (!can(appId, resourceType, resource, action)) {
      throw PlatformException.forbidden("无权执行 " + resourceType + ":" + resource + " 的 " + action);
    }
  }

  /** 动作编排资源同时兼容 leave_submit 与 action:leave_submit 两种写法。 */
  public boolean canAction(UUID appId, String actionKey, String action) {
    if (actionKey == null || actionKey.isBlank()) {
      return false;
    }
    String key = actionKey.trim();
    Access access = access(appId, "action", key);
    if (hasAction(access, action)) {
      return true;
    }
    Access prefixed = access(appId, "action", "action:" + key);
    if (hasAction(prefixed, action)) {
      return true;
    }
    Access wildcard = access(appId, "all", "*");
    return hasAction(wildcard, action);
  }

  /** 流程办理：显式动作优先，execute 视为该动作资源的通用执行权。 */
  public boolean canFlowAction(UUID appId, String actionKey, String action) {
    return canAction(appId, actionKey, action) || canAction(appId, actionKey, "execute");
  }

  public void requireAction(UUID appId, String actionKey, String action) {
    if (!canAction(appId, actionKey, action)) {
      throw PlatformException.forbidden("无权执行动作 " + actionKey);
    }
  }

  public void requireFlowAction(UUID appId, String actionKey, String action) {
    if (!canFlowAction(appId, actionKey, action)) {
      throw PlatformException.forbidden("无权执行审批动作 " + action);
    }
  }

  private boolean hasAction(Access access, String action) {
    for (Grant grant : access.grants()) {
      if (allows(grant, action)) {
        return true;
      }
    }
    return false;
  }

  private static boolean allows(Grant grant, String action) {
    return grant.actions().contains("*") || grant.actions().contains(action);
  }

  private static boolean matches(String grantType, String grantResource,
      String resourceType, String resource) {
    boolean typeMatch = "all".equals(grantType) || grantType.equals(resourceType);
    if (!typeMatch) {
      return false;
    }
    if ("*".equals(grantResource)) {
      return true;
    }
    if (grantResource.equals(resource)) {
      return true;
    }
    if ("action".equals(resourceType) && grantResource.equals("action:" + resource)) {
      return true;
    }
    if ("action".equals(resourceType) && ("action:" + grantResource).equals(resource)) {
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 行级与字段级

  public boolean canReadRow(UUID appId, String entityKey, Map<String, Object> row) {
    return rowAllowed(appId, entityKey, "read", row);
  }

  public void requireReadRow(UUID appId, String entityKey, Map<String, Object> row) {
    if (!canReadRow(appId, entityKey, row)) {
      throw PlatformException.forbidden("无权查看该业务数据");
    }
  }

  public boolean rowAllowed(UUID appId, String entityKey, String action, Map<String, Object> row) {
    if (row == null) {
      return false;
    }
    for (Grant grant : access(appId, "entity", entityKey).grants()) {
      if (!allows(grant, action) && !allows(grant, "read")) {
        continue;
      }
      if (scopeAllows(grant, row) && conditionAllows(grant, row)) {
        return true;
      }
    }
    return false;
  }

  /** null 表示不限制字段；否则返回允许的字段集合。 */
  public Set<String> readableFields(UUID appId, String entityKey) {
    return fields(appId, entityKey, "read");
  }

  public Set<String> fields(UUID appId, String entityKey, String action) {
    Set<String> union = new LinkedHashSet<>();
    boolean any = false;
    for (Grant grant : access(appId, "entity", entityKey).grants()) {
      if (!allows(grant, action)) {
        continue;
      }
      any = true;
      if (!grant.fieldsRestricted()) {
        return null;
      }
      union.addAll(grant.fields());
    }
    return any ? union : Set.of();
  }

  public Map<String, Object> filterFields(UUID appId, String entityKey, Map<String, Object> row) {
    Set<String> allowed = readableFields(appId, entityKey);
    if (allowed == null || row == null) {
      return row;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : row.entrySet()) {
      if (allowed.contains(entry.getKey()) || entry.getKey().startsWith("__")) {
        out.put(entry.getKey(), entry.getValue());
      }
    }
    return out;
  }

  private boolean scopeAllows(Grant grant, Map<String, Object> row) {
    String userId = TenantContext.userId();
    String userDept = userDeptId();
    List<String> deptIds = userDeptIds();
    return switch (grant.dataScope()) {
      case "all" -> true;
      case "none" -> false;
      case "self" -> selfRow(row, userId);
      case "dept" -> userDept != null && userDept.equals(text(row.get("dept_id")));
      case "deptAndChildren" -> {
        String dept = text(row.get("dept_id"));
        yield dept != null && deptIds.contains(dept);
      }
      case "custom" -> grant.customRule() != null
          && evaluate(grant.customRule(), row);
      default -> false;
    };
  }

  private boolean conditionAllows(Grant grant, Map<String, Object> row) {
    return grant.condition() == null || evaluate(grant.condition(), row);
  }

  private boolean evaluate(JsonNode expression, Map<String, Object> row) {
    try {
      ExpressionEngine.Scope scope = expressions.newScope(Map.of(
          "row", json.valueToTree(row),
          "user", userRoot(),
          "tenant", tenantRoot()));
      return expressions.truthy(expressions.eval(expression, scope));
    } catch (RuntimeException ex) {
      return false;
    }
  }

  private static boolean selfRow(Map<String, Object> row, String userId) {
    if (userId == null) {
      return false;
    }
    for (String key : List.of("applicant_id", "created_by", "user_id", "owner_id")) {
      if (row.containsKey(key) && userId.equals(text(row.get(key)))) {
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ 用户上下文

  public Set<String> effectiveRoles(UUID appId, JsonNode bundle) {
    Set<String> assigned = identity.appRoleKeys(TenantContext.userId(), appId);
    Set<String> effective = new LinkedHashSet<>(assigned);
    Deque<String> queue = new ArrayDeque<>(assigned);
    while (!queue.isEmpty()) {
      JsonNode role = findRole(bundle, queue.poll());
      if (role == null) {
        continue;
      }
      for (JsonNode parent : role.path("inheritFrom")) {
        String key = parent.asText();
        if (key != null && !key.isBlank() && effective.add(key)) {
          queue.add(key);
        }
      }
    }
    return effective;
  }

  public ObjectNode userRoot() {
    String tenant = TenantContext.tenantId();
    String userId = TenantContext.userId();
    var profile = identity.profile(userId);
    ObjectNode user = json.createObjectNode();
    user.put("id", userId);
    user.put("userId", userId);
    user.put("tenantId", tenant);
    if (profile != null) {
      user.put("userName", profile.username());
      user.put("username", profile.username());
      user.put("displayName", profile.displayName());
      user.put("deptId", profile.deptId());
      ArrayNode deptIds = user.putArray("deptIds");
      for (String dept : identity.deptSubtreeIds(profile.deptId())) {
        deptIds.add(dept);
      }
      ArrayNode roleKeys = user.putArray("roleKeys");
      for (String role : profile.roleKeys()) {
        roleKeys.add(role);
      }
    } else {
      user.put("userName", userId);
      user.put("displayName", userId);
      user.putNull("deptId");
      user.putArray("deptIds");
      user.putArray("roleKeys");
    }
    return user;
  }

  public ObjectNode tenantRoot() {
    ObjectNode tenant = json.createObjectNode();
    tenant.put("id", TenantContext.tenantId());
    tenant.put("tenantId", TenantContext.tenantId());
    return tenant;
  }

  private String userDeptId() {
    var profile = identity.profile(TenantContext.userId());
    return profile == null ? null : profile.deptId();
  }

  private List<String> userDeptIds() {
    var profile = identity.profile(TenantContext.userId());
    return profile == null ? List.of() : identity.deptSubtreeIds(profile.deptId());
  }

  private static JsonNode findRole(JsonNode bundle, String roleKey) {
    for (JsonNode role : bundle.path("artifacts").path("roles")) {
      if (roleKey.equals(role.path("key").asText())) {
        return role;
      }
    }
    return null;
  }

  private static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }
}