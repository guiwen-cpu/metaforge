// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.CommonScope;
import dev.lcp.schema.v01.enums.UiPageKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class UISchema {
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
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
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

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("kind")
    private UiPageKind kind;

    public UiPageKind getKind() {
        return kind;
    }

    public void setKind(UiPageKind kind) {
        this.kind = kind;
    }

    @JsonProperty("scope")
    private CommonScope scope;

    public CommonScope getScope() {
        return scope;
    }

    public void setScope(CommonScope scope) {
        this.scope = scope;
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

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    @JsonProperty("route")
    private UiRouteSpec route;

    public UiRouteSpec getRoute() {
        return route;
    }

    public void setRoute(UiRouteSpec route) {
        this.route = route;
    }

    @JsonProperty("params")
    private List<UiPageParam> params;

    public List<UiPageParam> getParams() {
        return params;
    }

    public void setParams(List<UiPageParam> params) {
        this.params = params;
    }

    @JsonProperty("dataSources")
    private List<UiDataSource> dataSources;

    public List<UiDataSource> getDataSources() {
        return dataSources;
    }

    public void setDataSources(List<UiDataSource> dataSources) {
        this.dataSources = dataSources;
    }

    /**
     * 页面级响应式状态，供表达式以 $page.state.<key> 引用
     */
    @JsonProperty("state")
    private Map<String, UiStateVar> state;

    public Map<String, UiStateVar> getState() {
        return state;
    }

    public void setState(Map<String, UiStateVar> state) {
        this.state = state;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("layout")
    private UINode layout;

    public UINode getLayout() {
        return layout;
    }

    public void setLayout(UINode layout) {
        this.layout = layout;
    }

    /**
     * 具名弹窗/抽屉的子树，供 openDialog 动作按 key 打开（新建/编辑弹窗表单走这里）
     */
    @JsonProperty("dialogs")
    private Map<String, UINode> dialogs;

    public Map<String, UINode> getDialogs() {
        return dialogs;
    }

    public void setDialogs(Map<String, UINode> dialogs) {
        this.dialogs = dialogs;
    }

    /**
     * 页面级事件：onLoad / onMount / onParamChange / onUnmount / onError / onBeforeLeave。值可以是动作引用、内联步骤或沙箱代码钩子。
     */
    @JsonProperty("handlers")
    private Map<String, UiNodeHandlerRef> handlers;

    public Map<String, UiNodeHandlerRef> getHandlers() {
        return handlers;
    }

    public void setHandlers(Map<String, UiNodeHandlerRef> handlers) {
        this.handlers = handlers;
    }

    @JsonProperty("access")
    private CommonAccess access;

    public CommonAccess getAccess() {
        return access;
    }

    public void setAccess(CommonAccess access) {
        this.access = access;
    }

    @JsonProperty("seo")
    private UISchemaSeo seo;

    public UISchemaSeo getSeo() {
        return seo;
    }

    public void setSeo(UISchemaSeo seo) {
        this.seo = seo;
    }

    @JsonProperty("origin")
    private UiOrigin origin;

    public UiOrigin getOrigin() {
        return origin;
    }

    public void setOrigin(UiOrigin origin) {
        this.origin = origin;
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
