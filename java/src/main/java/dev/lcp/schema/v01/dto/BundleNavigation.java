// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BundleNavigation {
    @JsonProperty("menus")
    private List<UiMenuItem> menus;

    public List<UiMenuItem> getMenus() {
        return menus;
    }

    public void setMenus(List<UiMenuItem> menus) {
        this.menus = menus;
    }

    @JsonProperty("defaultRoute")
    private String defaultRoute;

    public String getDefaultRoute() {
        return defaultRoute;
    }

    public void setDefaultRoute(String defaultRoute) {
        this.defaultRoute = defaultRoute;
    }

    @JsonProperty("homePageRef")
    private String homePageRef;

    public String getHomePageRef() {
        return homePageRef;
    }

    public void setHomePageRef(String homePageRef) {
        this.homePageRef = homePageRef;
    }

    /**
     * @default true
     */
    @JsonProperty("breadcrumb")
    private Boolean breadcrumb;

    public Boolean getBreadcrumb() {
        return breadcrumb;
    }

    public void setBreadcrumb(Boolean breadcrumb) {
        this.breadcrumb = breadcrumb;
    }

    /**
     * 是否启用多标签页工作台（教务/办公系统常用）
     * @default false
     */
    @JsonProperty("tabs")
    private Boolean tabs;

    public Boolean getTabs() {
        return tabs;
    }

    public void setTabs(Boolean tabs) {
        this.tabs = tabs;
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
