// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicApiAuthApiKeyIn;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class LogicApiAuthApiKey implements LogicApiAuth {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "apiKey"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "apiKey";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
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
    @JsonProperty("in")
    private LogicApiAuthApiKeyIn in;

    public LogicApiAuthApiKeyIn getIn() {
        return in;
    }

    public void setIn(LogicApiAuthApiKeyIn in) {
        this.in = in;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("valueRef")
    private String valueRef;

    public String getValueRef() {
        return valueRef;
    }

    public void setValueRef(String valueRef) {
        this.valueRef = valueRef;
    }
}
