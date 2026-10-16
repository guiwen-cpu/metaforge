// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicAssigneeSpecStrategy;
import dev.lcp.schema.v01.enums.LogicAssigneeSpecType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

/**
 * 人员选择。设计器据此渲染人员选择器，运行时解析为 Flowable 的用户/组 ID。
 */
public class LogicAssigneeSpec {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private LogicAssigneeSpecType type;

    public LogicAssigneeSpecType getType() {
        return type;
    }

    public void setType(LogicAssigneeSpecType type) {
        this.type = type;
    }

    @JsonProperty("values")
    private List<String> values;

    public List<String> getValues() {
        return values;
    }

    public void setValues(List<String> values) {
        this.values = values;
    }

    @JsonProperty("expr")
    private CommonExpr expr;

    public CommonExpr getExpr() {
        return expr;
    }

    public void setExpr(CommonExpr expr) {
        this.expr = expr;
    }

    @JsonProperty("formField")
    private String formField;

    public String getFormField() {
        return formField;
    }

    public void setFormField(String formField) {
        this.formField = formField;
    }

    /**
     * 向上取 N 级主管：1=直属主管，2=隔级主管
     */
    @JsonProperty("level")
    private Integer level;

    public Integer getLevel() {
        return level;
    }

    public void setLevel(Integer level) {
        this.level = level;
    }

    /**
     * 多候选人时的会签策略
     * @default "any"
     */
    @JsonProperty("strategy")
    private LogicAssigneeSpecStrategy strategy;

    public LogicAssigneeSpecStrategy getStrategy() {
        return strategy;
    }

    public void setStrategy(LogicAssigneeSpecStrategy strategy) {
        this.strategy = strategy;
    }

    /**
     * @minimum 0
     * @maximum 1
     */
    @DecimalMin("0")
    @DecimalMax("1")
    @JsonProperty("voteRatio")
    private BigDecimal voteRatio;

    public BigDecimal getVoteRatio() {
        return voteRatio;
    }

    public void setVoteRatio(BigDecimal voteRatio) {
        this.voteRatio = voteRatio;
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
