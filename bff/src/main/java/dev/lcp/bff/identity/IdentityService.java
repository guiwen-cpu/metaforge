package dev.lcp.bff.identity;

import dev.lcp.bff.auth.PasswordHasher;
import dev.lcp.bff.identity.IdentityRequests.DepartmentRequest;
import dev.lcp.bff.identity.IdentityRequests.PositionRequest;
import dev.lcp.bff.identity.IdentityRequests.UserRequest;
import dev.lcp.bff.identity.IdentityViews.DepartmentView;
import dev.lcp.bff.identity.IdentityViews.OverviewView;
import dev.lcp.bff.identity.IdentityViews.PositionView;
import dev.lcp.bff.identity.IdentityViews.RoleView;
import dev.lcp.bff.identity.IdentityViews.UserRoleView;
import dev.lcp.bff.identity.IdentityViews.UserView;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.tenant.TenantContext;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 组织架构、用户与角色分配。应用角色定义来自发布件，本服务只维护租户侧的组织与授权关系。 */
@Service
public class IdentityService {

  private final NamedParameterJdbcTemplate jdbc;
  private final boolean allowAll;
  private final PublishedBundleService bundles;
  private final RoleSyncService roleSync;

  public IdentityService(
      NamedParameterJdbcTemplate jdbc,
      @Value("${lcp.identity.allow-all:false}") boolean allowAll,
      PublishedBundleService bundles,
      RoleSyncService roleSync) {
    this.jdbc = jdbc;
    this.allowAll = allowAll;
    this.bundles = bundles;
    this.roleSync = roleSync;
  }

  // ------------------------------------------------------------ 当前用户

  public UserView profile(String userId) {
    if (userId == null || userId.isBlank()) {
      return null;
    }
    List<Map<String, Object>> rows = jdbc.queryForList("""
        select u.id, u.username, u.display_name, u.email, u.phone, u.dept_id, u.status,
               d.name as dept_name, p.id as position_id, p.name as position_name
          from lcp_user u
          left join lcp_department d on d.tenant_id = u.tenant_id and d.id = u.dept_id
          left join lcp_position p on p.tenant_id = u.tenant_id and p.id = u.position_id
         where u.tenant_id = :tenant and u.id = :user
        """, params().addValue("user", userId));
    if (rows.isEmpty()) {
      return null;
    }
    Map<String, Object> row = rows.get(0);
    List<UserRoleView> roles = bindings(userId, null);
    Set<String> keys = new LinkedHashSet<>();
    for (UserRoleView role : roles) {
      keys.add(role.roleKey());
    }
    return new UserView(
        str(row.get("id")), str(row.get("username")), str(row.get("display_name")),
        str(row.get("email")), str(row.get("phone")),
        str(row.get("dept_id")), str(row.get("dept_name")),
        str(row.get("position_id")), str(row.get("position_name")),
        str(row.get("status")), List.copyOf(keys), roles);
  }

  public UserView requireProfile(String userId) {
    UserView profile = profile(userId);
    if (profile == null) {
      throw PlatformException.forbidden("当前用户未在租户组织中存在");
    }
    return profile;
  }

  public Set<String> roleKeys(String userId) {
    if (userId == null || userId.isBlank()) {
      return Set.of();
    }
    List<String> keys = jdbc.queryForList(
        "select distinct role_key from lcp_user_role where tenant_id = :tenant and user_id = :user",
        params().addValue("user", userId), String.class);
    return new LinkedHashSet<>(keys);
  }

  public Set<String> appRoleKeys(String userId, UUID appId) {
    if (userId == null || userId.isBlank()) {
      return Set.of();
    }
    List<String> keys = jdbc.queryForList("""
        select distinct role_key from lcp_user_role
         where tenant_id = :tenant and user_id = :user
           and (app_id = :app or app_id is null)
        """, params().addValue("user", userId).addValue("app", appId), String.class);
    return new LinkedHashSet<>(keys);
  }

  public List<String> deptSubtreeIds(String deptId) {
    if (deptId == null || deptId.isBlank()) {
      return List.of();
    }
    return jdbc.queryForList("""
        select c.id
          from lcp_department c
          join lcp_department d on d.tenant_id = c.tenant_id and d.id = :dept
         where c.tenant_id = :tenant
           and (c.id = :dept or c.path like d.path || '/%')
         order by c.path
        """, params().addValue("dept", deptId), String.class);
  }

  public void requireAdmin() {
    if (allowAll) {
      return;
    }
    UserView profile = profile(TenantContext.userId());
    if (profile == null) {
      throw PlatformException.forbidden("需要租户管理员权限");
    }
    Set<String> keys = Set.copyOf(profile.roleKeys());
    if (!keys.contains("tenant_admin") && !keys.contains("school_admin")) {
      throw PlatformException.forbidden("需要租户管理员权限");
    }
  }

  // ------------------------------------------------------------ 总览

  public OverviewView overview(UUID appId) {
    if (appId != null) {
      try {
        PublishedBundle published = bundles.load(appId);
        roleSync.sync(appId, published.content());
      } catch (RuntimeException ignored) {
        // 未发布的应没有角色可同步，总览仍展示租户级角色。
      }
    }
    List<DepartmentView> departments = jdbc.query("""
        select d.id, d.dept_key, d.name, d.parent_id, d.path, d.sort,
               d.leader_user_id, u.display_name as leader_name, d.enabled
          from lcp_department d
          left join lcp_user u on u.tenant_id = d.tenant_id and u.id = d.leader_user_id
         where d.tenant_id = :tenant
         order by d.path
        """, params(), (rs, row) -> new DepartmentView(
            rs.getString("id"), rs.getString("dept_key"), rs.getString("name"),
            rs.getString("parent_id"), rs.getString("path"), rs.getInt("sort"),
            rs.getString("leader_user_id"), rs.getString("leader_name"), rs.getBoolean("enabled")));

    List<PositionView> positions = jdbc.query("""
        select p.id, p.position_key, p.name, p.dept_id, d.name as dept_name, p.sort, p.enabled
          from lcp_position p
          left join lcp_department d on d.tenant_id = p.tenant_id and d.id = p.dept_id
         where p.tenant_id = :tenant
         order by p.sort, p.name
        """, params(), (rs, row) -> new PositionView(
            rs.getString("id"), rs.getString("position_key"), rs.getString("name"),
            rs.getString("dept_id"), rs.getString("dept_name"), rs.getInt("sort"),
            rs.getBoolean("enabled")));

    List<Map<String, Object>> userRows = jdbc.queryForList("""
        select u.id, u.username, u.display_name, u.email, u.phone, u.dept_id, u.status,
               d.name as dept_name, p.id as position_id, p.name as position_name
          from lcp_user u
          left join lcp_department d on d.tenant_id = u.tenant_id and d.id = u.dept_id
          left join lcp_position p on p.tenant_id = u.tenant_id and p.id = u.position_id
         where u.tenant_id = :tenant
         order by u.created_at, u.username
        """, params());
    List<UserView> users = new ArrayList<>();
    for (Map<String, Object> row : userRows) {
      String userId = str(row.get("id"));
      List<UserRoleView> roles = bindings(userId, appId);
      List<String> keys = roles.stream().map(UserRoleView::roleKey).distinct().toList();
      users.add(new UserView(
          userId, str(row.get("username")), str(row.get("display_name")),
          str(row.get("email")), str(row.get("phone")),
          str(row.get("dept_id")), str(row.get("dept_name")),
          str(row.get("position_id")), str(row.get("position_name")),
          str(row.get("status")), keys, roles));
    }

    List<RoleView> roles = jdbc.query("""
        select id, role_key, name, scope, data_scope, builtin, app_id
          from lcp_role
         where tenant_id = :tenant and (app_id = :app or app_id is null)
         order by scope, name
        """, params().addValue("app", appId), (rs, row) -> new RoleView(
            rs.getObject("id", UUID.class).toString(), rs.getString("role_key"),
            rs.getString("name"), rs.getString("scope"), rs.getString("data_scope"),
            rs.getBoolean("builtin"), null,
            rs.getObject("app_id", UUID.class) == null ? null
                : rs.getObject("app_id", UUID.class).toString()));

    return new OverviewView(departments, positions, users, roles);
  }

  private List<UserRoleView> bindings(String userId, UUID appId) {
    MapSqlParameterSource params = params().addValue("user", userId);
    String appFilter = "";
    if (appId != null) {
      appFilter = " and (r.app_id = :app or r.app_id is null)";
      params.addValue("app", appId);
    }
    return jdbc.query("""
        select r.app_id, a.app_key, r.role_key, d.name as role_name
          from lcp_user_role r
          left join lcp_application a on a.tenant_id = r.tenant_id and a.id = r.app_id
          left join lcp_role d on d.tenant_id = r.tenant_id and d.role_key = r.role_key
             and coalesce(d.app_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = coalesce(r.app_id, '00000000-0000-0000-0000-000000000000'::uuid)
         where r.tenant_id = :tenant and r.user_id = :user
        """ + appFilter + " order by r.app_id nulls first, r.role_key",
        params, (rs, row) -> new UserRoleView(
            rs.getObject("app_id", UUID.class) == null ? null
                : rs.getObject("app_id", UUID.class).toString(),
            rs.getString("app_key"), rs.getString("role_key"),
            rs.getString("role_name") == null ? rs.getString("role_key") : rs.getString("role_name")));
  }

  // ------------------------------------------------------------ 部门

  @Transactional
  public DepartmentView createDepartment(DepartmentRequest request) {
    requireAdmin();
    String id = first(request.id(), request.key());
    String name = trim(request.name());
    if (id == null || name == null) {
      throw PlatformException.badRequest("department_invalid", "部门 ID 与名称不能为空");
    }
    String parentId = trim(request.parentId());
    String path = parentId == null ? "/" + id : parentPath(parentId) + "/" + id;
    try {
      jdbc.update("""
          insert into lcp_department
            (id, tenant_id, dept_key, name, parent_id, path, sort, leader_user_id, enabled)
          values (:id, :tenant, :id, :name, :parent, :path, :sort, :leader, :enabled)
          """, params().addValue("id", id).addValue("name", name).addValue("parent", parentId)
          .addValue("path", path).addValue("sort", request.sort() == null ? 0 : request.sort())
          .addValue("leader", trim(request.leaderUserId()))
          .addValue("enabled", request.enabled() == null || request.enabled()));
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("department_exists", "部门 " + id + " 已存在");
    }
    return department(id);
  }

  @Transactional
  public DepartmentView updateDepartment(String id, DepartmentRequest request) {
    requireAdmin();
    DepartmentView existing = department(id);
    String name = trim(request.name());
    String parentId = request.parentId() == null ? existing.parentId() : trim(request.parentId());
    String path = parentId == null ? "/" + id : parentPath(parentId) + "/" + id;
    jdbc.update("""
        update lcp_department set
          name = coalesce(:name, name),
          parent_id = :parent,
          path = :path,
          sort = coalesce(:sort, sort),
          leader_user_id = :leader,
          enabled = coalesce(:enabled, enabled),
          updated_at = now()
        where tenant_id = :tenant and id = :id
        """, params().addValue("id", id).addValue("name", name).addValue("parent", parentId)
        .addValue("path", path).addValue("sort", request.sort())
        .addValue("leader", request.leaderUserId() == null ? existing.leaderUserId()
            : trim(request.leaderUserId()))
        .addValue("enabled", request.enabled()));
    if (!path.equals(existing.path())) {
      jdbc.update("""
          update lcp_department
             set path = :path || substring(path from char_length(:old) + 1),
                 updated_at = now()
           where tenant_id = :tenant and path like :old || '/%'
          """, params().addValue("path", path).addValue("old", existing.path()));
    }
    return department(id);
  }

  @Transactional
  public void deleteDepartment(String id) {
    requireAdmin();
    Integer children = jdbc.queryForObject(
        "select count(*) from lcp_department where tenant_id = :tenant and parent_id = :id",
        params().addValue("id", id), Integer.class);
    Integer users = jdbc.queryForObject(
        "select count(*) from lcp_user where tenant_id = :tenant and dept_id = :id",
        params().addValue("id", id), Integer.class);
    if ((children != null && children > 0) || (users != null && users > 0)) {
      throw PlatformException.conflict("department_in_use", "部门下仍有子部门或用户，不能删除");
    }
    jdbc.update("delete from lcp_department where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
  }

  private DepartmentView department(String id) {
    List<DepartmentView> rows = jdbc.query("""
        select d.id, d.dept_key, d.name, d.parent_id, d.path, d.sort,
               d.leader_user_id, u.display_name as leader_name, d.enabled
          from lcp_department d
          left join lcp_user u on u.tenant_id = d.tenant_id and u.id = d.leader_user_id
         where d.tenant_id = :tenant and d.id = :id
        """, params().addValue("id", id), (rs, row) -> new DepartmentView(
            rs.getString("id"), rs.getString("dept_key"), rs.getString("name"),
            rs.getString("parent_id"), rs.getString("path"), rs.getInt("sort"),
            rs.getString("leader_user_id"), rs.getString("leader_name"), rs.getBoolean("enabled")));
    if (rows.isEmpty()) {
      throw PlatformException.notFound("部门 " + id + " 不存在");
    }
    return rows.get(0);
  }

  private String parentPath(String parentId) {
    List<String> paths = jdbc.queryForList(
        "select path from lcp_department where tenant_id = :tenant and id = :id",
        params().addValue("id", parentId), String.class);
    if (paths.isEmpty()) {
      throw PlatformException.badRequest("department_parent_missing", "上级部门不存在");
    }
    return paths.get(0);
  }

  // ------------------------------------------------------------ 岗位

  @Transactional
  public PositionView createPosition(PositionRequest request) {
    requireAdmin();
    String id = first(request.id(), request.key());
    String name = trim(request.name());
    if (id == null || name == null) {
      throw PlatformException.badRequest("position_invalid", "岗位 ID 与名称不能为空");
    }
    try {
      jdbc.update("""
          insert into lcp_position
            (id, tenant_id, position_key, name, dept_id, sort, enabled)
          values (:id, :tenant, :id, :name, :dept, :sort, :enabled)
          """, params().addValue("id", id).addValue("name", name)
          .addValue("dept", trim(request.deptId()))
          .addValue("sort", request.sort() == null ? 0 : request.sort())
          .addValue("enabled", request.enabled() == null || request.enabled()));
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("position_exists", "岗位 " + id + " 已存在");
    }
    return position(id);
  }

  @Transactional
  public PositionView updatePosition(String id, PositionRequest request) {
    requireAdmin();
    position(id);
    jdbc.update("""
        update lcp_position set
          name = coalesce(:name, name),
          dept_id = :dept,
          sort = coalesce(:sort, sort),
          enabled = coalesce(:enabled, enabled),
          updated_at = now()
        where tenant_id = :tenant and id = :id
        """, params().addValue("id", id).addValue("name", trim(request.name()))
        .addValue("dept", trim(request.deptId())).addValue("sort", request.sort())
        .addValue("enabled", request.enabled()));
    return position(id);
  }

  @Transactional
  public void deletePosition(String id) {
    requireAdmin();
    Integer users = jdbc.queryForObject(
        "select count(*) from lcp_user where tenant_id = :tenant and position_id = :id",
        params().addValue("id", id), Integer.class);
    if (users != null && users > 0) {
      throw PlatformException.conflict("position_in_use", "岗位下仍有用户，不能删除");
    }
    jdbc.update("delete from lcp_position where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
  }

  private PositionView position(String id) {
    List<PositionView> rows = jdbc.query("""
        select p.id, p.position_key, p.name, p.dept_id, d.name as dept_name, p.sort, p.enabled
          from lcp_position p
          left join lcp_department d on d.tenant_id = p.tenant_id and d.id = p.dept_id
         where p.tenant_id = :tenant and p.id = :id
        """, params().addValue("id", id), (rs, row) -> new PositionView(
            rs.getString("id"), rs.getString("position_key"), rs.getString("name"),
            rs.getString("dept_id"), rs.getString("dept_name"), rs.getInt("sort"),
            rs.getBoolean("enabled")));
    if (rows.isEmpty()) {
      throw PlatformException.notFound("岗位 " + id + " 不存在");
    }
    return rows.get(0);
  }

  // ------------------------------------------------------------ 用户

  @Transactional
  public UserView createUser(UserRequest request) {
    requireAdmin();
    String username = trim(request.username());
    String displayName = trim(request.displayName());
    if (username == null || displayName == null) {
      throw PlatformException.badRequest("user_invalid", "登录名与显示名不能为空");
    }
    String id = trim(request.id()) == null ? username : trim(request.id());
    String password = trim(request.password());
    if (password == null || password.length() < 6) {
      throw PlatformException.badRequest("password_invalid", "初始密码至少 6 位");
    }
    try {
      jdbc.update("""
          insert into lcp_user
            (id, tenant_id, username, display_name, email, phone, password_hash,
             dept_id, position_id, status)
          values (:id, :tenant, :username, :name, :email, :phone, :hash,
                  :dept, :position, :status)
          """, params().addValue("id", id).addValue("username", username)
          .addValue("name", displayName).addValue("email", trim(request.email()))
          .addValue("phone", trim(request.phone())).addValue("hash", PasswordHasher.hash(password))
          .addValue("dept", trim(request.deptId())).addValue("position", trim(request.positionId()))
          .addValue("status", status(request.status())));
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("user_exists", "用户 " + username + " 已存在");
    }
    if (request.appId() != null && request.roleKeys() != null) {
      setUserRoles(id, request.appId(), request.roleKeys());
    }
    return requireProfile(id);
  }

  @Transactional
  public UserView updateUser(String id, UserRequest request) {
    requireAdmin();
    requireProfile(id);
    String password = trim(request.password());
    jdbc.update("""
        update lcp_user set
          display_name = coalesce(:name, display_name),
          email = :email,
          phone = :phone,
          password_hash = coalesce(:hash, password_hash),
          dept_id = :dept,
          position_id = :position,
          status = coalesce(:status, status),
          updated_at = now()
        where tenant_id = :tenant and id = :id
        """, params().addValue("id", id).addValue("name", trim(request.displayName()))
        .addValue("email", trim(request.email())).addValue("phone", trim(request.phone()))
        .addValue("hash", password == null ? null : PasswordHasher.hash(password))
        .addValue("dept", trim(request.deptId())).addValue("position", trim(request.positionId()))
        .addValue("status", trim(request.status())));
    if (request.appId() != null && request.roleKeys() != null) {
      setUserRoles(id, request.appId(), request.roleKeys());
    }
    return requireProfile(id);
  }

  @Transactional
  public void deleteUser(String id) {
    requireAdmin();
    if (id != null && id.equals(TenantContext.userId())) {
      throw PlatformException.conflict("cannot_delete_self", "不能删除当前登录用户");
    }
    jdbc.update("delete from lcp_user where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
  }

  @Transactional
  public UserView setUserRoles(String userId, UUID appId, List<String> roleKeys) {
    jdbc.update("""
        delete from lcp_user_role
         where tenant_id = :tenant and user_id = :user
           and coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(:app, '00000000-0000-0000-0000-000000000000'::uuid)
        """, params().addValue("user", userId).addValue("app", appId));
    if (roleKeys != null) {
      for (String key : roleKeys) {
        String roleKey = trim(key);
        if (roleKey == null) {
          continue;
        }
        jdbc.update("""
            insert into lcp_user_role (tenant_id, user_id, app_id, role_key, granted_by)
            values (:tenant, :user, :app, :role, :by)
            on conflict do nothing
            """, params().addValue("user", userId).addValue("app", appId)
            .addValue("role", roleKey).addValue("by", TenantContext.userId()));
      }
    }
    return requireProfile(userId);
  }

  // ------------------------------------------------------------ 工具

  private MapSqlParameterSource params() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return new MapSqlParameterSource("tenant", tenant);
  }

  private static String status(String value) {
    String status = trim(value);
    return status == null ? "active" : status;
  }

  private static String first(String... values) {
    for (String value : values) {
      String trimmed = trim(value);
      if (trimmed != null) {
        return trimmed;
      }
    }
    return null;
  }

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String str(Object value) {
    return value == null ? null : String.valueOf(value);
  }
}
