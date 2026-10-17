// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.List;

/**
 * 页面语义类型。运行时渲染不依赖它，但它决定设计器的默认模板、出码的目标结构（移动端不做 dashboard）与 AI 的生成策略。
 */
public enum UiPageKind {
    LIST("list"),
    FORM("form"),
    DETAIL("detail"),
    DASHBOARD("dashboard"),
    APPROVAL("approval"),
    REPORT("report"),
    CUSTOM("custom"),
    LOGIN("login"),
    ERROR("error");

    private final String value;

    UiPageKind(String value) {
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
    public static UiPageKind fromValue(String raw) {
        for (UiPageKind item : values()) {
            if (item.value.equals(raw)) return item;
        }
        throw new IllegalArgumentException("未知的 UiPageKind 取值：" + raw);
    }

    /** 白名单字面量，给校验器与设计器属性面板用。 */
    public static List<String> allowed() {
        List<String> out = new ArrayList<>();
        for (UiPageKind item : values()) out.add(item.value);
        return out;
    }
}
