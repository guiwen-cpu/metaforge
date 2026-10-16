// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * JSONB 落库契约。元数据与业务对象存进 PostgreSQL 的 jsonb 列时统一走这里，不要在 DAO 里各写各的。
 * 
 * 为什么只有工具方法、没有 JsonbMapper 注解和 TypeHandler：
 *   当前 Schema 里没有任何「同一个 DTO 要按多个物理列变体映射」的用例。先生成一层空的映射是死代码，
 *   更麻烦的是它会诱导后来的人去改生成文件（改完下一次生成就没了）。等真出现多列变体，
 *   再按那个具体用例生成具名的 TypeHandler，而不是现在先铺一层。
 * 
 * 三条使用约定：
 *   1. 写库前先过 L1 校验，JSONB 里不允许存没校验过的元数据。
 *   2. 读库用下面的方法，不要自己 new ObjectMapper —— NON_NULL 与时间格式必须全链路一致。
 *   3. 要按字段过滤就直接用 PostgreSQL 的 jsonb 操作符，别把整列捞回 Java 里筛。
 */
public final class JsonbSupport {
    private JsonbSupport() {}

    /** DTO -> jsonb 字符串。null 原样返回 null（写库即 SQL NULL，不是 JSON 的 null 字面量）。 */
    public static String write(ObjectMapper mapper, Object value) {
        if (value == null) return null;
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("对象无法序列化成 jsonb：" + value.getClass().getName(), error);
        }
    }

    /** jsonb 字符串 -> DTO。内容坏掉就抛，不返回半成品。 */
    public static <T> T read(ObjectMapper mapper, String jsonb, Class<T> type) {
        if (jsonb == null || jsonb.isEmpty()) return null;
        try {
            return mapper.readValue(jsonb, type);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("jsonb 内容无法反序列化成 " + type.getName(), error);
        }
    }

    /** jsonb 字符串 -> JsonNode。给「还不知道要落成哪个 DTO」的场景，例如元数据版本的迁移脚本。 */
    public static JsonNode readTree(ObjectMapper mapper, String jsonb) {
        if (jsonb == null || jsonb.isEmpty()) return null;
        try {
            return mapper.readTree(jsonb);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("jsonb 内容不是合法 JSON", error);
        }
    }
}
