// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 渲染树节点。id 必须全局唯一且稳定 —— 它是 diff、版本对比、AI 定点修改、埋点定位的共同锚点。
 */
public class UINode {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /**
     * 组件名。内建组件注册在平台；租户自定义组件须存在同名 ComponentContract（L2 校验）
     * 必填字段（required 且无 default）。
     * @minLength 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("component")
    private String component;

    public String getComponent() {
        return component;
    }

    public void setComponent(String component) {
        this.component = component;
    }

    /**
     * 可选语义标识，出码时用于生成变量名/类名
     */
    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
    }

    /**
     * 组件属性。每个 prop 是否允许表达式由 ComponentContract 的 bindable 决定（L2 校验）
     */
    @JsonProperty("props")
    private Map<String, JsonNode> props;

    public Map<String, JsonNode> getProps() {
        return props;
    }

    public void setProps(Map<String, JsonNode> props) {
        this.props = props;
    }

    @JsonProperty("bind")
    private UiNodeBinding bind;

    public UiNodeBinding getBind() {
        return bind;
    }

    public void setBind(UiNodeBinding bind) {
        this.bind = bind;
    }

    /**
     * 为假则不渲染。与 style 的 hidden 区别：visible 不产生 DOM 节点
     */
    @JsonProperty("visible")
    private CommonExpr visible;

    public CommonExpr getVisible() {
        return visible;
    }

    public void setVisible(CommonExpr visible) {
        this.visible = visible;
    }

    @JsonProperty("disable")
    private CommonExpr disable;

    public CommonExpr getDisable() {
        return disable;
    }

    public void setDisable(CommonExpr disable) {
        this.disable = disable;
    }

    @JsonProperty("style")
    private UiNodeStyle style;

    public UiNodeStyle getStyle() {
        return style;
    }

    public void setStyle(UiNodeStyle style) {
        this.style = style;
    }

    @JsonProperty("responsive")
    private UiResponsive responsive;

    public UiResponsive getResponsive() {
        return responsive;
    }

    public void setResponsive(UiResponsive responsive) {
        this.responsive = responsive;
    }

    /**
     * 具名插槽子树。插槽是否存在及 multiplicity 由组件契约的 slot 定义约束
     */
    @JsonProperty("slots")
    private Map<String, List<UINode>> slots;

    public Map<String, List<UINode>> getSlots() {
        return slots;
    }

    public void setSlots(Map<String, List<UINode>> slots) {
        this.slots = slots;
    }

    /**
     * 默认插槽子树。仅当组件契约 container=true 时允许（L2 校验）
     */
    @JsonProperty("children")
    private List<UINode> children;

    public List<UINode> getChildren() {
        return children;
    }

    public void setChildren(List<UINode> children) {
        this.children = children;
    }

    /**
     * 节点事件处理器。键必须是组件契约 events[] 中声明的事件名（L2 校验）；代码钩子仅限页面生命周期，不能在节点上使用
     */
    @JsonProperty("handlers")
    private Map<String, UiHandlerRef> handlers;

    public Map<String, UiHandlerRef> getHandlers() {
        return handlers;
    }

    public void setHandlers(Map<String, UiHandlerRef> handlers) {
        this.handlers = handlers;
    }

    /**
     * 列表渲染。作用域内提供 $item / $index / $loop
     */
    @JsonProperty("loop")
    private UiLoopSpec loop;

    public UiLoopSpec getLoop() {
        return loop;
    }

    public void setLoop(UiLoopSpec loop) {
        this.loop = loop;
    }

    /**
     * 锁定后设计器不可拖动或删除，用于模板骨架与平台保留区域
     * @default false
     */
    @JsonProperty("locked")
    private Boolean locked;

    public Boolean getLocked() {
        return locked;
    }

    public void setLocked(Boolean locked) {
        this.locked = locked;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** x- 扩展键：平台原样透传、不参与校验。 */
    @JsonAnyGetter
    public Map<String, JsonNode> extensions() {
        return extensions;
    }

    @JsonAnySetter
    public void putExtension(String key, JsonNode value) {
        extensions.put(key, value);
    }

    private final Map<String, JsonNode> extensions = new LinkedHashMap<>();
}
