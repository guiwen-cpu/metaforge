// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiEntityDataSourceMode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class UiEntityDataSource implements UiDataSource {
    /**
     * 页面内唯一，供 bind.dataSourceId 引用；约定 ds 前缀
     * 必填字段（required 且无 default）。
     * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,31}$
     */
    @NotNull
    @Pattern(regexp = "^[A-Za-z_][A-Za-z0-9_]{0,31}$")
    @JsonProperty("id")
    private String id;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    /**
     * 判别字段：const 初值由 @JsonTypeInfo(As.EXISTING_PROPERTY) 消费，刻意不提供 setter。
     * @const "entity"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "entity";

    public String getType() {
        return type;
    }

    @JsonProperty("name")
    private CommonText name;

    public CommonText getName() {
        return name;
    }

    public void setName(CommonText name) {
        this.name = name;
    }

    /**
     * 必填字段（required 且无 default）。
     */
    @NotNull
    @JsonProperty("entityRef")
    private CommonArtifactRef entityRef;

    public CommonArtifactRef getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(CommonArtifactRef entityRef) {
        this.entityRef = entityRef;
    }

    /**
     * page=分页；list=一次性取全部（配 limit）；one=按主键取单条；count=仅取总数
     * @default "page"
     */
    @JsonProperty("mode")
    private UiEntityDataSourceMode mode;

    public UiEntityDataSourceMode getMode() {
        return mode;
    }

    public void setMode(UiEntityDataSourceMode mode) {
        this.mode = mode;
    }

    /**
     * 投影字段。缺省取 storage=column 字段 + 关联显示字段，避免把 JSONB 整体拖回前端
     */
    @JsonProperty("select")
    private List<String> select;

    public List<String> getSelect() {
        return select;
    }

    public void setSelect(List<String> select) {
        this.select = select;
    }

    /**
     * 需要展开的关联，如 student.dept。默认懒加载，显式声明才 join
     */
    @JsonProperty("include")
    private List<String> include;

    public List<String> getInclude() {
        return include;
    }

    public void setInclude(List<String> include) {
        this.include = include;
    }

    /**
     * 固定过滤条件，编译期下推为 SQL WHERE；数据权限行过滤在其上叠加 AND
     */
    @JsonProperty("filter")
    private CommonExpr filter;

    public CommonExpr getFilter() {
        return filter;
    }

    public void setFilter(CommonExpr filter) {
        this.filter = filter;
    }

    @JsonProperty("sort")
    private List<UiSortSpec> sort;

    public List<UiSortSpec> getSort() {
        return sort;
    }

    public void setSort(List<UiSortSpec> sort) {
        this.sort = sort;
    }

    @JsonProperty("page")
    private UiPageSpec page;

    public UiPageSpec getPage() {
        return page;
    }

    public void setPage(UiPageSpec page) {
        this.page = page;
    }

    /**
     * mode=list 时的硬上限，防止把全表拖回前端
     * @minimum 1
     */
    @Min(1L)
    @JsonProperty("limit")
    private Integer limit;

    public Integer getLimit() {
        return limit;
    }

    public void setLimit(Integer limit) {
        this.limit = limit;
    }

    /**
     * mode=one 时主键来源：路径字符串（如 $route.params.id）或表达式（如 { "$ref": "$data.ds_task.businessKey" }）
     */
    @JsonProperty("pkParam")
    private JsonNode pkParam;

    public JsonNode getPkParam() {
        return pkParam;
    }

    public void setPkParam(JsonNode pkParam) {
        this.pkParam = pkParam;
    }

    /**
     * 参数化占位符，使 filter 可写成 :studentId 形式并由运行时绑定
     */
    @JsonProperty("params")
    private List<UiDataSourceParam> params;

    public List<UiDataSourceParam> getParams() {
        return params;
    }

    public void setParams(List<UiDataSourceParam> params) {
        this.params = params;
    }

    /**
     * 声明式依赖：其他 dataSourceId 或表达式来源路径。其值变化时运行时自动重新查询，避免手写 watch
     */
    @JsonProperty("dependsOn")
    private List<String> dependsOn;

    public List<String> getDependsOn() {
        return dependsOn;
    }

    public void setDependsOn(List<String> dependsOn) {
        this.dependsOn = dependsOn;
    }

    /**
     * 页面加载即请求，还是等显式 refresh 动作
     * @default true
     */
    @JsonProperty("immediate")
    private Boolean immediate;

    public Boolean getImmediate() {
        return immediate;
    }

    public void setImmediate(Boolean immediate) {
        this.immediate = immediate;
    }

    @JsonProperty("cache")
    private UiCacheSpec cache;

    public UiCacheSpec getCache() {
        return cache;
    }

    public void setCache(UiCacheSpec cache) {
        this.cache = cache;
    }

    @JsonProperty("access")
    private CommonAccess access;

    public CommonAccess getAccess() {
        return access;
    }

    public void setAccess(CommonAccess access) {
        this.access = access;
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
