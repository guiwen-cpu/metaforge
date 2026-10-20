// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicRuleKind;
import dev.lcp.schema.v01.enums.LogicRuleOn;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务规则。与动作的区别：规则是「有多个触发点、需要统一执行」的横切逻辑（如学籍校验），由运行时按 kind 与 entity 自动挂载。
 */
public class LogicRule {
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
     * @default "validation"
     */
    @JsonProperty("kind")
    private LogicRuleKind kind;

    public LogicRuleKind getKind() {
        return kind;
    }

    public void setKind(LogicRuleKind kind) {
        this.kind = kind;
    }

    @JsonProperty("entityRef")
    private CommonArtifactRef entityRef;

    public CommonArtifactRef getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(CommonArtifactRef entityRef) {
        this.entityRef = entityRef;
    }

    /**
     * @default "any"
     */
    @JsonProperty("on")
    private LogicRuleOn on;

    public LogicRuleOn getOn() {
        return on;
    }

    public void setOn(LogicRuleOn on) {
        this.on = on;
    }

    @JsonProperty("when")
    private CommonExpr when;

    public CommonExpr getWhen() {
        return when;
    }

    public void setWhen(CommonExpr when) {
        this.when = when;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("then")
    private List<LogicStep> then;

    public List<LogicStep> getThen() {
        return then;
    }

    public void setThen(List<LogicStep> then) {
        this.then = then;
    }

    /**
     * 数值越小越先执行
     * @default 100
     */
    @JsonProperty("priority")
    private Integer priority;

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    /**
     * @default true
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
     * @default true
     */
    @JsonProperty("stopOnFail")
    private Boolean stopOnFail;

    public Boolean getStopOnFail() {
        return stopOnFail;
    }

    public void setStopOnFail(Boolean stopOnFail) {
        this.stopOnFail = stopOnFail;
    }

    /**
     * kind=notification 时生效；then 不执行。
     */
    @JsonProperty("notification")
    private LogicNotificationRuleConfig notification;

    public LogicNotificationRuleConfig getNotification() {
        return notification;
    }

    public void setNotification(LogicNotificationRuleConfig notification) {
        this.notification = notification;
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
