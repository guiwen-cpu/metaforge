// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.BundleRoleDefDataScope;
import dev.lcp.schema.v01.enums.BundleRoleDefLevel;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 角色定义。dataScope 是数据权限的语义层，编译期下推为 SQL 条件；custom 时才用 customRule，避免所有角色都靠手写条件。
 */
public class BundleRoleDef {
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
     * @default "app"
     */
    @JsonProperty("level")
    private BundleRoleDefLevel level;

    public BundleRoleDefLevel getLevel() {
        return level;
    }

    public void setLevel(BundleRoleDefLevel level) {
        this.level = level;
    }

    /**
     * 平台内置角色，租户不可删除（如 租户管理员 / 教师 / 学生 / 家长）
     * @default false
     */
    @JsonProperty("builtin")
    private Boolean builtin;

    public Boolean getBuiltin() {
        return builtin;
    }

    public void setBuiltin(Boolean builtin) {
        this.builtin = builtin;
    }

    /**
     * @default "self"
     */
    @JsonProperty("dataScope")
    private BundleRoleDefDataScope dataScope;

    public BundleRoleDefDataScope getDataScope() {
        return dataScope;
    }

    public void setDataScope(BundleRoleDefDataScope dataScope) {
        this.dataScope = dataScope;
    }

    /**
     * dataScope=custom 时的行级条件表达式
     */
    @JsonProperty("customRule")
    private CommonExpr customRule;

    public CommonExpr getCustomRule() {
        return customRule;
    }

    public void setCustomRule(CommonExpr customRule) {
        this.customRule = customRule;
    }

    /**
     * 角色继承，权限取并集
     */
    @JsonProperty("inheritFrom")
    private List<String> inheritFrom;

    public List<String> getInheritFrom() {
        return inheritFrom;
    }

    public void setInheritFrom(List<String> inheritFrom) {
        this.inheritFrom = inheritFrom;
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
