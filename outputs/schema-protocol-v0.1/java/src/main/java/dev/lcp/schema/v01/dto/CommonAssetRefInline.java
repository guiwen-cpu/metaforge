// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.CommonAssetRefInlineEncoding;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * 仅 storage=inline 时承载内容（小文件 / 单元测试 / 出码产物 / BPMN 定义）。大文件一律走 storage=oss + url。
 */
public class CommonAssetRefInline {
    @JsonProperty("mediaType")
    private String mediaType;

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(String mediaType) {
        this.mediaType = mediaType;
    }

    /**
     * @default "utf8"
     */
    @JsonProperty("encoding")
    private CommonAssetRefInlineEncoding encoding;

    public CommonAssetRefInlineEncoding getEncoding() {
        return encoding;
    }

    public void setEncoding(CommonAssetRefInlineEncoding encoding) {
        this.encoding = encoding;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("content")
    private String content;

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
