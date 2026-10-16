// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.LogicActionTrigger;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 具名动作，可被页面、组件事件、流程监听器、其他动作复用。步骤串行执行，任一步失败即中断冒泡（除非该步声明 continueOnError 或 onError）。
 */
public class LogicAction {
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
     * @default "manual"
     */
    @JsonProperty("trigger")
    private LogicActionTrigger trigger;

    public LogicActionTrigger getTrigger() {
        return trigger;
    }

    public void setTrigger(LogicActionTrigger trigger) {
        this.trigger = trigger;
    }

    @JsonProperty("params")
    private List<LogicActionParam> params;

    public List<LogicActionParam> getParams() {
        return params;
    }

    public void setParams(List<LogicActionParam> params) {
        this.params = params;
    }

    /**
     * 前置条件，为假则整体跳过（不视为错误）
     */
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
    @JsonProperty("steps")
    private List<LogicStep> steps;

    public List<LogicStep> getSteps() {
        return steps;
    }

    public void setSteps(List<LogicStep> steps) {
        this.steps = steps;
    }

    /**
     * 整个动作包裹在数据库事务内。含外部 HTTP 调用时开启会长时间持锁，L4 校验告警
     * @default false
     */
    @JsonProperty("transaction")
    private Boolean transaction;

    public Boolean getTransaction() {
        return transaction;
    }

    public void setTransaction(Boolean transaction) {
        this.transaction = transaction;
    }

    /**
     * 为真时运行时按幂等键（动作 key + 关键入参哈希）去重，防重复点击提交
     * @default true
     */
    @JsonProperty("idempotent")
    private Boolean idempotent;

    public Boolean getIdempotent() {
        return idempotent;
    }

    public void setIdempotent(Boolean idempotent) {
        this.idempotent = idempotent;
    }

    /**
     * @default 30000
     */
    @JsonProperty("timeoutMs")
    private Integer timeoutMs;

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer timeoutMs) {
        this.timeoutMs = timeoutMs;
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
