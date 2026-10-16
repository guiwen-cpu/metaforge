// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.List;

/**
 * 面向设计器的属性类型系统。决定属性面板渲染什么编辑控件，以及出码时如何序列化。新增类型须同步更新属性面板控件表与出码序列化器。
 */
public enum ComponentPropType {
    STRING("string"),
    NUMBER("number"),
    INTEGER("integer"),
    BOOLEAN("boolean"),
    TEXT("text"),
    JSON("json"),
    ENUM("enum"),
    COLOR("color"),
    ICON("icon"),
    CSS_LENGTH("cssLength"),
    URL("url"),
    DATE_FORMAT("dateFormat"),
    FILE_ACCEPT("fileAccept"),
    EXPR("expr"),
    SLOT("slot"),
    NODE("node"),
    NODE_LIST("nodeList"),
    STYLE("style"),
    ACTION_REF("actionRef"),
    PAGE_REF("pageRef"),
    ENTITY_REF("entityRef"),
    DATA_SOURCE_REF("dataSourceRef"),
    FIELD_REF("fieldRef"),
    EVENT_REF("eventRef"),
    FIELD_LIST("fieldList"),
    COLUMN_LIST("columnList"),
    SEARCH_FIELD_LIST("searchFieldList"),
    OPTION_LIST("optionList"),
    BUTTON_LIST("buttonList"),
    RULE_LIST("ruleList"),
    ASSIGNEE("assignee"),
    VALIDATOR_LIST("validatorList"),
    STEP_LIST("stepList");

    private final String value;

    ComponentPropType(String value) {
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
    public static ComponentPropType fromValue(String raw) {
        for (ComponentPropType item : values()) {
            if (item.value.equals(raw)) return item;
        }
        throw new IllegalArgumentException("未知的 ComponentPropType 取值：" + raw);
    }

    /** 白名单字面量，给校验器与设计器属性面板用。 */
    public static List<String> allowed() {
        List<String> out = new ArrayList<>();
        for (ComponentPropType item : values()) out.add(item.value);
        return out;
    }
}
