package dev.lcp.bff.runtime.dto;

import java.util.Map;

/** 运行时请求体。字段 camelCase，响应序列化层统一转 snake_case。 */
public final class RuntimeRequests {

  private RuntimeRequests() {
  }

  /** businessId 为空时按 Bundle 实体元数据新建业务单据；也可传已有单据 ID。 */
  public record StartInstanceRequest(
      String businessId,
      Map<String, Object> business,
      Map<String, Object> variables) {
  }

  /** outcome 取任务的按钮 outcome；评论必填规则来自 Flow.taskForms[].buttons。 */
  public record CompleteTaskRequest(
      String outcome,
      String comment,
      Map<String, Object> variables) {
  }

  public record TransferTaskRequest(String toUserId, String comment) {
  }

  /**
   * 动作执行入参。context 可覆盖 user / tenant / page / route / form / row / rows /
   * data / process / component；event 为触发事件载荷。
   */
  public record ExecuteActionRequest(
      Map<String, Object> params,
      Map<String, Object> context,
      Map<String, Object> event) {
  }
}
