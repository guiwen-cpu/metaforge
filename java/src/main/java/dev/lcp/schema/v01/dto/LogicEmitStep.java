// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;

/**
 * 发出领域事件，供集成层与异步消费者订阅。这是「业务逻辑」与「集成能力」的解耦点。
 */
public class LogicEmitStep implements LogicStep {
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

    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
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
     * @default false
     */
    @JsonProperty("disabled")
    private Boolean disabled;

    public Boolean getDisabled() {
        return disabled;
    }

    public void setDisabled(Boolean disabled) {
        this.disabled = disabled;
    }

    @JsonProperty("onError")
    private List<LogicStep> onError;

    public List<LogicStep> getOnError() {
        return onError;
    }

    public void setOnError(List<LogicStep> onError) {
        this.onError = onError;
    }

    /**
     * @default false
     */
    @JsonProperty("continueOnError")
    private Boolean continueOnError;

    public Boolean getContinueOnError() {
        return continueOnError;
    }

    public void setContinueOnError(Boolean continueOnError) {
        this.continueOnError = continueOnError;
    }

    @JsonProperty("note")
    private String note;

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "emit"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "emit";

    public String getType() {
        return type;
    }

    /**
     * 事件名。业务事件用点分层（leave.approved），平台事件用冒号分层（ds:<dataSourceId>:refresh、page:<pageKey>:<action>）。
     * 必填字段（required 且无 default）。
     * @pattern ^[a-z][a-z0-9_]*(?:[.:][A-Za-z0-9_]+)+$
     */
    @NotNull
    @Pattern(regexp = "^[a-z][a-z0-9_]*(?:[.:][A-Za-z0-9_]+)+$")
    @JsonProperty("event")
    private String event;

    public String getEvent() {
        return event;
    }

    public void setEvent(String event) {
        this.event = event;
    }

    @JsonProperty("payload")
    private Map<String, JsonNode> payload;

    public Map<String, JsonNode> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, JsonNode> payload) {
        this.payload = payload;
    }

    /**
     * 为真则等待订阅者完成；慎用，会把外部故障引入主链路
     * @default false
     */
    @JsonProperty("sync")
    private Boolean sync;

    public Boolean getSync() {
        return sync;
    }

    public void setSync(Boolean sync) {
        this.sync = sync;
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
