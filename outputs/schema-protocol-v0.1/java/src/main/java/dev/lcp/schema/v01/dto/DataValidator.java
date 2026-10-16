// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 校验器。expr 形态用于跨字段联动校验（如结束日期不早于开始日期）。
 * 判别联合：按 type 的取值分派到成员类，成员类持有同名 const 字段作为单一来源。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(value = DataValidatorMin.class, name = "min"),
    @JsonSubTypes.Type(value = DataValidatorMax.class, name = "max"),
    @JsonSubTypes.Type(value = DataValidatorMinLength.class, name = "minLength"),
    @JsonSubTypes.Type(value = DataValidatorMaxLength.class, name = "maxLength"),
    @JsonSubTypes.Type(value = DataValidatorPattern.class, name = "pattern"),
    @JsonSubTypes.Type(value = DataValidatorRange.class, name = "range"),
    @JsonSubTypes.Type(value = DataValidatorFileMaxSize.class, name = "fileMaxSize"),
    @JsonSubTypes.Type(value = DataValidatorFileAccept.class, name = "fileAccept"),
    @JsonSubTypes.Type(value = DataValidatorExpr.class, name = "expr"),
    @JsonSubTypes.Type(value = DataValidatorUniqueIn.class, name = "uniqueIn"),
})
public interface DataValidator {
}
