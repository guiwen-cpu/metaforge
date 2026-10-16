// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiMenuItemTarget;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class UiMenuItem {
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

    @JsonProperty("icon")
    private String icon;

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    @JsonProperty("pageRef")
    private CommonArtifactRef pageRef;

    public CommonArtifactRef getPageRef() {
        return pageRef;
    }

    public void setPageRef(CommonArtifactRef pageRef) {
        this.pageRef = pageRef;
    }

    @JsonProperty("url")
    private String url;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    /**
     * @default "_self"
     */
    @JsonProperty("target")
    private UiMenuItemTarget target;

    public UiMenuItemTarget getTarget() {
        return target;
    }

    public void setTarget(UiMenuItemTarget target) {
        this.target = target;
    }

    @JsonProperty("order")
    private Integer order;

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }

    @JsonProperty("visible")
    private CommonExpr visible;

    public CommonExpr getVisible() {
        return visible;
    }

    public void setVisible(CommonExpr visible) {
        this.visible = visible;
    }

    @JsonProperty("roles")
    private List<String> roles;

    public List<String> getRoles() {
        return roles;
    }

    public void setRoles(List<String> roles) {
        this.roles = roles;
    }

    @JsonProperty("badge")
    private CommonExpr badge;

    public CommonExpr getBadge() {
        return badge;
    }

    public void setBadge(CommonExpr badge) {
        this.badge = badge;
    }

    @JsonProperty("children")
    private List<UiMenuItem> children;

    public List<UiMenuItem> getChildren() {
        return children;
    }

    public void setChildren(List<UiMenuItem> children) {
        this.children = children;
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
