// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BundleArtifacts {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("dataSchemas")
    private List<DataSchema> dataSchemas;

    public List<DataSchema> getDataSchemas() {
        return dataSchemas;
    }

    public void setDataSchemas(List<DataSchema> dataSchemas) {
        this.dataSchemas = dataSchemas;
    }

    @JsonProperty("uiSchemas")
    private List<UISchema> uiSchemas;

    public List<UISchema> getUiSchemas() {
        return uiSchemas;
    }

    public void setUiSchemas(List<UISchema> uiSchemas) {
        this.uiSchemas = uiSchemas;
    }

    @JsonProperty("logicSchemas")
    private List<LogicSchema> logicSchemas;

    public List<LogicSchema> getLogicSchemas() {
        return logicSchemas;
    }

    public void setLogicSchemas(List<LogicSchema> logicSchemas) {
        this.logicSchemas = logicSchemas;
    }

    /**
     * 随应用分发的自定义组件契约。平台内建组件不入包
     */
    @JsonProperty("components")
    private List<ComponentContract> components;

    public List<ComponentContract> getComponents() {
        return components;
    }

    public void setComponents(List<ComponentContract> components) {
        this.components = components;
    }

    @JsonProperty("enums")
    private List<DataEnumDef> enums;

    public List<DataEnumDef> getEnums() {
        return enums;
    }

    public void setEnums(List<DataEnumDef> enums) {
        this.enums = enums;
    }

    @JsonProperty("roles")
    private List<BundleRoleDef> roles;

    public List<BundleRoleDef> getRoles() {
        return roles;
    }

    public void setRoles(List<BundleRoleDef> roles) {
        this.roles = roles;
    }

    @JsonProperty("permissions")
    private List<BundlePermissionGrant> permissions;

    public List<BundlePermissionGrant> getPermissions() {
        return permissions;
    }

    public void setPermissions(List<BundlePermissionGrant> permissions) {
        this.permissions = permissions;
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
