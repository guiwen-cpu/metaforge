// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicNotificationChannel;
import dev.lcp.schema.v01.enums.LogicNotificationEvent;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * kind=notification 的规则配置。targets 复用人员选择器，表达式结果可返回用户 ID 或 ID 数组。
 */
public class LogicNotificationRuleConfig {
    /**
     * @minItems 1
     */
    @Size(min = 1)
    @JsonProperty("events")
    private List<LogicNotificationEvent> events;

    public List<LogicNotificationEvent> getEvents() {
        return events;
    }

    public void setEvents(List<LogicNotificationEvent> events) {
        this.events = events;
    }

    /**
     * 必填字段（required 且无 default）。
     * @minItems 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("channels")
    private List<LogicNotificationChannel> channels;

    public List<LogicNotificationChannel> getChannels() {
        return channels;
    }

    public void setChannels(List<LogicNotificationChannel> channels) {
        this.channels = channels;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("targets")
    private List<LogicAssigneeSpec> targets;

    public List<LogicAssigneeSpec> getTargets() {
        return targets;
    }

    public void setTargets(List<LogicAssigneeSpec> targets) {
        this.targets = targets;
    }

    @JsonProperty("title")
    private CommonExpr title;

    public CommonExpr getTitle() {
        return title;
    }

    public void setTitle(CommonExpr title) {
        this.title = title;
    }

    @JsonProperty("body")
    private CommonExpr body;

    public CommonExpr getBody() {
        return body;
    }

    public void setBody(CommonExpr body) {
        this.body = body;
    }

    @JsonProperty("link")
    private CommonExpr link;

    public CommonExpr getLink() {
        return link;
    }

    public void setLink(CommonExpr link) {
        this.link = link;
    }

    @JsonProperty("connectionRef")
    private CommonArtifactRef connectionRef;

    public CommonArtifactRef getConnectionRef() {
        return connectionRef;
    }

    public void setConnectionRef(CommonArtifactRef connectionRef) {
        this.connectionRef = connectionRef;
    }

    /**
     * 连接器 baseUrl 下的相对路径
     */
    @JsonProperty("path")
    private String path;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    /**
     * 投递幂等键；缺省按规则、事件与业务对象生成
     */
    @JsonProperty("idempotencyKey")
    private CommonExpr idempotencyKey;

    public CommonExpr getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(CommonExpr idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
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
