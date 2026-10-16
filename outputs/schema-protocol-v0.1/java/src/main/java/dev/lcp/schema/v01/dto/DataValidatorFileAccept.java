// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class DataValidatorFileAccept implements DataValidator {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "fileAccept"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "fileAccept";

    public String getType() {
        return type;
    }

    /**
     * 如 ['pdf','docx','xlsx']
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("value")
    private List<String> value;

    public List<String> getValue() {
        return value;
    }

    public void setValue(List<String> value) {
        this.value = value;
    }

    @JsonProperty("message")
    private CommonText message;

    public CommonText getMessage() {
        return message;
    }

    public void setMessage(CommonText message) {
        this.message = message;
    }
}
