// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.ComponentDataContractModelShape;
import dev.lcp.schema.v01.enums.ComponentDataContractRole;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

/**
 * 组件与数据源的约定。运行时据此把数据注入组件、暴露刷新/提交能力；出码时据此生成数据源订阅代码。
 */
public class ComponentDataContract {
    /**
     * @default "none"
     */
    @JsonProperty("role")
    private ComponentDataContractRole role;

    public ComponentDataContractRole getRole() {
        return role;
    }

    public void setRole(ComponentDataContractRole role) {
        this.role = role;
    }

    /**
     * 组件期望的数据形状，用于校验数据源绑定是否合理（L2）
     * @default "none"
     */
    @JsonProperty("modelShape")
    private ComponentDataContractModelShape modelShape;

    public ComponentDataContractModelShape getModelShape() {
        return modelShape;
    }

    public void setModelShape(ComponentDataContractModelShape modelShape) {
        this.modelShape = modelShape;
    }

    /**
     * 向数据源回写的字段，如表单字段 key 列表
     */
    @JsonProperty("emits")
    private List<String> emits;

    public List<String> getEmits() {
        return emits;
    }

    public void setEmits(List<String> emits) {
        this.emits = emits;
    }

    /**
     * 消费的数据源类型：entity / api / flow / static / computed
     */
    @JsonProperty("accepts")
    private List<String> accepts;

    public List<String> getAccepts() {
        return accepts;
    }

    public void setAccepts(List<String> accepts) {
        this.accepts = accepts;
    }

    /**
     * @default false
     */
    @JsonProperty("refreshable")
    private Boolean refreshable;

    public Boolean getRefreshable() {
        return refreshable;
    }

    public void setRefreshable(Boolean refreshable) {
        this.refreshable = refreshable;
    }

    /**
     * @default false
     */
    @JsonProperty("submitable")
    private Boolean submitable;

    public Boolean getSubmitable() {
        return submitable;
    }

    public void setSubmitable(Boolean submitable) {
        this.submitable = submitable;
    }

    /**
     * @default false
     */
    @JsonProperty("pagination")
    private Boolean pagination;

    public Boolean getPagination() {
        return pagination;
    }

    public void setPagination(Boolean pagination) {
        this.pagination = pagination;
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
