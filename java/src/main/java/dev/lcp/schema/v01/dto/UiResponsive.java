// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.CommonBreakpointKey;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 响应式配置。base 为默认，断点覆盖向上继承。移动端与小程序出码时只保留 xs/sm 并忽略 css 逃生舱。
 */
public class UiResponsive {
    @JsonProperty("base")
    private UiBreakpointConfig base;

    public UiBreakpointConfig getBase() {
        return base;
    }

    public void setBase(UiBreakpointConfig base) {
        this.base = base;
    }

    @JsonProperty("xs")
    private UiBreakpointConfig xs;

    public UiBreakpointConfig getXs() {
        return xs;
    }

    public void setXs(UiBreakpointConfig xs) {
        this.xs = xs;
    }

    @JsonProperty("sm")
    private UiBreakpointConfig sm;

    public UiBreakpointConfig getSm() {
        return sm;
    }

    public void setSm(UiBreakpointConfig sm) {
        this.sm = sm;
    }

    @JsonProperty("md")
    private UiBreakpointConfig md;

    public UiBreakpointConfig getMd() {
        return md;
    }

    public void setMd(UiBreakpointConfig md) {
        this.md = md;
    }

    @JsonProperty("lg")
    private UiBreakpointConfig lg;

    public UiBreakpointConfig getLg() {
        return lg;
    }

    public void setLg(UiBreakpointConfig lg) {
        this.lg = lg;
    }

    @JsonProperty("xl")
    private UiBreakpointConfig xl;

    public UiBreakpointConfig getXl() {
        return xl;
    }

    public void setXl(UiBreakpointConfig xl) {
        this.xl = xl;
    }

    @JsonProperty("hiddenOn")
    private List<CommonBreakpointKey> hiddenOn;

    public List<CommonBreakpointKey> getHiddenOn() {
        return hiddenOn;
    }

    public void setHiddenOn(List<CommonBreakpointKey> hiddenOn) {
        this.hiddenOn = hiddenOn;
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
