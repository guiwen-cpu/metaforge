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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审批流绑定。BPMN XML 作为独立资产版本化（bpmnRef），LogicSchema 只声明 processKey 与业务字段到流程变量的映射 —— 流程可单独回滚、可 diff，且不污染业务表结构。
 */
public class LogicFlow {
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
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "flowable"
     */
    @NotNull
    @JsonProperty("engine")
    private String engine = "flowable";

    public String getEngine() {
        return engine;
    }

    /**
     * Flowable process definition key，租户内唯一
     * 必填字段（required 且无 default）。
     * @pattern ^[a-zA-Z][a-zA-Z0-9_]{2,63}$
     */
    @NotNull
    @Pattern(regexp = "^[a-zA-Z][a-zA-Z0-9_]{2,63}$")
    @JsonProperty("processKey")
    private String processKey;

    public String getProcessKey() {
        return processKey;
    }

    public void setProcessKey(String processKey) {
        this.processKey = processKey;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("bpmnRef")
    private CommonAssetRef bpmnRef;

    public CommonAssetRef getBpmnRef() {
        return bpmnRef;
    }

    public void setBpmnRef(CommonAssetRef bpmnRef) {
        this.bpmnRef = bpmnRef;
    }

    @JsonProperty("category")
    private String category;

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    /**
     * 该流程服务的业务实体，用于列表页展示流程状态列
     */
    @JsonProperty("entityRef")
    private CommonArtifactRef entityRef;

    public CommonArtifactRef getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(CommonArtifactRef entityRef) {
        this.entityRef = entityRef;
    }

    /**
     * 业务表中回写流程状态的字段
     */
    @JsonProperty("statusField")
    private String statusField;

    public String getStatusField() {
        return statusField;
    }

    public void setStatusField(String statusField) {
        this.statusField = statusField;
    }

    @JsonProperty("startableBy")
    private LogicAssigneeSpec startableBy;

    public LogicAssigneeSpec getStartableBy() {
        return startableBy;
    }

    public void setStartableBy(LogicAssigneeSpec startableBy) {
        this.startableBy = startableBy;
    }

    @JsonProperty("variables")
    private List<LogicVariableMapping> variables;

    public List<LogicVariableMapping> getVariables() {
        return variables;
    }

    public void setVariables(List<LogicVariableMapping> variables) {
        this.variables = variables;
    }

    @JsonProperty("taskForms")
    private List<LogicTaskForm> taskForms;

    public List<LogicTaskForm> getTaskForms() {
        return taskForms;
    }

    public void setTaskForms(List<LogicTaskForm> taskForms) {
        this.taskForms = taskForms;
    }

    @JsonProperty("listeners")
    private List<LogicFlowListener> listeners;

    public List<LogicFlowListener> getListeners() {
        return listeners;
    }

    public void setListeners(List<LogicFlowListener> listeners) {
        this.listeners = listeners;
    }

    @JsonProperty("deployment")
    private LogicFlowDeployment deployment;

    public LogicFlowDeployment getDeployment() {
        return deployment;
    }

    public void setDeployment(LogicFlowDeployment deployment) {
        this.deployment = deployment;
    }

    /**
     * 流程时限与超时策略。到时只产生事件/通知，不改业务数据。
     */
    @JsonProperty("sla")
    private LogicFlowSla sla;

    public LogicFlowSla getSla() {
        return sla;
    }

    public void setSla(LogicFlowSla sla) {
        this.sla = sla;
    }

    /**
     * 发起人可撤回
     * @default true
     */
    @JsonProperty("allowRecall")
    private Boolean allowRecall;

    public Boolean getAllowRecall() {
        return allowRecall;
    }

    public void setAllowRecall(Boolean allowRecall) {
        this.allowRecall = allowRecall;
    }

    /**
     * 审批人可退回上一节点
     * @default true
     */
    @JsonProperty("allowReturn")
    private Boolean allowReturn;

    public Boolean getAllowReturn() {
        return allowReturn;
    }

    public void setAllowReturn(Boolean allowReturn) {
        this.allowReturn = allowReturn;
    }

    /**
     * @default true
     */
    @JsonProperty("allowTransfer")
    private Boolean allowTransfer;

    public Boolean getAllowTransfer() {
        return allowTransfer;
    }

    public void setAllowTransfer(Boolean allowTransfer) {
        this.allowTransfer = allowTransfer;
    }

    /**
     * 加签。默认关闭 —— 会签语义复杂，需业务明确需要才开
     * @default false
     */
    @JsonProperty("allowAddSign")
    private Boolean allowAddSign;

    public Boolean getAllowAddSign() {
        return allowAddSign;
    }

    public void setAllowAddSign(Boolean allowAddSign) {
        this.allowAddSign = allowAddSign;
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
