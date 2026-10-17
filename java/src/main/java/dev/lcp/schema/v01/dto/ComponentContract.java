// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.ComponentContractRuntime;
import dev.lcp.schema.v01.enums.ComponentKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ComponentContract {
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
     * 组件名（kebab-case）。UINode.component 必须能解析到此名或平台内建组件名
     * 必填字段（required 且无 default）。
     * @pattern ^[a-z][a-z0-9-]{1,47}$
     */
    @NotNull
    @Pattern(regexp = "^[a-z][a-z0-9-]{1,47}$")
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("version")
    private Integer version;

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("title")
    private CommonText title;

    public CommonText getTitle() {
        return title;
    }

    public void setTitle(CommonText title) {
        this.title = title;
    }

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * 物料面板分组，如 基础 / 布局 / 表单 / 数据展示 / 业务组件
     */
    @JsonProperty("group")
    private String group;

    public String getGroup() {
        return group;
    }

    public void setGroup(String group) {
        this.group = group;
    }

    @JsonProperty("icon")
    private String icon;

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("kind")
    private ComponentKind kind;

    public ComponentKind getKind() {
        return kind;
    }

    public void setKind(ComponentKind kind) {
        this.kind = kind;
    }

    /**
     * builtin=平台内建；remote=动态加载的租户 JS 包；sandbox=iframe 隔离执行
     * @default "builtin"
     */
    @JsonProperty("runtime")
    private ComponentContractRuntime runtime;

    public ComponentContractRuntime getRuntime() {
        return runtime;
    }

    public void setRuntime(ComponentContractRuntime runtime) {
        this.runtime = runtime;
    }

    /**
     * 是否可容纳子节点。为假时 UINode.children 被 L2 校验拒绝
     * @default false
     */
    @JsonProperty("container")
    private Boolean container;

    public Boolean getContainer() {
        return container;
    }

    public void setContainer(Boolean container) {
        this.container = container;
    }

    /**
     * 允许的子组件名白名单；空数组表示不限。设计器据此高亮可放置区域
     */
    @JsonProperty("acceptChildren")
    private List<String> acceptChildren;

    public List<String> getAcceptChildren() {
        return acceptChildren;
    }

    public void setAcceptChildren(List<String> acceptChildren) {
        this.acceptChildren = acceptChildren;
    }

    /**
     * 允许的父组件名白名单；空数组表示不限。双向约束比单向更可靠
     */
    @JsonProperty("canBeChildOf")
    private List<String> canBeChildOf;

    public List<String> getCanBeChildOf() {
        return canBeChildOf;
    }

    public void setCanBeChildOf(List<String> canBeChildOf) {
        this.canBeChildOf = canBeChildOf;
    }

    /**
     * @minimum 0
     */
    @Min(0L)
    @JsonProperty("minChildren")
    private Integer minChildren;

    public Integer getMinChildren() {
        return minChildren;
    }

    public void setMinChildren(Integer minChildren) {
        this.minChildren = minChildren;
    }

    /**
     * @minimum 1
     */
    @Min(1L)
    @JsonProperty("maxChildren")
    private Integer maxChildren;

    public Integer getMaxChildren() {
        return maxChildren;
    }

    public void setMaxChildren(Integer maxChildren) {
        this.maxChildren = maxChildren;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("props")
    private List<ComponentPropDef> props;

    public List<ComponentPropDef> getProps() {
        return props;
    }

    public void setProps(List<ComponentPropDef> props) {
        this.props = props;
    }

    @JsonProperty("slots")
    private List<ComponentSlotDef> slots;

    public List<ComponentSlotDef> getSlots() {
        return slots;
    }

    public void setSlots(List<ComponentSlotDef> slots) {
        this.slots = slots;
    }

    @JsonProperty("events")
    private List<ComponentEventDef> events;

    public List<ComponentEventDef> getEvents() {
        return events;
    }

    public void setEvents(List<ComponentEventDef> events) {
        this.events = events;
    }

    @JsonProperty("actions")
    private List<ComponentActionCapability> actions;

    public List<ComponentActionCapability> getActions() {
        return actions;
    }

    public void setActions(List<ComponentActionCapability> actions) {
        this.actions = actions;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("capabilities")
    private ComponentCapabilities capabilities;

    public ComponentCapabilities getCapabilities() {
        return capabilities;
    }

    public void setCapabilities(ComponentCapabilities capabilities) {
        this.capabilities = capabilities;
    }

    @JsonProperty("data")
    private ComponentDataContract data;

    public ComponentDataContract getData() {
        return data;
    }

    public void setData(ComponentDataContract data) {
        this.data = data;
    }

    @JsonProperty("fieldBindings")
    private ComponentFieldBindings fieldBindings;

    public ComponentFieldBindings getFieldBindings() {
        return fieldBindings;
    }

    public void setFieldBindings(ComponentFieldBindings fieldBindings) {
        this.fieldBindings = fieldBindings;
    }

    /**
     * 拖入画布时的初始 props
     */
    @JsonProperty("defaultProps")
    private Map<String, JsonNode> defaultProps;

    public Map<String, JsonNode> getDefaultProps() {
        return defaultProps;
    }

    public void setDefaultProps(Map<String, JsonNode> defaultProps) {
        this.defaultProps = defaultProps;
    }

    @JsonProperty("defaultStyle")
    private UiNodeStyle defaultStyle;

    public UiNodeStyle getDefaultStyle() {
        return defaultStyle;
    }

    public void setDefaultStyle(UiNodeStyle defaultStyle) {
        this.defaultStyle = defaultStyle;
    }

    /**
     * 是否支持响应式配置。为假时设计器隐藏断点面板
     * @default true
     */
    @JsonProperty("responsive")
    private Boolean responsive;

    public Boolean getResponsive() {
        return responsive;
    }

    public void setResponsive(Boolean responsive) {
        this.responsive = responsive;
    }

    /**
     * @default false
     */
    @JsonProperty("deprecated")
    private Boolean deprecated;

    public Boolean getDeprecated() {
        return deprecated;
    }

    public void setDeprecated(Boolean deprecated) {
        this.deprecated = deprecated;
    }

    /**
     * 引入版本，如 0.1.0
     */
    @JsonProperty("since")
    private String since;

    public String getSince() {
        return since;
    }

    public void setSince(String since) {
        this.since = since;
    }

    /**
     * runtime=remote|sandbox 时的加载地址（须同时提供 integrity 校验）
     */
    @JsonProperty("source")
    private String source;

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    /**
     * 子资源完整性哈希，如 sha384-...。确保远程组件未被篡改
     */
    @JsonProperty("integrity")
    private String integrity;

    public String getIntegrity() {
        return integrity;
    }

    public void setIntegrity(String integrity) {
        this.integrity = integrity;
    }

    @JsonProperty("sandbox")
    private LogicSandboxPolicy sandbox;

    public LogicSandboxPolicy getSandbox() {
        return sandbox;
    }

    public void setSandbox(LogicSandboxPolicy sandbox) {
        this.sandbox = sandbox;
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
