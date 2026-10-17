// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class UiLoopSpec {
    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("over")
    private CommonExpr over;

    public CommonExpr getOver() {
        return over;
    }

    public void setOver(CommonExpr over) {
        this.over = over;
    }

    /**
     * @default "item"
     */
    @JsonProperty("itemName")
    private String itemName;

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    /**
     * @default "index"
     */
    @JsonProperty("indexName")
    private String indexName;

    public String getIndexName() {
        return indexName;
    }

    public void setIndexName(String indexName) {
        this.indexName = indexName;
    }

    /**
     * 用于生成 :key；缺省用索引，可能引发复用错乱
     */
    @JsonProperty("keyField")
    private String keyField;

    public String getKeyField() {
        return keyField;
    }

    public void setKeyField(String keyField) {
        this.keyField = keyField;
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
