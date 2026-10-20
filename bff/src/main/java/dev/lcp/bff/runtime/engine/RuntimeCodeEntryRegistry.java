package dev.lcp.bff.runtime.engine;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/** code 步骤的白名单入口表；未注册的 entry 一律失败。 */
public final class RuntimeCodeEntryRegistry {

  private final Map<String, RuntimeCodeEntry> entries;

  public RuntimeCodeEntryRegistry(Map<String, RuntimeCodeEntry> entries) {
    Map<String, RuntimeCodeEntry> sorted = new TreeMap<>();
    entries.forEach((key, entry) -> {
      if (key == null || key.isBlank()) {
        throw new IllegalStateException("code entry 缺少 key");
      }
      if (entry == null) {
        throw new IllegalStateException("code entry 缺少处理器：" + key);
      }
      sorted.put(key, entry);
    });
    this.entries = Map.copyOf(sorted);
  }

  public RuntimeCodeEntry find(String key) {
    return key == null || key.isBlank() ? null : entries.get(key);
  }

  public Set<String> keys() {
    return entries.keySet();
  }
}