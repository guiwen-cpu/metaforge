// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

public class LogicApiRequest {
    @JsonProperty("query")
    private List<LogicApiParam> query;

    public List<LogicApiParam> getQuery() {
        return query;
    }

    public void setQuery(List<LogicApiParam> query) {
        this.query = query;
    }

    @JsonProperty("path")
    private List<LogicApiParam> path;

    public List<LogicApiParam> getPath() {
        return path;
    }

    public void setPath(List<LogicApiParam> path) {
        this.path = path;
    }

    @JsonProperty("headers")
    private List<LogicHttpHeader> headers;

    public List<LogicHttpHeader> getHeaders() {
        return headers;
    }

    public void setHeaders(List<LogicHttpHeader> headers) {
        this.headers = headers;
    }

    @JsonProperty("body")
    private LogicApiRequestBody body;

    public LogicApiRequestBody getBody() {
        return body;
    }

    public void setBody(LogicApiRequestBody body) {
        this.body = body;
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
