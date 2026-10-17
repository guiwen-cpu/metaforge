// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicTaskFormButtonsItemOutcome;
import dev.lcp.schema.v01.enums.LogicTaskFormButtonsItemStyle;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class LogicTaskFormButtonsItem {
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
    @JsonProperty("label")
    private CommonText label;

    public CommonText getLabel() {
        return label;
    }

    public void setLabel(CommonText label) {
        this.label = label;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("outcome")
    private LogicTaskFormButtonsItemOutcome outcome;

    public LogicTaskFormButtonsItemOutcome getOutcome() {
        return outcome;
    }

    public void setOutcome(LogicTaskFormButtonsItemOutcome outcome) {
        this.outcome = outcome;
    }

    @JsonProperty("outcomeKey")
    private String outcomeKey;

    public String getOutcomeKey() {
        return outcomeKey;
    }

    public void setOutcomeKey(String outcomeKey) {
        this.outcomeKey = outcomeKey;
    }

    /**
     * @default "default"
     */
    @JsonProperty("style")
    private LogicTaskFormButtonsItemStyle style;

    public LogicTaskFormButtonsItemStyle getStyle() {
        return style;
    }

    public void setStyle(LogicTaskFormButtonsItemStyle style) {
        this.style = style;
    }

    @JsonProperty("confirm")
    private CommonText confirm;

    public CommonText getConfirm() {
        return confirm;
    }

    public void setConfirm(CommonText confirm) {
        this.confirm = confirm;
    }

    /**
     * @default false
     */
    @JsonProperty("commentRequired")
    private Boolean commentRequired;

    public Boolean getCommentRequired() {
        return commentRequired;
    }

    public void setCommentRequired(Boolean commentRequired) {
        this.commentRequired = commentRequired;
    }

    @JsonProperty("visible")
    private CommonExpr visible;

    public CommonExpr getVisible() {
        return visible;
    }

    public void setVisible(CommonExpr visible) {
        this.visible = visible;
    }

    @JsonProperty("order")
    private Integer order;

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }
}
