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
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审批节点的人员与表单配置。taskKey 必须与 BPMN 中 userTask 的 id 一致（L3 校验会解析 BPMN 比对）。
 */
public class LogicTaskForm {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("taskKey")
    private String taskKey;

    public String getTaskKey() {
        return taskKey;
    }

    public void setTaskKey(String taskKey) {
        this.taskKey = taskKey;
    }

    @JsonProperty("name")
    private CommonText name;

    public CommonText getName() {
        return name;
    }

    public void setName(CommonText name) {
        this.name = name;
    }

    /**
     * 办理该节点使用的页面（审批页 kind=approval）
     */
    @JsonProperty("pageRef")
    private CommonArtifactRef pageRef;

    public CommonArtifactRef getPageRef() {
        return pageRef;
    }

    public void setPageRef(CommonArtifactRef pageRef) {
        this.pageRef = pageRef;
    }

    @JsonProperty("assignee")
    private LogicAssigneeSpec assignee;

    public LogicAssigneeSpec getAssignee() {
        return assignee;
    }

    public void setAssignee(LogicAssigneeSpec assignee) {
        this.assignee = assignee;
    }

    @JsonProperty("candidateRoles")
    private List<String> candidateRoles;

    public List<String> getCandidateRoles() {
        return candidateRoles;
    }

    public void setCandidateRoles(List<String> candidateRoles) {
        this.candidateRoles = candidateRoles;
    }

    /**
     * 本节点可编辑的业务字段（相对发起时的表单）
     */
    @JsonProperty("editableFields")
    private List<String> editableFields;

    public List<String> getEditableFields() {
        return editableFields;
    }

    public void setEditableFields(List<String> editableFields) {
        this.editableFields = editableFields;
    }

    @JsonProperty("requiredFields")
    private List<String> requiredFields;

    public List<String> getRequiredFields() {
        return requiredFields;
    }

    public void setRequiredFields(List<String> requiredFields) {
        this.requiredFields = requiredFields;
    }

    @JsonProperty("readonlyFields")
    private List<String> readonlyFields;

    public List<String> getReadonlyFields() {
        return readonlyFields;
    }

    public void setReadonlyFields(List<String> readonlyFields) {
        this.readonlyFields = readonlyFields;
    }

    @JsonProperty("buttons")
    private List<LogicTaskFormButtonsItem> buttons;

    public List<LogicTaskFormButtonsItem> getButtons() {
        return buttons;
    }

    public void setButtons(List<LogicTaskFormButtonsItem> buttons) {
        this.buttons = buttons;
    }

    @JsonProperty("dueDateHours")
    private BigDecimal dueDateHours;

    public BigDecimal getDueDateHours() {
        return dueDateHours;
    }

    public void setDueDateHours(BigDecimal dueDateHours) {
        this.dueDateHours = dueDateHours;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /**
     * 办理意见（同意/驳回理由）写入的流程变量名，必须出现在 Flow.variables[].name 中。办理意见不是实体字段，所以不放进 editableFields/requiredFields。
     * @pattern ^[a-z][a-zA-Z0-9]{1,62}$
     */
    @Pattern(regexp = "^[a-z][a-zA-Z0-9]{1,62}$")
    @JsonProperty("commentField")
    private String commentField;

    public String getCommentField() {
        return commentField;
    }

    public void setCommentField(String commentField) {
        this.commentField = commentField;
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
