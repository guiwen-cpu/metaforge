// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.support;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * LCP 协议用的 ObjectMapper 装配。读写 Schema DTO 的地方统一用这一份，不要各自 new。
 * 
 * 三条约定：
 *   1. NON_NULL —— 可选字段不写 null。契约里「字段缺省」与「字段为 null」同义，写出去只会让 diff 变脏。
 *   2. 未知字段宽容 —— Schema 是向前演进的，先用上新服务端字段的客户端不该被老代码打挂。
 *   3. 时间不走时间戳 —— 契约里的 date-time 是 ISO-8601 字符串，写成纪元数字会让两端对不上。
 */
public final class LcpObjectMapper {
    /** 共享实例（ObjectMapper 本身线程安全，配置完成后不要再改）。 */
    private static final ObjectMapper SHARED = create();

    private LcpObjectMapper() {}

    public static ObjectMapper shared() {
        return SHARED;
    }

    /** 新建一个配置好的实例。需要不同配置（例如写审计日志要保留 null）时用这个。 */
    public static ObjectMapper create() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        return mapper;
    }
}
