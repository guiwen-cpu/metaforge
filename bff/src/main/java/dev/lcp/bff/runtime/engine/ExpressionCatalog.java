package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 表达式注册表目录。函数白名单、取值根与元数全部来自
 * schema/expression-registry.json（构建时并入 classpath），BFF 不另造语义。
 */
@Component
public class ExpressionCatalog {

  public record FunctionDef(
      String name,
      String category,
      int minArity,
      int maxArity,
      boolean variadic,
      String returns,
      boolean pure) {

    public String arityText() {
      return variadic ? minArity + "+" : minArity + ".." + maxArity;
    }
  }

  private final Map<String, FunctionDef> functions;
  private final Set<String> roots;

  public ExpressionCatalog(ObjectMapper json) {
    JsonNode registry = read(json);
    Map<String, FunctionDef> funcs = new LinkedHashMap<>();
    for (JsonNode item : registry.path("functions")) {
      String name = item.path("name").asText(null);
      if (name == null || name.isBlank()) {
        continue;
      }
      JsonNode arity = item.path("arity");
      int min = arity.isArray() && arity.size() > 0 ? arity.get(0).asInt(0) : 0;
      int max = arity.isArray() && arity.size() > 1 && !arity.get(1).isNull()
          ? arity.get(1).asInt(Integer.MAX_VALUE) : Integer.MAX_VALUE;
      funcs.put(name, new FunctionDef(
          name,
          item.path("cat").asText(""),
          min,
          max,
          max == Integer.MAX_VALUE,
          item.path("returns").asText("any"),
          item.path("pure").asBoolean(true)));
    }
    Set<String> rootNames = new LinkedHashSet<>();
    for (JsonNode item : registry.path("valueRoots")) {
      String name = item.path("name").asText(null);
      if (name != null && !name.isBlank()) {
        rootNames.add(name);
      }
    }
    this.functions = Collections.unmodifiableMap(funcs);
    this.roots = Collections.unmodifiableSet(rootNames);
  }

  public Optional<FunctionDef> function(String name) {
    return Optional.ofNullable(functions.get(name));
  }

  public FunctionDef require(String name) {
    FunctionDef def = functions.get(name);
    if (def == null) {
      throw new ExpressionException("unknown_function", "未注册的表达式函数：" + name);
    }
    return def;
  }

  public void checkArity(FunctionDef def, int count) {
    if (count < def.minArity() || count > def.maxArity()) {
      throw new ExpressionException("bad_arity",
          "函数 " + def.name() + " 需要 " + def.arityText() + " 个参数，实际 " + count + " 个");
    }
  }

  /** name 含 $ 前缀，例如 $user。 */
  public boolean isRoot(String name) {
    return roots.contains(name);
  }

  public Set<String> roots() {
    return roots;
  }

  public Map<String, FunctionDef> functions() {
    return functions;
  }

  private static JsonNode read(ObjectMapper json) {
    ClassPathResource resource = new ClassPathResource("expression-registry.json");
    try (InputStream in = resource.getInputStream()) {
      return json.readTree(in);
    } catch (IOException ex) {
      throw new IllegalStateException("classpath 缺少 expression-registry.json，无法启动表达式引擎", ex);
    }
  }
}