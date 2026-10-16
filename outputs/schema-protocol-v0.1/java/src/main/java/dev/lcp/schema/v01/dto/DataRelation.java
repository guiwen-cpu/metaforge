// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.lcp.schema.v01.enums.DataRelationOnDelete;
import dev.lcp.schema.v01.enums.DataRelationOnUpdate;
import dev.lcp.schema.v01.enums.DataRelationType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public class DataRelation {
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
    @JsonProperty("key")
    private String key;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

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
     */
    @NotNull
    @JsonProperty("type")
    private DataRelationType type;

    public DataRelationType getType() {
        return type;
    }

    public void setType(DataRelationType type) {
        this.type = type;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("from")
    private DataEndpoint from;

    public DataEndpoint getFrom() {
        return from;
    }

    public void setFrom(DataEndpoint from) {
        this.from = from;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("to")
    private DataEndpoint to;

    public DataEndpoint getTo() {
        return to;
    }

    public void setTo(DataEndpoint to) {
        this.to = to;
    }

    /**
     * 仅 manyToMany 需要
     */
    @JsonProperty("join")
    private DataJoinTable join;

    public DataJoinTable getJoin() {
        return join;
    }

    public void setJoin(DataJoinTable join) {
        this.join = join;
    }

    /**
     * 默认 restrict —— 低代码场景下误删成本远高于维护成本
     * @default "restrict"
     */
    @JsonProperty("onDelete")
    private DataRelationOnDelete onDelete;

    public DataRelationOnDelete getOnDelete() {
        return onDelete;
    }

    public void setOnDelete(DataRelationOnDelete onDelete) {
        this.onDelete = onDelete;
    }

    /**
     * @default "restrict"
     */
    @JsonProperty("onUpdate")
    private DataRelationOnUpdate onUpdate;

    public DataRelationOnUpdate getOnUpdate() {
        return onUpdate;
    }

    public void setOnUpdate(DataRelationOnUpdate onUpdate) {
        this.onUpdate = onUpdate;
    }

    /**
     * 目标端反向导航属性名，用于生成 target.relations[]
     */
    @JsonProperty("remoteName")
    private String remoteName;

    public String getRemoteName() {
        return remoteName;
    }

    public void setRemoteName(String remoteName) {
        this.remoteName = remoteName;
    }

    /**
     * @default false
     */
    @JsonProperty("required")
    private Boolean required;

    public Boolean getRequired() {
        return required;
    }

    public void setRequired(Boolean required) {
        this.required = required;
    }

    /**
     * 默认懒加载，列表接口不自动 join，避免 N+1 与响应体膨胀
     * @default true
     */
    @JsonProperty("lazy")
    private Boolean lazy;

    public Boolean getLazy() {
        return lazy;
    }

    public void setLazy(Boolean lazy) {
        this.lazy = lazy;
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
