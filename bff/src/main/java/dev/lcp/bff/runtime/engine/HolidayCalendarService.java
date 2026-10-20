package dev.lcp.bff.runtime.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 节假日服务：优先读取 Redis 年度缓存，未命中时请求可配置的开放接口。
 * 外部服务失败只降级为空日历并记录警告，不阻断请假提交。
 */
@Service
public class HolidayCalendarService implements HolidayCalendarProvider {

  private static final Logger log = LoggerFactory.getLogger(HolidayCalendarService.class);
  private static final String CACHE_PREFIX = "lcp:holiday:v1:";

  private final ObjectMapper json;
  private final StringRedisTemplate redis;
  private final boolean enabled;
  private final String urlTemplate;
  private final long timeoutMs;
  private final long cacheTtlSeconds;
  private final HttpClient client;

  public HolidayCalendarService(
      ObjectMapper json,
      StringRedisTemplate redis,
      @Value("${lcp.holiday.enabled:true}") boolean enabled,
      @Value("${lcp.holiday.url-template:https://timor.tech/api/holiday/year/{year}}")
          String urlTemplate,
      @Value("${lcp.holiday.timeout-ms:3000}") long timeoutMs,
      @Value("${lcp.holiday.cache-ttl-seconds:604800}") long cacheTtlSeconds) {
    this.json = json;
    this.redis = redis;
    this.enabled = enabled;
    this.urlTemplate = urlTemplate == null ? "" : urlTemplate.trim();
    this.timeoutMs = Math.max(500, timeoutMs);
    this.cacheTtlSeconds = Math.max(60, cacheTtlSeconds);
    this.client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(this.timeoutMs))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
  }

  @Override
  public Calendar loadYear(int year) {
    if (!enabled || urlTemplate.isBlank() || year < 1900 || year > 2200) {
      return Calendar.empty(false);
    }
    String cacheKey = CACHE_PREFIX + year;
    Calendar cached = readCache(cacheKey);
    if (cached != null) {
      return cached;
    }
    try {
      URI uri = URI.create(urlTemplate.replace("{year}", Integer.toString(year)));
      HttpRequest request = HttpRequest.newBuilder(uri)
          .timeout(Duration.ofMillis(timeoutMs))
          .header("Accept", "application/json")
          .GET()
          .build();
      HttpResponse<String> response =
          client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        log.warn("节假日服务返回 HTTP {}，年份 {} 降级为空日历",
            response.statusCode(), year);
        return Calendar.empty(true);
      }
      Map<LocalDate, String> days = parse(response.body(), year);
      writeCache(cacheKey, days);
      return new Calendar(days, false);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      log.warn("节假日服务请求被中断，年份 {} 降级为空日历", year);
      return Calendar.empty(true);
    } catch (Exception ex) {
      log.warn("节假日服务请求失败，年份 {} 降级为空日历：{}", year, ex.getMessage());
      return Calendar.empty(true);
    }
  }

  Map<LocalDate, String> parse(String raw, int year) throws Exception {
    JsonNode root = json.readTree(raw);
    Map<LocalDate, String> days = new TreeMap<>();
    if (root == null || root.isNull()) {
      return days;
    }
    JsonNode entries = root;
    if (root.isObject()) {
      if (root.path("holiday").isObject()) {
        entries = root.path("holiday");
      } else if (root.path("data").isArray()) {
        entries = root.path("data");
      } else if (root.path("holidays").isArray()) {
        entries = root.path("holidays");
      }
    }
    if (entries.isObject()) {
      Iterator<Map.Entry<String, JsonNode>> fields = entries.fields();
      while (fields.hasNext()) {
        Map.Entry<String, JsonNode> field = fields.next();
        putEntry(days, year, field.getKey(), field.getValue());
      }
    } else if (entries.isArray()) {
      for (JsonNode entry : entries) {
        putEntry(days, year, "", entry);
      }
    }
    return days;
  }

  private void putEntry(
      Map<LocalDate, String> days, int year, String fallbackDate, JsonNode entry) {
    if (entry == null || entry.isNull()) {
      return;
    }
    String rawDate = entry.path("date").asText(fallbackDate).trim();
    if (rawDate.length() == 5) {
      rawDate = year + "-" + rawDate;
    }
    LocalDate date;
    try {
      date = LocalDate.parse(rawDate);
    } catch (DateTimeParseException ex) {
      return;
    }
    String type;
    if (entry.has("holiday")) {
      type = entry.path("holiday").asBoolean(true) ? "holiday" : "workday";
    } else if (entry.has("isOffDay")) {
      type = entry.path("isOffDay").asBoolean(true) ? "holiday" : "workday";
    } else {
      type = entry.path("type").asText("holiday");
    }
    days.put(date, "workday".equalsIgnoreCase(type) ? "workday" : "holiday");
  }

  private Calendar readCache(String key) {
    if (redis == null) {
      return null;
    }
    try {
      String raw = redis.opsForValue().get(key);
      if (raw == null || raw.isBlank()) {
        return null;
      }
      JsonNode node = json.readTree(raw);
      Map<LocalDate, String> days = new LinkedHashMap<>();
      for (JsonNode item : node) {
        try {
          LocalDate date = LocalDate.parse(item.path("date").asText(""));
          days.put(date, "workday".equals(item.path("type").asText()) ? "workday" : "holiday");
        } catch (DateTimeParseException ignored) {
          // 单个缓存项损坏不影响其余日期
        }
      }
      return new Calendar(days, false);
    } catch (Exception ex) {
      log.warn("读取节假日缓存失败，将回源：{}", ex.getMessage());
      return null;
    }
  }

  private void writeCache(String key, Map<LocalDate, String> days) {
    if (redis == null) {
      return;
    }
    try {
      StringBuilder raw = new StringBuilder("[");
      boolean first = true;
      for (Map.Entry<LocalDate, String> entry : new TreeMap<>(days).entrySet()) {
        if (!first) {
          raw.append(',');
        }
        first = false;
        raw.append("{\"date\":\"").append(entry.getKey())
            .append("\",\"type\":\"").append(entry.getValue()).append("\"}");
      }
      raw.append(']');
      redis.opsForValue().set(key, raw.toString(), Duration.ofSeconds(cacheTtlSeconds));
    } catch (Exception ex) {
      log.warn("写入节假日缓存失败：{}", ex.getMessage());
    }
  }
}
