// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;

/**
 * 由其他数据源派生（统计卡片、合计行）。声明式派生而非命令式赋值，刷新顺序由依赖图自动拓扑排序。
 */
public class UiComputedDataSource implements UiDataSource {
    /**
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
     * @const "computed"
     */
    @NotNull
    @JsonProperty("type")
    private String type = "computed";

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
    @JsonProperty("expr")
    private CommonExpr expr;

    public CommonExpr getExpr() {
        return expr;
    }

    public void setExpr(CommonExpr expr) {
        this.expr = expr;
    }

    /**
     * 显式依赖声明，用于拓扑排序与缓存失效；缺省由 expr 自动推导
     */
    @JsonProperty("dependsOn")
    private List<String> dependsOn;

    public List<String> getDependsOn() {
        return dependsOn;
    }

    public void setDependsOn(List<String> dependsOn) {
        this.dependsOn = dependsOn;
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
