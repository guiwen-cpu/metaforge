// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.DataUiHintsUploadProvider;
import jakarta.validation.constraints.AssertTrue;
import java.util.List;

/**
 * 上传配置。provider=oss 时走 STS 临时凭证客户端直传，服务端只收回调与元数据
 */
public class DataUiHintsUpload {
    /**
     * @default "oss"
     */
    @JsonProperty("provider")
    private DataUiHintsUploadProvider provider;

    public DataUiHintsUploadProvider getProvider() {
        return provider;
    }

    public void setProvider(DataUiHintsUploadProvider provider) {
        this.provider = provider;
    }

    /**
     * 扩展名白名单，如 ['jpg','png','mp4','pdf','docx','xlsx']
     */
    @JsonProperty("accept")
    private List<String> accept;

    public List<String> getAccept() {
        return accept;
    }

    public void setAccept(List<String> accept) {
        this.accept = accept;
    }

    /**
     * 单文件字节上限
     */
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
     * @default true
     */
    @JsonProperty("preview")
    private Boolean preview;

    public Boolean getPreview() {
        return preview;
    }

    public void setPreview(Boolean preview) {
        this.preview = preview;
    }

    /**
     * @default false
     */
    @JsonProperty("compressImage")
    private Boolean compressImage;

    public Boolean getCompressImage() {
        return compressImage;
    }

    public void setCompressImage(Boolean compressImage) {
        this.compressImage = compressImage;
    }

    /**
     * OSS 路径模板，支持 {tenant}/{app}/{entity}/{yyyy}/{MM}/{ulid}.{ext}
     */
    @JsonProperty("pathTemplate")
    private String pathTemplate;

    public String getPathTemplate() {
        return pathTemplate;
    }

    public void setPathTemplate(String pathTemplate) {
        this.pathTemplate = pathTemplate;
    }
}
