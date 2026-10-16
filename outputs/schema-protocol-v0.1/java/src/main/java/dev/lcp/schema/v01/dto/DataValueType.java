// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.DataFieldType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public class DataValueType {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("type")
    private DataFieldType type;

    public DataFieldType getType() {
        return type;
    }

    public void setType(DataFieldType type) {
        this.type = type;
    }

    /**
     * 细分格式，如 date 的 yyyy-MM-dd、string 的 email/url/phone
     */
    @JsonProperty("format")
    private String format;

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    @JsonProperty("enumRef")
    private CommonArtifactRef enumRef;

    public CommonArtifactRef getEnumRef() {
        return enumRef;
    }

    public void setEnumRef(CommonArtifactRef enumRef) {
        this.enumRef = enumRef;
    }

    @JsonProperty("enumValues")
    private List<DataEnumValue> enumValues;

    public List<DataEnumValue> getEnumValues() {
        return enumValues;
    }

    public void setEnumValues(List<DataEnumValue> enumValues) {
        this.enumValues = enumValues;
    }

    @JsonProperty("refEntity")
    private CommonArtifactRef refEntity;

    public CommonArtifactRef getRefEntity() {
        return refEntity;
    }

    public void setRefEntity(CommonArtifactRef refEntity) {
        this.refEntity = refEntity;
    }

    @JsonProperty("itemType")
    private DataValueType itemType;

    public DataValueType getItemType() {
        return itemType;
    }

    public void setItemType(DataValueType itemType) {
        this.itemType = itemType;
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
