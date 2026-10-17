// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.DataIndexMethod;
import dev.lcp.schema.v01.enums.DataIndexOrdersItem;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public class DataIndex {
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

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("name")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    /**
     * 必填字段（required 且无 default）。
     * @minItems 1
     */
    @NotNull
    @Size(min = 1)
    @JsonProperty("fields")
    private List<String> fields;

    public List<String> getFields() {
        return fields;
    }

    public void setFields(List<String> fields) {
        this.fields = fields;
    }

    /**
     * @default false
     */
    @JsonProperty("unique")
    private Boolean unique;

    public Boolean getUnique() {
        return unique;
    }

    public void setUnique(Boolean unique) {
        this.unique = unique;
    }

    /**
     * gin 用于 jsonb 字段的包含查询：fields 中可写 ext->>'status' 形式的表达式
     * @default "btree"
     */
    @JsonProperty("method")
    private DataIndexMethod method;

    public DataIndexMethod getMethod() {
        return method;
    }

    public void setMethod(DataIndexMethod method) {
        this.method = method;
    }

    @JsonProperty("orders")
    private List<DataIndexOrdersItem> orders;

    public List<DataIndexOrdersItem> getOrders() {
        return orders;
    }

    public void setOrders(List<DataIndexOrdersItem> orders) {
        this.orders = orders;
    }

    /**
     * 部分索引条件。仅允许 pure=true 的函数（L4 校验）
     */
    @JsonProperty("where")
    private CommonExpr where;

    public CommonExpr getWhere() {
        return where;
    }

    public void setWhere(CommonExpr where) {
        this.where = where;
    }

    /**
     * 出码时生成 CREATE INDEX CONCURRENTLY，避免锁表
     * @default true
     */
    @JsonProperty("concurrently")
    private Boolean concurrently;

    public Boolean getConcurrently() {
        return concurrently;
    }

    public void setConcurrently(Boolean concurrently) {
        this.concurrently = concurrently;
    }

    @JsonProperty("note")
    private String note;

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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
