// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiRouteSpecCache;
import dev.lcp.schema.v01.enums.UiRouteSpecLayout;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;

public class UiRouteSpec {
    /**
     * 支持 :id 动态段、:id? 可选段、(*) 正则组等 vue-router 语法
     * 必填字段（required 且无 default）。
     * @pattern ^/[A-Za-z0-9_\-/:*?()]*$
     */
    @NotNull
    @Pattern(regexp = "^/[A-Za-z0-9_\\-/:*?()]*$")
    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    /**
     * @default "default"
     */
    @JsonProperty("layout")
    private UiRouteSpecLayout layout;

    public UiRouteSpecLayout getLayout() {
        return layout;
    }

    public void setLayout(UiRouteSpecLayout layout) {
        this.layout = layout;
    }

    /**
     * @default false
     */
    @JsonProperty("keepAlive")
    private Boolean keepAlive;

    public Boolean getKeepAlive() {
        return keepAlive;
    }

    public void setKeepAlive(Boolean keepAlive) {
        this.keepAlive = keepAlive;
    }

    /**
     * @default "none"
     */
    @JsonProperty("cache")
    private UiRouteSpecCache cache;

    public UiRouteSpecCache getCache() {
        return cache;
    }

    public void setCache(UiRouteSpecCache cache) {
        this.cache = cache;
    }

    /**
     * @default true
     */
    @JsonProperty("auth")
    private Boolean auth;

    public Boolean getAuth() {
        return auth;
    }

    public void setAuth(Boolean auth) {
        this.auth = auth;
    }

    @JsonProperty("roles")
    private List<String> roles;

    public List<String> getRoles() {
        return roles;
    }

    public void setRoles(List<String> roles) {
        this.roles = roles;
    }

    @JsonProperty("redirect")
    private String redirect;

    public String getRedirect() {
        return redirect;
    }

    public void setRedirect(String redirect) {
        this.redirect = redirect;
    }

    @JsonProperty("meta")
    private Map<String, JsonNode> meta;

    public Map<String, JsonNode> getMeta() {
        return meta;
    }

    public void setMeta(Map<String, JsonNode> meta) {
        this.meta = meta;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }
}
