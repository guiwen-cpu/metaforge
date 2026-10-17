// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.BundlePermissionGrantActionsItem;
import dev.lcp.schema.v01.enums.BundlePermissionGrantResourceType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BundlePermissionGrant {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("roleKey")
    private String roleKey;

    public String getRoleKey() {
        return roleKey;
    }

    public void setRoleKey(String roleKey) {
        this.roleKey = roleKey;
    }

    /**
     * 资源标识：实体 key / 页面 key / 动作 key / api:xxx / *
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("resource")
    private String resource;

    public String getResource() {
        return resource;
    }

    public void setResource(String resource) {
        this.resource = resource;
    }

    /**
     * @default "entity"
     */
    @JsonProperty("resourceType")
    private BundlePermissionGrantResourceType resourceType;

    public BundlePermissionGrantResourceType getResourceType() {
        return resourceType;
    }

    public void setResourceType(BundlePermissionGrantResourceType resourceType) {
        this.resourceType = resourceType;
    }

    /**
     * 允许的操作。数据操作（create/read/update/delete/list/export/import）+ 流程办理动作（approve/reject/return/transfer/addSign，与 TaskForm.buttons[].outcome 同一套取值）+ 动作编排的 execute 权 + 通配 *。
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("actions")
    private List<BundlePermissionGrantActionsItem> actions;

    public List<BundlePermissionGrantActionsItem> getActions() {
        return actions;
    }

    public void setActions(List<BundlePermissionGrantActionsItem> actions) {
        this.actions = actions;
    }

    /**
     * 字段级授权；缺省全部字段
     */
    @JsonProperty("fields")
    private List<String> fields;

    public List<String> getFields() {
        return fields;
    }

    public void setFields(List<String> fields) {
        this.fields = fields;
    }

    /**
     * 附加条件，为真才授权。用于「仅本学院可见」这类场景
     */
    @JsonProperty("condition")
    private CommonExpr condition;

    public CommonExpr getCondition() {
        return condition;
    }

    public void setCondition(CommonExpr condition) {
        this.condition = condition;
    }

    /**
     * 是否向子角色/子部门传递
     * @default true
     */
    @JsonProperty("inherit")
    private Boolean inherit;

    public Boolean getInherit() {
        return inherit;
    }

    public void setInherit(Boolean inherit) {
        this.inherit = inherit;
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
