// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.registry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台内置组件的唯一权威契约。设计器（可用组件清单/属性面板）、运行时（渲染器解析 component 名）、出码引擎（生成 import 与标签）、AI 生成校验器（可用组件与属性合法性）全部读这一份。app 级自定义组件通过 AppBundle.artifacts.components 追加，沙箱组件用 runtime=sandbox 标记。
 * 内置组件注册表（38 个组件）。数据来自随包发布的 /lcp/builtin-components.json，不在编译期内联。
 * 设计器属性面板、运行时渲染器、校验器、出码引擎、AI 生成器五方读同一份。
 */
public final class BuiltinComponentRegistry {
    /** 随包发布的注册表资源路径，对应 src/main/resources/lcp/builtin-components.json。 */
    public static final String RESOURCE = "/lcp/builtin-components.json";

    /** 已登记组件名（x- 前缀），顺序与注册表一致，给设计器组件面板与校验器白名单用。 */
    public static final List<String> COMPONENT_NAMES = List.<String>of("x-page", "x-card", "x-row", "x-col", "x-toolbar", "x-dialog", "x-tabs", "x-form-item", "x-table", "x-search-form", "x-pagination", "x-form", "x-descriptions", "x-input", "x-textarea", "x-rich-text", "x-number", "x-switch", "x-select", "x-radio-group", "x-checkbox-group", "x-date-picker", "x-upload", "x-json-editor", "x-signature", "x-location", "x-text", "x-enum-text", "x-status-tag", "x-btn", "x-row-actions", "x-dept-picker", "x-employee-picker", "x-attachment-list", "x-approval-timeline", "x-approval-actions", "x-process-form", "x-task-list");

    private static final JsonNode ROOT = load();

    private static final Map<String, JsonNode> BY_NAME = index();

    private BuiltinComponentRegistry() {}

    /** 注册表版本。AppBundle 声明依赖的版本号与此比对，不一致时出码引擎要拦下来。 */
    public static int registryVersion() {
        return ROOT.path("registryVersion").asInt();
    }

    /** 取一份组件契约（含 props / capabilities / slots）。未登记返回 null。 */
    public static JsonNode of(String name) {
        return BY_NAME.get(name);
    }

    /** 按 kind 过滤：layout / container / data / field / display / action / advanced。 */
    public static List<String> namesByKind(String kind) {
        List<String> out = new ArrayList<>();
        for (JsonNode component : ROOT.path("components")) {
            if (component.path("kind").asText().equals(kind)) out.add(component.path("name").asText());
        }
        return Collections.unmodifiableList(out);
    }

    /** 字段绑定优先级说明，原样来自注册表 —— 它是「控件怎么被选中」的唯一权威描述。 */
    public static String fieldBindingRule() {
        return ROOT.path("fieldBindingRule").asText();
    }

    /** 结构化 prop 的元素契约说明（columnList / fieldList / items 等）。 */
    public static String itemContractNote() {
        return ROOT.path("itemContractNote").asText();
    }

    /** 原始注册表树，给「不想跟着 DTO 版本走」的通用工具用。 */
    public static JsonNode root() {
        return ROOT;
    }

    private static Map<String, JsonNode> index() {
        Map<String, JsonNode> index = new LinkedHashMap<>();
        for (JsonNode component : ROOT.path("components")) {
            index.put(component.path("name").asText(), component);
        }
        return Collections.unmodifiableMap(index);
    }

    private static JsonNode load() {
        try (InputStream stream = BuiltinComponentRegistry.class.getResourceAsStream(RESOURCE)) {
            if (stream == null) {
                throw new IllegalStateException("组件注册表资源缺失：" + RESOURCE + "（生成产物会随包发布，不要手工删）");
            }
            return new ObjectMapper().readTree(stream);
        } catch (IOException error) {
            throw new IllegalStateException("组件注册表读取失败：" + RESOURCE, error);
        }
    }
}
