// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

/**
 * 沙箱能力白名单，默认全拒 —— 需要什么显式开什么。自定义组件与自定义代码共用同一套策略模型（C/D 项落地）。
 */
public class LogicSandboxPolicy {
    /**
     * 允许 fetch/XHR；为真时必须同时声明 allowedHosts
     * @default false
     */
    @JsonProperty("network")
    private Boolean network;

    public Boolean getNetwork() {
        return network;
    }

    public void setNetwork(Boolean network) {
        this.network = network;
    }

    /**
     * 域名白名单，支持 *.example.com
     */
    @JsonProperty("allowedHosts")
    private List<String> allowedHosts;

    public List<String> getAllowedHosts() {
        return allowedHosts;
    }

    public void setAllowedHosts(List<String> allowedHosts) {
        this.allowedHosts = allowedHosts;
    }

    /**
     * 允许 localStorage/sessionStorage
     * @default false
     */
    @JsonProperty("storage")
    private Boolean storage;

    public Boolean getStorage() {
        return storage;
    }

    public void setStorage(Boolean storage) {
        this.storage = storage;
    }

    /**
     * 允许访问宿主 DOM；沙箱组件默认 false
     * @default false
     */
    @JsonProperty("dom")
    private Boolean dom;

    public Boolean getDom() {
        return dom;
    }

    public void setDom(Boolean dom) {
        this.dom = dom;
    }

    /**
     * @default false
     */
    @JsonProperty("cookies")
    private Boolean cookies;

    public Boolean getCookies() {
        return cookies;
    }

    public void setCookies(Boolean cookies) {
        this.cookies = cookies;
    }

    /**
     * @default false
     */
    @JsonProperty("clipboard")
    private Boolean clipboard;

    public Boolean getClipboard() {
        return clipboard;
    }

    public void setClipboard(Boolean clipboard) {
        this.clipboard = clipboard;
    }

    /**
     * @default false
     */
    @JsonProperty("navigation")
    private Boolean navigation;

    public Boolean getNavigation() {
        return navigation;
    }

    public void setNavigation(Boolean navigation) {
        this.navigation = navigation;
    }

    /**
     * 允许 import 的模块白名单，如 ['lodash-es','dayjs']
     */
    @JsonProperty("allowedModules")
    private List<String> allowedModules;

    public List<String> getAllowedModules() {
        return allowedModules;
    }

    public void setAllowedModules(List<String> allowedModules) {
        this.allowedModules = allowedModules;
    }

    /**
     * @default false
     */
    @JsonProperty("allowEval")
    private Boolean allowEval;

    public Boolean getAllowEval() {
        return allowEval;
    }

    public void setAllowEval(Boolean allowEval) {
        this.allowEval = allowEval;
    }

    /**
     * @default 64
     */
    @JsonProperty("memoryLimitMb")
    private Integer memoryLimitMb;

    public Integer getMemoryLimitMb() {
        return memoryLimitMb;
    }

    public void setMemoryLimitMb(Integer memoryLimitMb) {
        this.memoryLimitMb = memoryLimitMb;
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
