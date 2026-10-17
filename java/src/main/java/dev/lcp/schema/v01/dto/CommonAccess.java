// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.CommonAccessFieldPolicyValue;
import dev.lcp.schema.v01.enums.CommonAccessScope;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据权限。设计期声明、编译期下推为 SQL 条件与字段裁剪，运行期不再解释。
 */
public class CommonAccess {
    /**
     * 允许的角色 key。缺省=继承上层；空数组=仅超管
     */
    @JsonProperty("roles")
    private List<String> roles;

    public List<String> getRoles() {
        return roles;
    }

    public void setRoles(List<String> roles) {
        this.roles = roles;
    }

    /**
     * 数据范围。self 依赖 ownerField，dept 依赖 deptField
     */
    @JsonProperty("scope")
    private CommonAccessScope scope;

    public CommonAccessScope getScope() {
        return scope;
    }

    public void setScope(CommonAccessScope scope) {
        this.scope = scope;
    }

    /**
     * 数据归属字段（通常指向用户 id）
     */
    @JsonProperty("ownerField")
    private String ownerField;

    public String getOwnerField() {
        return ownerField;
    }

    public void setOwnerField(String ownerField) {
        this.ownerField = ownerField;
    }

    @JsonProperty("deptField")
    private String deptField;

    public String getDeptField() {
        return deptField;
    }

    public void setDeptField(String deptField) {
        this.deptField = deptField;
    }

    /**
     * 行级过滤表达式，编译为追加的 WHERE 条件。禁止在此处调用非纯函数。
     */
    @JsonProperty("rowFilter")
    private CommonExpr rowFilter;

    public CommonExpr getRowFilter() {
        return rowFilter;
    }

    public void setRowFilter(CommonExpr rowFilter) {
        this.rowFilter = rowFilter;
    }

    /**
     * 为真则整体拒绝，优先级高于 roles
     */
    @JsonProperty("denyWhen")
    private CommonExpr denyWhen;

    public CommonExpr getDenyWhen() {
        return denyWhen;
    }

    public void setDenyWhen(CommonExpr denyWhen) {
        this.denyWhen = denyWhen;
    }

    /**
     * 字段级策略：hidden 不出现在 API 响应；masked 按脱敏函数输出；read 只读
     */
    @JsonProperty("fieldPolicy")
    private Map<String, CommonAccessFieldPolicyValue> fieldPolicy;

    public Map<String, CommonAccessFieldPolicyValue> getFieldPolicy() {
        return fieldPolicy;
    }

    public void setFieldPolicy(Map<String, CommonAccessFieldPolicyValue> fieldPolicy) {
        this.fieldPolicy = fieldPolicy;
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
