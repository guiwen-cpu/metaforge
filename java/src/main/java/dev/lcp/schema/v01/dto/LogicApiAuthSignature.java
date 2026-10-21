// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.LogicApiAuthSignatureAlgorithm;
import dev.lcp.schema.v01.enums.LogicApiAuthSignatureEncoding;
import dev.lcp.schema.v01.enums.LogicApiAuthSignatureTimestampUnit;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class LogicApiAuthSignature implements LogicApiAuth {
    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "signature"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "signature";

    public String getType() {
        return type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("algorithm")
    private LogicApiAuthSignatureAlgorithm algorithm;

    public LogicApiAuthSignatureAlgorithm getAlgorithm() {
        return algorithm;
    }

    public void setAlgorithm(LogicApiAuthSignatureAlgorithm algorithm) {
        this.algorithm = algorithm;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("secretRef")
    private String secretRef;

    public String getSecretRef() {
        return secretRef;
    }

    public void setSecretRef(String secretRef) {
        this.secretRef = secretRef;
    }

    /**
     * 待签名串模板，支持 {method} {path} {query} {body} {timestamp} {tenant} 占位，如 {method}\n{path}\n{timestamp}
     */
    @JsonProperty("template")
    private String template;

    public String getTemplate() {
        return template;
    }

    public void setTemplate(String template) {
        this.template = template;
    }

    /**
     * @default "X-Signature"
     */
    @JsonProperty("headerName")
    private String headerName;

    public String getHeaderName() {
        return headerName;
    }

    public void setHeaderName(String headerName) {
        this.headerName = headerName;
    }

    /**
     * 时间戳请求头；留空表示不注入。
     * @default "X-Timestamp"
     */
    @JsonProperty("timestampHeader")
    private String timestampHeader;

    public String getTimestampHeader() {
        return timestampHeader;
    }

    public void setTimestampHeader(String timestampHeader) {
        this.timestampHeader = timestampHeader;
    }

    /**
     * @default "seconds"
     */
    @JsonProperty("timestampUnit")
    private LogicApiAuthSignatureTimestampUnit timestampUnit;

    public LogicApiAuthSignatureTimestampUnit getTimestampUnit() {
        return timestampUnit;
    }

    public void setTimestampUnit(LogicApiAuthSignatureTimestampUnit timestampUnit) {
        this.timestampUnit = timestampUnit;
    }

    /**
     * @default "hex"
     */
    @JsonProperty("encoding")
    private LogicApiAuthSignatureEncoding encoding;

    public LogicApiAuthSignatureEncoding getEncoding() {
        return encoding;
    }

    public void setEncoding(LogicApiAuthSignatureEncoding encoding) {
        this.encoding = encoding;
    }
}
