// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.schema.v01.enums.BundlePublishConfigEnvironmentsItem;
import dev.lcp.schema.v01.enums.BundlePublishConfigMigrationStrategy;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 发布与部署配置。migrationStrategy 是本协议最重要的运维决策：strict 表示 DDL 变更必须人工审核后执行，低代码平台强烈建议默认 strict。
 */
public class BundlePublishConfig {
    /**
     * 多端发布开关，对应「一键发布」需求
     */
    @JsonProperty("targets")
    private List<BundlePublishConfigTargetsItem> targets;

    public List<BundlePublishConfigTargetsItem> getTargets() {
        return targets;
    }

    public void setTargets(List<BundlePublishConfigTargetsItem> targets) {
        this.targets = targets;
    }

    /**
     * @default ["dev","prod"]
     */
    @JsonProperty("environments")
    private List<BundlePublishConfigEnvironmentsItem> environments;

    public List<BundlePublishConfigEnvironmentsItem> getEnvironments() {
        return environments;
    }

    public void setEnvironments(List<BundlePublishConfigEnvironmentsItem> environments) {
        this.environments = environments;
    }

    /**
     * 发布到 prod 需要二级审批
     * @default true
     */
    @JsonProperty("requireApproval")
    private Boolean requireApproval;

    public Boolean getRequireApproval() {
        return requireApproval;
    }

    public void setRequireApproval(Boolean requireApproval) {
        this.requireApproval = requireApproval;
    }

    /**
     * @default "strict"
     */
    @JsonProperty("migrationStrategy")
    private BundlePublishConfigMigrationStrategy migrationStrategy;

    public BundlePublishConfigMigrationStrategy getMigrationStrategy() {
        return migrationStrategy;
    }

    public void setMigrationStrategy(BundlePublishConfigMigrationStrategy migrationStrategy) {
        this.migrationStrategy = migrationStrategy;
    }

    /**
     * 是否允许自动执行 DROP COLUMN / DROP TABLE。默认禁止
     * @default false
     */
    @JsonProperty("allowDestructive")
    private Boolean allowDestructive;

    public Boolean getAllowDestructive() {
        return allowDestructive;
    }

    public void setAllowDestructive(Boolean allowDestructive) {
        this.allowDestructive = allowDestructive;
    }

    /**
     * @default true
     */
    @JsonProperty("backupBefore")
    private Boolean backupBefore;

    public Boolean getBackupBefore() {
        return backupBefore;
    }

    public void setBackupBefore(Boolean backupBefore) {
        this.backupBefore = backupBefore;
    }

    /**
     * 可快速回滚的时间窗，超窗需走数据补偿流程
     * @default 72
     */
    @JsonProperty("rollbackWindowHours")
    private Integer rollbackWindowHours;

    public Integer getRollbackWindowHours() {
        return rollbackWindowHours;
    }

    public void setRollbackWindowHours(Integer rollbackWindowHours) {
        this.rollbackWindowHours = rollbackWindowHours;
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
