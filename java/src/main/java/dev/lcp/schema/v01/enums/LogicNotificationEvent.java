// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.List;

/**
 * 通知规则可挂载的流程生命周期事件。
 */
public enum LogicNotificationEvent {
    PROCESS_STARTED("processStarted"),
    TASK_ASSIGNED("taskAssigned"),
    TASK_TRANSFERRED("taskTransferred"),
    TASK_RETURNED("taskReturned"),
    FLOW_REJECTED("flowRejected"),
    FLOW_APPROVED("flowApproved"),
    SLA_WARNING("slaWarning"),
    SLA_ESCALATED("slaEscalated");

    private final String value;

    LogicNotificationEvent(String value) {
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
    public static LogicNotificationEvent fromValue(String raw) {
        for (LogicNotificationEvent item : values()) {
            if (item.value.equals(raw)) return item;
        }
        throw new IllegalArgumentException("未知的 LogicNotificationEvent 取值：" + raw);
    }

    /** 白名单字面量，给校验器与设计器属性面板用。 */
    public static List<String> allowed() {
        List<String> out = new ArrayList<>();
        for (LogicNotificationEvent item : values()) out.add(item.value);
        return out;
    }
}
