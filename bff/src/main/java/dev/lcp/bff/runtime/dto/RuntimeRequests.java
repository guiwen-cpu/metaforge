package dev.lcp.bff.runtime.dto;

import java.util.Map;
import java.util.List;

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

  /** 小程序按页面调用 API 工件；页面 ACL 与引用关系由服务端复核。 */
  public record RuntimeApiInvokeRequest(
      Map<String, Object> params,
      Map<String, Object> context,
      String resultPath) {
  }

  /** 发布态数据源查询。filters 只传搜索区实际生效的字段，服务端再做白名单与类型校验。 */
  public record DataSourceFilter(String field, String op, Object value) {
  }

  /** 运行时服务端排序；字段、方向与空值位置均在服务端白名单校验。 */
  public record DataSourceSort(String field, String direction, String nulls) {
  }

  public record DataSourceQueryRequest(
      Map<String, Object> state,
      Map<String, Object> query,
      List<DataSourceFilter> filters,
      List<DataSourceSort> sort,
      Map<String, Object> params,
      Map<String, Object> data,
      Map<String, Object> routeQuery) {
  }
}
