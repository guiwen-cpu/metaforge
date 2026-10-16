// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class LogicDownloadStep implements LogicStep {
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
     * @const "download"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "download";

    public String getType() {
        return type;
    }

    @JsonProperty("url")
    private CommonExpr url;

    public CommonExpr getUrl() {
        return url;
    }

    public void setUrl(CommonExpr url) {
        this.url = url;
    }

    @JsonProperty("fileName")
    private CommonExpr fileName;

    public CommonExpr getFileName() {
        return fileName;
    }

    public void setFileName(CommonExpr fileName) {
        this.fileName = fileName;
    }

    @JsonProperty("assetRef")
    private CommonAssetRef assetRef;

    public CommonAssetRef getAssetRef() {
        return assetRef;
    }

    public void setAssetRef(CommonAssetRef assetRef) {
        this.assetRef = assetRef;
    }

    @JsonProperty("semantic")
    private CommonSemantic semantic;

    public CommonSemantic getSemantic() {
        return semantic;
    }

    public void setSemantic(CommonSemantic semantic) {
        this.semantic = semantic;
    }

    /** 至少提供一组字段：url 或 assetRef（对齐 Schema 的 anyOf 约束）。 */
    @AssertTrue(message = "至少提供一组字段：url 或 assetRef")
    @JsonIgnore
    public boolean isConstraintSatisfied() {
        return (url != null) || (assetRef != null);
    }
}
