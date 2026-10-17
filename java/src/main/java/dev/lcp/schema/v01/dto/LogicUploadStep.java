// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicUploadStepProvider;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 文件上传。provider=oss 时服务端只签发 STS 临时凭证，文件由客户端直传 OSS，服务端收回调登记元数据 —— 不让文件流经 BFF。
 */
public class LogicUploadStep implements LogicStep {
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
     * @const "upload"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "upload";

    public String getType() {
        return type;
    }

    /**
     * @default "oss"
     */
    @JsonProperty("provider")
    private LogicUploadStepProvider provider;

    public LogicUploadStepProvider getProvider() {
        return provider;
    }

    public void setProvider(LogicUploadStepProvider provider) {
        this.provider = provider;
    }

    @JsonProperty("accept")
    private List<String> accept;

    public List<String> getAccept() {
        return accept;
    }

    public void setAccept(List<String> accept) {
        this.accept = accept;
    }

    @JsonProperty("maxSize")
    private Integer maxSize;

    public Integer getMaxSize() {
        return maxSize;
    }

    public void setMaxSize(Integer maxSize) {
        this.maxSize = maxSize;
    }

    /**
     * @default 1
     */
    @JsonProperty("maxCount")
    private Integer maxCount;

    public Integer getMaxCount() {
        return maxCount;
    }

    public void setMaxCount(Integer maxCount) {
        this.maxCount = maxCount;
    }

    /**
     * @default false
     */
    @JsonProperty("multiple")
    private Boolean multiple;

    public Boolean getMultiple() {
        return multiple;
    }

    public void setMultiple(Boolean multiple) {
        this.multiple = multiple;
    }

    /**
     * @default "{tenant}/{app}/{entity}/{yyyy}/{MM}/{ulid}.{ext}"
     */
    @JsonProperty("pathTemplate")
    private String pathTemplate;

    public String getPathTemplate() {
        return pathTemplate;
    }

    public void setPathTemplate(String pathTemplate) {
        this.pathTemplate = pathTemplate;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("assignTo")
    private String assignTo;

    public String getAssignTo() {
        return assignTo;
    }

    public void setAssignTo(String assignTo) {
        this.assignTo = assignTo;
    }

    /**
     * @default true
     */
    @JsonProperty("autoUpload")
    private Boolean autoUpload;

    public Boolean getAutoUpload() {
        return autoUpload;
    }

    public void setAutoUpload(Boolean autoUpload) {
        this.autoUpload = autoUpload;
    }

    /**
     * 上传完成后写入的附件实体，用于统一附件管理
     */
    @JsonProperty("registerEntity")
    private CommonArtifactRef registerEntity;

    public CommonArtifactRef getRegisterEntity() {
        return registerEntity;
    }

    public void setRegisterEntity(CommonArtifactRef registerEntity) {
        this.registerEntity = registerEntity;
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
