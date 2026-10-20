// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicApiKind;
import dev.lcp.schema.v01.enums.LogicApiMethod;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * API 编排工件。所有对外/对内调用都声明在这里，动作只引用 —— 使鉴权、限流、重试、留痕、Mock 有单一收口点。
 */
public class LogicApi {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
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

    @JsonProperty("description")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * @default "rest"
     */
    @JsonProperty("kind")
    private LogicApiKind kind;

    public LogicApiKind getKind() {
        return kind;
    }

    public void setKind(LogicApiKind kind) {
        this.kind = kind;
    }

    /**
     * @default "GET"
     */
    @JsonProperty("method")
    private LogicApiMethod method;

    public LogicApiMethod getMethod() {
        return method;
    }

    public void setMethod(LogicApiMethod method) {
        this.method = method;
    }

    /**
     * 相对路径，支持 :id 占位，如 /students/:id
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    /**
     * 绝对地址；内部 API 缺省走 BFF 网关
     */
    @JsonProperty("baseUrl")
    private String baseUrl;

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * 引用租户连接器（kind=connection）。连接器保存 baseUrl、超时、公共请求头与默认鉴权，凭证本身仍以密钥库引用表示。API 的 baseUrl 可覆盖连接器默认值。
     */
    @JsonProperty("connectionRef")
    private CommonArtifactRef connectionRef;

    public CommonArtifactRef getConnectionRef() {
        return connectionRef;
    }

    public void setConnectionRef(CommonArtifactRef connectionRef) {
        this.connectionRef = connectionRef;
    }

    @JsonProperty("auth")
    private LogicApiAuth auth;

    public LogicApiAuth getAuth() {
        return auth;
    }

    public void setAuth(LogicApiAuth auth) {
        this.auth = auth;
    }

    /**
     * @default 10000
     */
    @JsonProperty("timeoutMs")
    private Integer timeoutMs;

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    @JsonProperty("retry")
    private LogicApiRetry retry;

    public LogicApiRetry getRetry() {
        return retry;
    }

    public void setRetry(LogicApiRetry retry) {
        this.retry = retry;
    }

    @JsonProperty("cache")
    private LogicApiCache cache;

    public LogicApiCache getCache() {
        return cache;
    }

    public void setCache(LogicApiCache cache) {
        this.cache = cache;
    }

    @JsonProperty("rateLimit")
    private LogicApiRateLimit rateLimit;

    public LogicApiRateLimit getRateLimit() {
        return rateLimit;
    }

    public void setRateLimit(LogicApiRateLimit rateLimit) {
        this.rateLimit = rateLimit;
    }

    @JsonProperty("request")
    private LogicApiRequest request;

    public LogicApiRequest getRequest() {
        return request;
    }

    public void setRequest(LogicApiRequest request) {
        this.request = request;
    }

    @JsonProperty("response")
    private LogicApiResponse response;

    public LogicApiResponse getResponse() {
        return response;
    }

    public void setResponse(LogicApiResponse response) {
        this.response = response;
    }

    /**
     * 请求前编排：取 token、算签名、拼参
     */
    @JsonProperty("before")
    private List<LogicStep> before;

    public List<LogicStep> getBefore() {
        return before;
    }

    public void setBefore(List<LogicStep> before) {
        this.before = before;
    }

    /**
     * 响应后编排：落库、转换、发事件
     */
    @JsonProperty("after")
    private List<LogicStep> after;

    public List<LogicStep> getAfter() {
        return after;
    }

    public void setAfter(List<LogicStep> after) {
        this.after = after;
    }

    @JsonProperty("mock")
    private LogicApiMock mock;

    public LogicApiMock getMock() {
        return mock;
    }

    public void setMock(LogicApiMock mock) {
        this.mock = mock;
    }

    /**
     * @default false
     */
    @JsonProperty("idempotent")
    private Boolean idempotent;

    public Boolean getIdempotent() {
        return idempotent;
    }

    public void setIdempotent(Boolean idempotent) {
        this.idempotent = idempotent;
    }

    @JsonProperty("tags")
    private List<String> tags;

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    @JsonProperty("access")
    private CommonAccess access;

    public CommonAccess getAccess() {
        return access;
    }

    public void setAccess(CommonAccess access) {
        this.access = access;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** x- 扩展键：平台原样透传、不参与校验。 */
    @JsonAnyGetter
    public Map<String, JsonNode> extensions() {
        return extensions;
    }

    @JsonAnySetter
    public void putExtension(String key, JsonNode value) {
        extensions.put(key, value);
    }

    private final Map<String, JsonNode> extensions = new LinkedHashMap<>();
}
