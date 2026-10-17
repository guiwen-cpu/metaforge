// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import java.util.Map;

public class LogicApiResponse {
    /**
     * 响应结构描述，供设计器做字段联想与出码生成 TS 类型
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
     * 出参映射：目标字段 -> 响应体内的 JSONPath（如 $.data.id）或表达式。JSONPath 用于直取，表达式用于改名/拼接/兜底。
     */
    @JsonProperty("mapping")
    private Map<String, JsonNode> mapping;

    public Map<String, JsonNode> getMapping() {
        return mapping;
    }

    public void setMapping(Map<String, JsonNode> mapping) {
        this.mapping = mapping;
    }

    /**
     * 判定成功的表达式；缺省按 HTTP 2xx 与平台统一响应码
     */
    @JsonProperty("successWhen")
    private CommonExpr successWhen;

    public CommonExpr getSuccessWhen() {
        return successWhen;
    }

    public void setSuccessWhen(CommonExpr successWhen) {
        this.successWhen = successWhen;
    }

    /**
     * 列表数据的路径，如 $.data.rows
     */
    @JsonProperty("rowsPath")
    private String rowsPath;

    public String getRowsPath() {
        return rowsPath;
    }

    public void setRowsPath(String rowsPath) {
        this.rowsPath = rowsPath;
    }

    /**
     * 总数所在的路径，如 $.data.total
     */
    @JsonProperty("totalPath")
    private String totalPath;

    public String getTotalPath() {
        return totalPath;
    }

    public void setTotalPath(String totalPath) {
        this.totalPath = totalPath;
    }

    /**
     * 错误码/错误标记所在的路径
     */
    @JsonProperty("errorPath")
    private String errorPath;

    public String getErrorPath() {
        return errorPath;
    }

    public void setErrorPath(String errorPath) {
        this.errorPath = errorPath;
    }

    /**
     * 错误文案所在的路径，用于直接提示用户
     */
    @JsonProperty("errorMessagePath")
    private String errorMessagePath;

    public String getErrorMessagePath() {
        return errorMessagePath;
    }

    public void setErrorMessagePath(String errorMessagePath) {
        this.errorMessagePath = errorMessagePath;
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
