package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.auth.PermissionService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.RuntimeRequests.RuntimeApiInvokeRequest;
import dev.lcp.bff.runtime.engine.ActionExecutor;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 小程序页面级 API 调用入口。只放行当前页面或其可执行动作实际引用的 API，
 * 复用动作执行器完成连接器、鉴权、mock 与内部 API 分派。
 */
@Service
public class RuntimeApiInvocationService {

  private final PublishedBundleService bundles;
  private final RuntimeNavigationService navigation;
  private final PermissionService permissions;
  private final ActionExecutor actions;

  public RuntimeApiInvocationService(
      PublishedBundleService bundles,
      RuntimeNavigationService navigation,
      PermissionService permissions,
      ActionExecutor actions) {
    this.bundles = bundles;
    this.navigation = navigation;
    this.permissions = permissions;
    this.actions = actions;
  }

  public JsonNode invoke(
      UUID appId, String pageKey, String apiKey, RuntimeApiInvokeRequest request) {
    PublishedBundle published = bundles.load(appId);
    JsonNode bundle = published.content();
    JsonNode page = findPage(bundle, pageKey);
    if (page == null) {
      throw PlatformException.notFound("页面 " + pageKey + " 不存在");
    }
    Set<String> roles = permissions.effectiveRoles(appId, bundle);
    if (!navigation.pageAllowed(appId, bundle, roles, pageKey)) {
      throw PlatformException.forbidden("无权访问页面 " + pageKey);
    }
    if (bundles.api(bundle, apiKey) == null) {
      throw PlatformException.notFound("API " + apiKey + " 不存在于当前发布件");
    }
    if (!referencedByPage(appId, bundle, page, apiKey)) {
      throw PlatformException.forbidden("API " + apiKey + " 未被页面 " + pageKey + " 引用");
    }
    RuntimeApiInvokeRequest safe = request == null
        ? new RuntimeApiInvokeRequest(null, null, null) : request;
    Map<String, Object> context = safe.context() == null ? Map.of() : safe.context();
    return actions.invokeApi(published, apiKey, safe.params(), context, safe.resultPath());
  }

  private boolean referencedByPage(
      UUID appId, JsonNode bundle, JsonNode page, String apiKey) {
    if (containsRef(page, "apiRef", apiKey)) {
      return true;
    }
    Set<String> visited = new LinkedHashSet<>();
    Deque<String> queue = new ArrayDeque<>(refKeys(page, "actionRef"));
    while (!queue.isEmpty()) {
      String actionKey = queue.removeFirst();
      if (!visited.add(actionKey)) {
        continue;
      }
      if (!permissions.canAction(appId, actionKey, "execute")) {
        continue;
      }
      JsonNode action = bundles.action(bundle, actionKey);
      if (action == null) {
        continue;
      }
      if (containsRef(action, "apiRef", apiKey)) {
        return true;
      }
      queue.addAll(refKeys(action, "actionRef"));
    }
    return false;
  }

  private static boolean containsRef(JsonNode node, String field, String key) {
    if (node == null || node.isNull()) {
      return false;
    }
    if (node.isObject()) {
      JsonNode ref = node.get(field);
      if (ref != null && ref.isObject() && key.equals(ref.path("key").asText())) {
        return true;
      }
      for (JsonNode child : node) {
        if (containsRef(child, field, key)) {
          return true;
        }
      }
    } else if (node.isArray()) {
      for (JsonNode child : node) {
        if (containsRef(child, field, key)) {
          return true;
        }
      }
    }
    return false;
  }

  private static Set<String> refKeys(JsonNode node, String field) {
    Set<String> out = new LinkedHashSet<>();
    collectRefKeys(node, field, out);
    return out;
  }

  private static void collectRefKeys(JsonNode node, String field, Set<String> out) {
    if (node == null || node.isNull()) {
      return;
    }
    if (node.isObject()) {
      JsonNode ref = node.get(field);
      if (ref != null && ref.isObject()) {
        String key = ref.path("key").asText("");
        if (!key.isBlank()) {
          out.add(key);
        }
      }
      for (JsonNode child : node) {
        collectRefKeys(child, field, out);
      }
    } else if (node.isArray()) {
      for (JsonNode child : node) {
        collectRefKeys(child, field, out);
      }
    }
  }

  private static JsonNode findPage(JsonNode bundle, String pageKey) {
    for (JsonNode page : bundle.path("artifacts").path("uiSchemas")) {
      if (pageKey != null && pageKey.equals(page.path("key").asText())) {
        return page;
      }
    }
    return null;
  }
}
