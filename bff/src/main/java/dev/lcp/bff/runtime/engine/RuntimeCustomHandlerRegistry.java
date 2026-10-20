package dev.lcp.bff.runtime.engine;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class RuntimeCustomHandlerRegistry {

  private final Map<String, RuntimeCustomHandler> handlers;

  public RuntimeCustomHandlerRegistry(List<RuntimeCustomHandler> discovered) {
    Map<String, RuntimeCustomHandler> sorted = new LinkedHashMap<>();
    discovered.stream()
        .sorted((left, right) -> left.key().compareTo(right.key()))
        .forEach(handler -> {
          if (handler.key() == null || handler.key().isBlank()) {
            throw new IllegalStateException("custom handler 缺少 key");
          }
          RuntimeCustomHandler previous = sorted.put(handler.key(), handler);
          if (previous != null) {
            throw new IllegalStateException("custom handler 重复注册：" + handler.key());
          }
        });
    this.handlers = Map.copyOf(sorted);
  }

  public RuntimeCustomHandler find(String key) {
    return key == null || key.isBlank() ? null : handlers.get(key);
  }

  public Set<String> keys() {
    return handlers.keySet();
  }
}