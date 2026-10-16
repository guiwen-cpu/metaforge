// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicApiAuthOauth2Grant;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class LogicApiAuthOauth2 implements LogicApiAuth {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "oauth2"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "oauth2";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("grant")
    private LogicApiAuthOauth2Grant grant;

    public LogicApiAuthOauth2Grant getGrant() {
        return grant;
    }

    public void setGrant(LogicApiAuthOauth2Grant grant) {
        this.grant = grant;
    }

    @JsonProperty("provider")
    private String provider;

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    @JsonProperty("scopes")
    private List<String> scopes;

    public List<String> getScopes() {
        return scopes;
    }

    public void setScopes(List<String> scopes) {
        this.scopes = scopes;
    }

    @JsonProperty("tokenRef")
    private String tokenRef;

    public String getTokenRef() {
        return tokenRef;
    }

    public void setTokenRef(String tokenRef) {
        this.tokenRef = tokenRef;
    }
}
