// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 统一表达式 DSL（唯一的解释器语义，前后端 + Flowable + 规则引擎共用一个注册表）。歧义规则：对象仅当其恰好含一个以 $ 开头的键、且该键是已知算子时才是表达式；因此需要字面量对象且含 $ 键时必须用 {"$lit": {...}} 包裹。
 * 扁平联合：5 个分支的字段并列，用 is<分支>() 与 head() 判断命中的形态。
 */
public class CommonExpr {
    /**
     * 任意 JSON 字面量，原样返回
     */
    @JsonProperty("$lit")
    private JsonNode lit;

    public JsonNode getLit() {
        return lit;
    }

    public void setLit(JsonNode lit) {
        this.lit = lit;
    }

    /**
     * @pattern ^\$(user|tenant|env|now|page|route|form|row|rows|data|process|ctx|component|res)(\.[A-Za-z0-9_\[\]$-]+)*$
     */
    @Pattern(regexp = "^\\$(user|tenant|env|now|page|route|form|row|rows|data|process|ctx|component|res)(\\.[A-Za-z0-9_\\[\\]$-]+)*$")
    @JsonProperty("$ref")
    private String ref;

    public String getRef() {
        return ref;
    }

    public void setRef(String ref) {
        this.ref = ref;
    }

    /**
     * @minLength 1
     */
    @Size(min = 1)
    @JsonProperty("$fn")
    private String fn;

    public String getFn() {
        return fn;
    }

    public void setFn(String fn) {
        this.fn = fn;
    }

    @JsonProperty("$args")
    private List<CommonExpr> args;

    public List<CommonExpr> getArgs() {
        return args;
    }

    public void setArgs(List<CommonExpr> args) {
        this.args = args;
    }

    /**
     * @minItems 1
     */
    @Size(min = 1)
    @JsonProperty("$tpl")
    private List<JsonNode> tpl;

    public List<JsonNode> getTpl() {
        return tpl;
    }

    public void setTpl(List<JsonNode> tpl) {
        this.tpl = tpl;
    }

    @JsonProperty("$if")
    private CommonExpr if_;

    public CommonExpr getIf_() {
        return if_;
    }

    public void setIf_(CommonExpr if_) {
        this.if_ = if_;
    }

    @JsonProperty("$then")
    private CommonExpr then;

    public CommonExpr getThen() {
        return then;
    }

    public void setThen(CommonExpr then) {
        this.then = then;
    }

    @JsonProperty("$else")
    private CommonExpr else_;

    public CommonExpr getElse_() {
        return else_;
    }

    public void setElse_(CommonExpr else_) {
        this.else_ = else_;
    }

    /** 分支 1 命中判断：需要同时提供 $lit。 */
    @JsonIgnore
    public boolean isLiteral() {
        return lit != null;
    }

    /** 分支 2 命中判断：需要同时提供 $ref。 */
    @JsonIgnore
    public boolean isReference() {
        return ref != null;
    }

    /** 分支 3 命中判断：需要同时提供 $fn。 */
    @JsonIgnore
    public boolean isFunction() {
        return fn != null;
    }

    /** 分支 4 命中判断：需要同时提供 $tpl。 */
    @JsonIgnore
    public boolean isTemplate() {
        return tpl != null;
    }

    /** 分支 5 命中判断：需要同时提供 $if + $then。 */
    @JsonIgnore
    public boolean isConditional() {
        return if_ != null && then != null;
    }

    /** 命中的分支名（第一个满足的分支），都不满足时返回 null。Java 表达不了联合类型，这里用分支谓词 + head() 替代 TS 的窄化。 */
    @JsonIgnore
    public String head() {
        if (isLiteral()) return "Literal";
        if (isReference()) return "Reference";
        if (isFunction()) return "Function";
        if (isTemplate()) return "Template";
        if (isConditional()) return "Conditional";
        return null;
    }
}
