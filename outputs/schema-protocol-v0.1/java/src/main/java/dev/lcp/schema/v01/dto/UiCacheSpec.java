// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.UiCacheSpecScope;
import jakarta.validation.constraints.AssertTrue;

public class UiCacheSpec {
    /**
     * @default false
     */
    @JsonProperty("enabled")
    private Boolean enabled;

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * 秒
     */
    @JsonProperty("ttl")
    private Integer ttl;

    public Integer getTtl() {
        return ttl;
    }

    public void setTtl(Integer ttl) {
        this.ttl = ttl;
    }

    /**
     * @default "page"
     */
    @JsonProperty("scope")
    private UiCacheSpecScope scope;

    public UiCacheSpecScope getScope() {
        return scope;
    }

    public void setScope(UiCacheSpecScope scope) {
        this.scope = scope;
    }

    /**
     * 缓存键，缺省由数据源 id + 参数哈希生成
     */
    @JsonProperty("keyExpr")
    private CommonExpr keyExpr;

    public CommonExpr getKeyExpr() {
        return keyExpr;
    }

    public void setKeyExpr(CommonExpr keyExpr) {
        this.keyExpr = keyExpr;
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
