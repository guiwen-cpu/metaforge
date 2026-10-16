// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.UiNodeStyleAlign;
import dev.lcp.schema.v01.enums.UiNodeStyleDirection;
import dev.lcp.schema.v01.enums.UiNodeStyleJustify;
import dev.lcp.schema.v01.enums.UiNodeStyleOverflow;
import dev.lcp.schema.v01.enums.UiNodeStyleTextAlign;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 样式。优先 className（Tailwind 原子类）—— 出码时可原样保留且零运行时开销。css 是逃生舱，沙箱组件中被禁用。
 */
public class UiNodeStyle {
    /**
     * Tailwind 类名，多个以空格分隔
     */
    @JsonProperty("className")
    private String className;

    public String getClassName() {
        return className;
    }

    public void setClassName(String className) {
        this.className = className;
    }

    @JsonProperty("width")
    private String width;

    public String getWidth() {
        return width;
    }

    public void setWidth(String width) {
        this.width = width;
    }

    @JsonProperty("height")
    private String height;

    public String getHeight() {
        return height;
    }

    public void setHeight(String height) {
        this.height = height;
    }

    @JsonProperty("minWidth")
    private String minWidth;

    public String getMinWidth() {
        return minWidth;
    }

    public void setMinWidth(String minWidth) {
        this.minWidth = minWidth;
    }

    @JsonProperty("maxWidth")
    private String maxWidth;

    public String getMaxWidth() {
        return maxWidth;
    }

    public void setMaxWidth(String maxWidth) {
        this.maxWidth = maxWidth;
    }

    @JsonProperty("minHeight")
    private String minHeight;

    public String getMinHeight() {
        return minHeight;
    }

    public void setMinHeight(String minHeight) {
        this.minHeight = minHeight;
    }

    @JsonProperty("maxHeight")
    private String maxHeight;

    public String getMaxHeight() {
        return maxHeight;
    }

    public void setMaxHeight(String maxHeight) {
        this.maxHeight = maxHeight;
    }

    @JsonProperty("padding")
    private String padding;

    public String getPadding() {
        return padding;
    }

    public void setPadding(String padding) {
        this.padding = padding;
    }

    @JsonProperty("margin")
    private String margin;

    public String getMargin() {
        return margin;
    }

    public void setMargin(String margin) {
        this.margin = margin;
    }

    @JsonProperty("gap")
    private String gap;

    public String getGap() {
        return gap;
    }

    public void setGap(String gap) {
        this.gap = gap;
    }

    @JsonProperty("align")
    private UiNodeStyleAlign align;

    public UiNodeStyleAlign getAlign() {
        return align;
    }

    public void setAlign(UiNodeStyleAlign align) {
        this.align = align;
    }

    @JsonProperty("justify")
    private UiNodeStyleJustify justify;

    public UiNodeStyleJustify getJustify() {
        return justify;
    }

    public void setJustify(UiNodeStyleJustify justify) {
        this.justify = justify;
    }

    @JsonProperty("direction")
    private UiNodeStyleDirection direction;

    public UiNodeStyleDirection getDirection() {
        return direction;
    }

    public void setDirection(UiNodeStyleDirection direction) {
        this.direction = direction;
    }

    @JsonProperty("wrap")
    private Boolean wrap;

    public Boolean getWrap() {
        return wrap;
    }

    public void setWrap(Boolean wrap) {
        this.wrap = wrap;
    }

    @JsonProperty("background")
    private String background;

    public String getBackground() {
        return background;
    }

    public void setBackground(String background) {
        this.background = background;
    }

    @JsonProperty("color")
    private String color;

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }

    @JsonProperty("border")
    private String border;

    public String getBorder() {
        return border;
    }

    public void setBorder(String border) {
        this.border = border;
    }

    @JsonProperty("radius")
    private String radius;

    public String getRadius() {
        return radius;
    }

    public void setRadius(String radius) {
        this.radius = radius;
    }

    @JsonProperty("shadow")
    private String shadow;

    public String getShadow() {
        return shadow;
    }

    public void setShadow(String shadow) {
        this.shadow = shadow;
    }

    @JsonProperty("fontSize")
    private String fontSize;

    public String getFontSize() {
        return fontSize;
    }

    public void setFontSize(String fontSize) {
        this.fontSize = fontSize;
    }

    @JsonProperty("fontWeight")
    private JsonNode fontWeight;

    public JsonNode getFontWeight() {
        return fontWeight;
    }

    public void setFontWeight(JsonNode fontWeight) {
        this.fontWeight = fontWeight;
    }

    @JsonProperty("textAlign")
    private UiNodeStyleTextAlign textAlign;

    public UiNodeStyleTextAlign getTextAlign() {
        return textAlign;
    }

    public void setTextAlign(UiNodeStyleTextAlign textAlign) {
        this.textAlign = textAlign;
    }

    @JsonProperty("overflow")
    private UiNodeStyleOverflow overflow;

    public UiNodeStyleOverflow getOverflow() {
        return overflow;
    }

    public void setOverflow(UiNodeStyleOverflow overflow) {
        this.overflow = overflow;
    }

    /**
     * @default false
     */
    @JsonProperty("hidden")
    private Boolean hidden;

    public Boolean getHidden() {
        return hidden;
    }

    public void setHidden(Boolean hidden) {
        this.hidden = hidden;
    }

    @JsonProperty("zIndex")
    private Integer zIndex;

    public Integer getZIndex() {
        return zIndex;
    }

    public void setZIndex(Integer zIndex) {
        this.zIndex = zIndex;
    }

    /**
     * 逃生舱：内联 CSS 键值对
     */
    @JsonProperty("css")
    private Map<String, String> css;

    public Map<String, String> getCss() {
        return css;
    }

    public void setCss(Map<String, String> css) {
        this.css = css;
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
