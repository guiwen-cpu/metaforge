// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 步骤联合类型。每个分支内联公共字段（见各变体首行的「序言」），刻意不用 allOf 组合 —— allOf 与 additionalProperties:false 同用会误拒另一分支的属性，这是 JSON Schema 最常见的坑。
 * 判别联合：按 type 的取值分派到成员类，成员类持有同名 const 字段作为单一来源。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(value = LogicValidateStep.class, name = "validate"),
    @JsonSubTypes.Type(value = LogicAssignStep.class, name = "assign"),
    @JsonSubTypes.Type(value = LogicApiCallStep.class, name = "apiCall"),
    @JsonSubTypes.Type(value = LogicOpenDialogStep.class, name = "openDialog"),
    @JsonSubTypes.Type(value = LogicCloseDialogStep.class, name = "closeDialog"),
    @JsonSubTypes.Type(value = LogicConfirmStep.class, name = "confirm"),
    @JsonSubTypes.Type(value = LogicBranchStep.class, name = "branch"),
    @JsonSubTypes.Type(value = LogicLoopStep.class, name = "loop"),
    @JsonSubTypes.Type(value = LogicParallelStep.class, name = "parallel"),
    @JsonSubTypes.Type(value = LogicCallActionStep.class, name = "callAction"),
    @JsonSubTypes.Type(value = LogicCodeStep.class, name = "code"),
    @JsonSubTypes.Type(value = LogicUploadStep.class, name = "upload"),
    @JsonSubTypes.Type(value = LogicDownloadStep.class, name = "download"),
    @JsonSubTypes.Type(value = LogicStartFlowStep.class, name = "startFlow"),
    @JsonSubTypes.Type(value = LogicCompleteTaskStep.class, name = "completeTask"),
    @JsonSubTypes.Type(value = LogicPrintStep.class, name = "print"),
    @JsonSubTypes.Type(value = LogicTransactionStep.class, name = "transaction"),
    @JsonSubTypes.Type(value = LogicDelayStep.class, name = "delay"),
    @JsonSubTypes.Type(value = LogicEmitStep.class, name = "emit"),
    @JsonSubTypes.Type(value = LogicLogStep.class, name = "log"),
    @JsonSubTypes.Type(value = LogicCustomStep.class, name = "custom"),
    @JsonSubTypes.Type(value = LogicFailStep.class, name = "fail"),
    @JsonSubTypes.Type(value = LogicNavigateStep.class, name = "navigate"),
})
public interface LogicStep {
}
