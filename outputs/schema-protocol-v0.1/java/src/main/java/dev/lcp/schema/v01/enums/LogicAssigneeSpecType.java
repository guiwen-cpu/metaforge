// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.List;

/**
 * 属性级内联枚举：logic.AssigneeSpec 上的字面量集合。TypeScript 侧是同名字面量联合，Java 用枚举换类型安全。
 */
public enum LogicAssigneeSpecType {
    USER("user"),
    ROLE("role"),
    DEPT("dept"),
    DEPT_LEADER("deptLeader"),
    ROLE_IN_DEPT("roleInDept"),
    INITIATOR("initiator"),
    INITIATOR_LEADER("initiatorLeader"),
    EXPRESSION("expression"),
    FORM_FIELD("formField");

    private final String value;

    LogicAssigneeSpecType(String value) {
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
    public static LogicAssigneeSpecType fromValue(String raw) {
        for (LogicAssigneeSpecType item : values()) {
            if (item.value.equals(raw)) return item;
        }
        throw new IllegalArgumentException("未知的 LogicAssigneeSpecType 取值：" + raw);
    }

    /** 白名单字面量，给校验器与设计器属性面板用。 */
    public static List<String> allowed() {
        List<String> out = new ArrayList<>();
        for (LogicAssigneeSpecType item : values()) out.add(item.value);
        return out;
    }
}
