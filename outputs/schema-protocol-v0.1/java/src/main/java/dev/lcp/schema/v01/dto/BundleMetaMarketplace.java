// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import java.math.BigDecimal;
import java.util.List;

/**
 * 模板市场元数据。安装时以快照为源，安装后与原模板解耦（可选择接收升级）
 */
public class BundleMetaMarketplace {
    @JsonProperty("listingId")
    private String listingId;

    public String getListingId() {
        return listingId;
    }

    public void setListingId(String listingId) {
        this.listingId = listingId;
    }

    @JsonProperty("publisher")
    private String publisher;

    public String getPublisher() {
        return publisher;
    }

    public void setPublisher(String publisher) {
        this.publisher = publisher;
    }

    /**
     * @default 0
     */
    @JsonProperty("price")
    private BigDecimal price;

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    @JsonProperty("license")
    private String license;

    public String getLicense() {
        return license;
    }

    public void setLicense(String license) {
        this.license = license;
    }

    @JsonProperty("installCount")
    private Integer installCount;

    public Integer getInstallCount() {
        return installCount;
    }

    public void setInstallCount(Integer installCount) {
        this.installCount = installCount;
    }

    /**
     * @default true
     */
    @JsonProperty("upgradeable")
    private Boolean upgradeable;

    public Boolean getUpgradeable() {
        return upgradeable;
    }

    public void setUpgradeable(Boolean upgradeable) {
        this.upgradeable = upgradeable;
    }

    /**
     * 是否允许发布到模板市场
     * @default false
     */
    @JsonProperty("publishable")
    private Boolean publishable;

    public Boolean getPublishable() {
        return publishable;
    }

    public void setPublishable(Boolean publishable) {
        this.publishable = publishable;
    }

    /**
     * 市场分类，如 education/hr
     */
    @JsonProperty("category")
    private String category;

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    @JsonProperty("previewImage")
    private CommonAssetRef previewImage;

    public CommonAssetRef getPreviewImage() {
        return previewImage;
    }

    public void setPreviewImage(CommonAssetRef previewImage) {
        this.previewImage = previewImage;
    }

    @JsonProperty("installParams")
    private List<BundleInstallParam> installParams;

    public List<BundleInstallParam> getInstallParams() {
        return installParams;
    }

    public void setInstallParams(List<BundleInstallParam> installParams) {
        this.installParams = installParams;
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
