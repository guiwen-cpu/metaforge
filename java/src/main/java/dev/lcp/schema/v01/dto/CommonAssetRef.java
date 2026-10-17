// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.CommonAssetRefKind;
import dev.lcp.schema.v01.enums.CommonAssetRefStorage;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 二进制/文本资产引用。BPMN XML、图片、视频、导出代码均以资产形式独立版本化，避免污染结构 Schema。
 */
public class CommonAssetRef {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("assetId")
    private String assetId;

    public String getAssetId() {
        return assetId;
    }

    public void setAssetId(String assetId) {
        this.assetId = assetId;
    }

    /**
     * 资产在 bundle 内的逻辑键（如 tpl_batch_recall）。跨工件引用一律用 key，assetId 只用于存储寻址。
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
    @JsonProperty("kind")
    private CommonAssetRefKind kind;

    public CommonAssetRefKind getKind() {
        return kind;
    }

    public void setKind(CommonAssetRefKind kind) {
        this.kind = kind;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("version")
    private Integer version;

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    @JsonProperty("fileName")
    private String fileName;

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    @JsonProperty("mime")
    private String mime;

    public String getMime() {
        return mime;
    }

    public void setMime(String mime) {
        this.mime = mime;
    }

    /**
     * @minimum 0
     */
    @Min(0L)
    @JsonProperty("size")
    private Integer size;

    public Integer getSize() {
        return size;
    }

    public void setSize(Integer size) {
        this.size = size;
    }

    @JsonProperty("checksum")
    private CommonChecksum checksum;

    public CommonChecksum getChecksum() {
        return checksum;
    }

    public void setChecksum(CommonChecksum checksum) {
        this.checksum = checksum;
    }

    /**
     * @default "oss"
     */
    @JsonProperty("storage")
    private CommonAssetRefStorage storage;

    public CommonAssetRefStorage getStorage() {
        return storage;
    }

    public void setStorage(CommonAssetRefStorage storage) {
        this.storage = storage;
    }

    /**
     * 仅 storage=external。oss 形态下由运行时按 assetId 解析，不落库绝对地址
     */
    @JsonProperty("url")
    private String url;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    /**
     * 仅 storage=inline 时承载内容（小文件 / 单元测试 / 出码产物 / BPMN 定义）。大文件一律走 storage=oss + url。
     */
    @JsonProperty("inline")
    private CommonAssetRefInline inline;

    public CommonAssetRefInline getInline() {
        return inline;
    }

    public void setInline(CommonAssetRefInline inline) {
        this.inline = inline;
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
