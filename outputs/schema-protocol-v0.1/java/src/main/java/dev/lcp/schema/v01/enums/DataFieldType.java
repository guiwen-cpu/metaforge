// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.List;

/**
 * 封闭集合。新增类型须同步更新：PG 类型映射表、TS 类型生成器、Java 类型生成器、默认渲染组件表（四处齐改，L3 校验会检查映射表完整性）
 */
public enum DataFieldType {
    STRING("string"),
    TEXT("text"),
    RICH_TEXT("richText"),
    INTEGER("integer"),
    DECIMAL("decimal"),
    BOOLEAN("boolean"),
    DATE("date"),
    DATETIME("datetime"),
    TIME("time"),
    JSON("json"),
    ENUM("enum"),
    REF("ref"),
    FILE("file"),
    IMAGE("image"),
    VIDEO("video"),
    ARRAY("array"),
    SIGNATURE("signature"),
    LOCATION("location"),
    FORMULA("formula");

    private final String value;

    DataFieldType(String value) {
        this.value = value;
    }

    /** 协议里的原始字面量（Schema 的 enum 取值）。 */
    @JsonValue
    public String value() {
        return value;
    }

    /**
     * 反序列化。未知取值直接抛异常，不做 _UNKNOWN 兜底：
     * 本包按协议版本生成（v01 对应 0.1），收到未知取值说明对端在用更新版本的协议，
     * 那是部署错误而不是数据错误，静默兜底只会把问题推到更难查的地方。
     */
    @JsonCreator
    public static DataFieldType fromValue(String raw) {
        for (DataFieldType item : values()) {
            if (item.value.equals(raw)) return item;
        }
        throw new IllegalArgumentException("未知的 DataFieldType 取值：" + raw);
    }

    /** 白名单字面量，给校验器与设计器属性面板用。 */
    public static List<String> allowed() {
        List<String> out = new ArrayList<>();
        for (DataFieldType item : values()) out.add(item.value);
        return out;
    }
}
