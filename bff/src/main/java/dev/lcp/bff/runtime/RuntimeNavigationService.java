package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.auth.PermissionService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.engine.ExpressionEngine;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 发布态导航与页面访问控制。
 *
 * <p>菜单先按 roles / visible 过滤，再剔除无权访问的目标页面；page / menu 资源
 * 一旦声明 ACL，就作为额外门槛参与判定。页面 roles 与页面 ACL 取并集，
 * 避免稀疏授权把正常入口误伤。
 */
@Service
public class RuntimeNavigationService {

  private final PublishedBundleService bundles;
  private final PermissionService permissions;
  private final ExpressionEngine expressions;
  private final ObjectMapper json;

  public RuntimeNavigationService(
      PublishedBundleService bundles,
      PermissionService permissions,
      ExpressionEngine expressions,
      ObjectMapper json) {
    this.bundles = bundles;
    this.permissions = permissions;
    this.expressions = expressions;
    this.json = json;
  }

  public record NavigationView(
      UUID appId,
      String appKey,
      String appName,
      int versionNo,
      List<String> roleKeys,
      List<MenuItemView> menus,
      String defaultRoute,
      String homePageRef,
      boolean breadcrumb,
      boolean tabs,
      List<PageLinkView> pages) {
  }

  public record MenuItemView(
      String id,
      String key,
      String title,
      String icon,
      String path,
      String url,
      String target,
      String pageKey,
      int order,
      List<MenuItemView> children) {
  }

  public record PageLinkView(String key, String title, String path, String kind) {
  }

  public record PageView(
      String key,
      String title,
      String kind,
      String path,
      int versionNo,
      JsonNode page,
      List<JsonNode> dataSchemas,
      List<JsonNode> components,
      List<JsonNode> actions,
      List<String> allowedActions) {
  }

  public NavigationView navigation(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    JsonNode bundle = published.content();
    Set<String> roles = permissions.effectiveRoles(appId, bundle);
    JsonNode nav = bundle.path("navigation");

    List<MenuItemView> menus = new ArrayList<>();
    for (JsonNode item : nav.path("menus")) {
      MenuItemView view = menu(appId, published, bundle, roles, item);
      if (view != null) {
        menus.add(view);
      }
    }
    sort(menus);

    String declaredDefault = text(nav, "defaultRoute");
    String defaultRoute = declaredDefault;
    if (defaultRoute == null || defaultRoute.isBlank()
        || !pageByPathAllowed(appId, bundle, roles, defaultRoute)) {
      defaultRoute = firstPath(menus);
    }

    return new NavigationView(
        appId,
        published.appKey(),
        published.appName(),
        published.versionNo(),
        List.copyOf(roles),
        menus,
        defaultRoute,
        text(nav, "homePageRef"),
        nav.path("breadcrumb").asBoolean(true),
        nav.path("tabs").asBoolean(false),
        accessiblePages(appId, bundle, roles));
  }

  public PageView page(UUID appId, String pageKey) {
    PublishedBundle published = bundles.load(appId);
    JsonNode bundle = published.content();
    JsonNode page = findPage(bundle, pageKey);
    if (page == null) {
      throw PlatformException.notFound("页面 " + pageKey + " 不存在");
    }
    Set<String> roles = permissions.effectiveRoles(appId, bundle);
    if (!pageAllowed(appId, bundle, roles, pageKey)) {
      throw PlatformException.forbidden("无权访问页面 " + pageKey);
    }
    List<JsonNode> schemas = new ArrayList<>();
    for (JsonNode schema : bundle.path("artifacts").path("dataSchemas")) {
      schemas.add(schema);
    }
    List<JsonNode> components = new ArrayList<>();
    for (JsonNode component : bundle.path("artifacts").path("components")) {
      components.add(component);
    }
    List<JsonNode> actions = new ArrayList<>();
    List<String> allowedActions = new ArrayList<>();
    for (JsonNode logic : bundle.path("artifacts").path("logicSchemas")) {
      for (JsonNode action : logic.path("actions")) {
        actions.add(action);
        String key = action.path("key").asText(null);
        if (key != null && permissions.canAction(appId, key, "execute")) {
          allowedActions.add(key);
        }
      }
    }
    return new PageView(
        pageKey,
        title(page),
        page.path("kind").asText("custom"),
        page.path("route").path("path").asText(null),
        published.versionNo(),
        page,
        schemas,
        components,
        actions,
        allowedActions);
  }

  private MenuItemView menu(
      UUID appId,
      PublishedBundle published,
      JsonNode bundle,
      Set<String> roles,
      JsonNode item) {
    String key = text(item, "key");
    if (key == null) {
      return null;
    }
    if (!roleAllowed(item.path("roles"), roles)) {
      return null;
    }
    String path = text(item, "path");
    if (!visible(item.path("visible"), path, appId, published)) {
      return null;
    }
    if (!menuAclAllowed(appId, bundle, key)) {
      return null;
    }
    String pageKey = null;
    JsonNode pageRef = item.path("pageRef");
    if ("page".equals(pageRef.path("kind").asText()) && pageRef.hasNonNull("key")) {
      pageKey = pageRef.path("key").asText();
      if (!pageAllowed(appId, bundle, roles, pageKey)) {
        return null;
      }
    }

    List<MenuItemView> children = new ArrayList<>();
    for (JsonNode child : item.path("children")) {
      MenuItemView view = menu(appId, published, bundle, roles, child);
      if (view != null) {
        children.add(view);
      }
    }
    sort(children);
    String url = text(item, "url");
    if ((path == null || path.isBlank()) && (url == null || url.isBlank()) && children.isEmpty()) {
      return null;
    }

    return new MenuItemView(
        text(item, "id"),
        key,
        title(item),
        text(item, "icon"),
        path,
        url,
        text(item, "target"),
        pageKey,
        item.path("order").asInt(0),
        children);
  }
  private List<PageLinkView> accessiblePages(UUID appId, JsonNode bundle, Set<String> roles) {
    List<PageLinkView> out = new ArrayList<>();
    for (JsonNode page : bundle.path("artifacts").path("uiSchemas")) {
      String key = text(page, "key");
      if (key == null || !pageAllowed(appId, bundle, roles, key)) {
        continue;
      }
      out.add(new PageLinkView(
          key,
          title(page),
          page.path("route").path("path").asText(null),
          page.path("kind").asText("custom")));
    }
    out.sort(Comparator.comparing(PageLinkView::path,
        Comparator.nullsLast(String::compareTo)).thenComparing(PageLinkView::title));
    return out;
  }

  private boolean pageByPathAllowed(UUID appId, JsonNode bundle, Set<String> roles, String path) {
    for (JsonNode page : bundle.path("artifacts").path("uiSchemas")) {
      if (path.equals(page.path("route").path("path").asText())) {
        return pageAllowed(appId, bundle, roles, page.path("key").asText());
      }
    }
    return false;
  }

  private boolean pageAllowed(UUID appId, JsonNode bundle, Set<String> roles, String pageKey) {
    JsonNode page = findPage(bundle, pageKey);
    if (page == null) {
      return false;
    }
    Set<String> routeRoles = texts(page.path("route").path("roles"));
    Set<String> accessRoles = texts(page.path("access").path("roles"));
    boolean declared = !routeRoles.isEmpty() || !accessRoles.isEmpty();
    boolean roleOk = !declared || intersects(routeRoles, roles) || intersects(accessRoles, roles);
    boolean aclOk = declared(bundle, "page", pageKey)
        && permissions.can(appId, "page", pageKey, "read");
    return roleOk || aclOk;
  }

  private boolean menuAclAllowed(UUID appId, JsonNode bundle, String menuKey) {
    if (!declared(bundle, "menu", menuKey)) {
      return true;
    }
    return permissions.can(appId, "menu", menuKey, "read");
  }

  /** 是否存在针对该资源的授权声明（不限角色），用于判断 ACL 是否启用。 */
  private static boolean declared(JsonNode bundle, String resourceType, String resource) {
    for (JsonNode permission : bundle.path("artifacts").path("permissions")) {
      String type = permission.path("resourceType").asText("entity");
      String target = permission.path("resource").asText("");
      if (("all".equals(type) || resourceType.equals(type))
          && ("*".equals(target) || resource.equals(target))) {
        return true;
      }
    }
    return false;
  }

  private boolean visible(
      JsonNode expression, String path, UUID appId, PublishedBundle published) {
    if (expression == null || expression.isMissingNode() || expression.isNull()) {
      return true;
    }
    try {
      ObjectNode app = json.createObjectNode();
      app.put("id", appId.toString());
      app.put("key", published.appKey());
      app.put("name", published.appName());
      ObjectNode route = json.createObjectNode();
      route.put("path", path == null ? "" : path);
      ExpressionEngine.Scope scope = expressions.newScope(Map.of(
          "user", permissions.userRoot(),
          "tenant", permissions.tenantRoot(),
          "app", app,
          "route", route));
      return expressions.truthy(expressions.eval(expression, scope));
    } catch (RuntimeException ex) {
      // 导航阶段没有 $data 等运行时数据，求值失败按不可见处理。
      return false;
    }
  }

  private static boolean roleAllowed(JsonNode declared, Set<String> roles) {
    Set<String> expected = texts(declared);
    return expected.isEmpty() || intersects(expected, roles);
  }

  private static boolean intersects(Set<String> left, Set<String> right) {
    for (String value : left) {
      if (right.contains(value)) {
        return true;
      }
    }
    return false;
  }

  private static Set<String> texts(JsonNode array) {
    Set<String> out = new LinkedHashSet<>();
    if (array != null && array.isArray()) {
      for (JsonNode item : array) {
        if (item.isTextual() && !item.asText().isBlank()) {
          out.add(item.asText());
        }
      }
    }
    return out;
  }

  private static JsonNode findPage(JsonNode bundle, String pageKey) {
    for (JsonNode page : bundle.path("artifacts").path("uiSchemas")) {
      if (pageKey != null && pageKey.equals(page.path("key").asText())) {
        return page;
      }
    }
    return null;
  }

  private static String title(JsonNode node) {
    JsonNode title = node.path("title");
    if (title.isTextual()) {
      return title.asText();
    }
    String defaultTitle = title.path("default").asText(null);
    return defaultTitle == null ? text(node, "key") : defaultTitle;
  }

  private static String text(JsonNode node, String field) {
    JsonNode value = node.path(field);
    return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
  }

  private static String firstPath(List<MenuItemView> menus) {
    for (MenuItemView menu : menus) {
      if (menu.path() != null && !menu.path().isBlank()) {
        return menu.path();
      }
      String child = firstPath(menu.children());
      if (child != null) {
        return child;
      }
    }
    return null;
  }

  private static void sort(List<MenuItemView> menus) {
    menus.sort(Comparator.comparingInt(MenuItemView::order)
        .thenComparing(MenuItemView::title, Comparator.nullsLast(String::compareTo)));
  }
}
