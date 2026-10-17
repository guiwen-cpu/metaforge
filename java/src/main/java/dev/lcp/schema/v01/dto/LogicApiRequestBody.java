// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicApiRequestBodyContentType;
import jakarta.validation.constraints.AssertTrue;
import java.util.Map;

public class LogicApiRequestBody {
    /**
     * @default "application/json"
     */
    @JsonProperty("contentType")
    private LogicApiRequestBodyContentType contentType;

    public LogicApiRequestBodyContentType getContentType() {
        return contentType;
    }

    public void setContentType(LogicApiRequestBodyContentType contentType) {
        this.contentType = contentType;
    }

    /**
     * 请求体结构（JSON Schema 片段或类型描述），用于设计器渲染与 AI 提示
     */
    @JsonProperty("schema")
    private JsonNode schema;

    public JsonNode getSchema() {
        return schema;
    }

    public void setSchema(JsonNode schema) {
        this.schema = schema;
    }

    /**
     * 出参映射：目标字段 -> 表达式
     */
    @JsonProperty("mapping")
    private Map<String, CommonExpr> mapping;

    public Map<String, CommonExpr> getMapping() {
        return mapping;
    }

    public void setMapping(Map<String, CommonExpr> mapping) {
        this.mapping = mapping;
    }

    /**
     * 整体表达式构造请求体，与 mapping 二选一
     */
    @JsonProperty("raw")
    private CommonExpr raw;

    public CommonExpr getRaw() {
        return raw;
    }

    public void setRaw(CommonExpr raw) {
        this.raw = raw;
    }
}
