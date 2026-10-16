// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class LogicApiAuthBearer implements LogicApiAuth {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "bearer"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "bearer";

    public String getType() {
        return type;
    }

    @JsonProperty("tokenRef")
    private String tokenRef;

    public String getTokenRef() {
        return tokenRef;
    }

    public void setTokenRef(String tokenRef) {
        this.tokenRef = tokenRef;
    }

    @JsonProperty("tokenUrl")
    private String tokenUrl;

    public String getTokenUrl() {
        return tokenUrl;
    }

    public void setTokenUrl(String tokenUrl) {
        this.tokenUrl = tokenUrl;
    }

    /**
     * @default 60
     */
    @JsonProperty("refreshBeforeSec")
    private Integer refreshBeforeSec;

    public Integer getRefreshBeforeSec() {
        return refreshBeforeSec;
    }

    public void setRefreshBeforeSec(Integer refreshBeforeSec) {
        this.refreshBeforeSec = refreshBeforeSec;
    }
}
