package dev.lcp.bff.runtime.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** 运行时响应体。业务 Bundle 字段原样透传，平台只补流程上下文与展示辅助信息。 */
public final class RuntimeViews {

  private RuntimeViews() {
  }

  public record ActionView(
      String key,
      String label,
      String outcome,
      String style,
      boolean commentRequired) {
  }

  public record TaskFormView(
      String taskKey,
      String name,
      String pageKey,
      String assigneeType,
      List<ActionView> actions,
      List<String> editableFields,
      List<String> readonlyFields) {
  }

  public record FlowView(
      String key,
      String name,
      String processKey,
      String processDefinitionId,
      boolean deployed,
      List<TaskFormView> taskForms) {
  }

  public record FieldOption(String label, String value) {
  }

  public record FieldView(
      String key,
      String label,
      String type,
      Object value,
      List<FieldOption> options,
      String widget) {
  }

  public record TimelineItem(
      String activityId,
      String name,
      String type,
      String assignee,
      OffsetDateTime startTime,
      OffsetDateTime endTime,
      Long durationMs,
      String status,
      String comment) {
  }

  public record TaskSummary(
      String taskId,
      String taskKey,
      String taskName,
      String processInstanceId,
      String processDefinitionId,
      String businessKey,
      String businessTitle,
      String flowKey,
      String flowName,
      String assignee,
      String applicantId,
      String status,
      OffsetDateTime createdAt,
      OffsetDateTime dueAt) {
  }

  public record TaskDetail(
      String taskId,
      String taskKey,
      String taskName,
      String processInstanceId,
      String processDefinitionId,
      String businessKey,
      String businessTitle,
      String flowKey,
      String flowName,
      String assignee,
      String applicantId,
      boolean canAct,
      boolean finished,
      String status,
      OffsetDateTime createdAt,
      OffsetDateTime dueAt,
      Map<String, Object> business,
      List<FieldView> fields,
      Map<String, Object> variables,
      List<ActionView> actions,
      List<String> editableFields,
      List<String> readonlyFields,
      List<TimelineItem> timeline) {
  }

  public record InstanceView(
      String processInstanceId,
      String processDefinitionId,
      String businessKey,
      String businessTitle,
      String flowKey,
      String flowName,
      boolean finished,
      String status,
      Map<String, Object> business,
      Map<String, Object> variables,
      List<FieldView> fields,
      List<TaskSummary> activeTasks,
      List<TimelineItem> timeline) {
  }

  public record InstanceSummary(
      String processInstanceId,
      String processDefinitionId,
      String businessKey,
      String flowKey,
      String flowName,
      String businessTitle,
      String applicantId,
      String status,
      boolean finished,
      OffsetDateTime startedAt,
      OffsetDateTime endedAt) {
  }

  public record StartResult(
      String processInstanceId,
      String businessId,
      String flowKey,
      String currentTaskKey,
      String assignee,
      TaskDetail task) {
  }

  public record StepTrace(
      String stepId,
      String type,
      String label,
      String status,
      long durationMs,
      String message,
      JsonNode result,
      List<StepTrace> children) {
  }

  public record ActionError(
      String code,
      String message,
      List<String> fields,
      boolean rollback) {
  }

  public record NotificationView(
      String id,
      String appId,
      String type,
      String title,
      String body,
      String link,
      String bizType,
      String bizId,
      OffsetDateTime createdAt,
      OffsetDateTime readAt,
      boolean read) {
  }

  public record UnreadCount(long unread) {
  }
  public record NotificationFeed(List<NotificationView> items, long unread) {
  }

  public record NotificationReadResult(int updated, long unread) {
  }
  public record ActionExecutionResult(
      String appKey,
      int versionNo,
      String actionKey,
      String status,
      long durationMs,
      JsonNode result,
      JsonNode vars,
      JsonNode events,
      List<StepTrace> trace,
      ActionError error,
      JsonNode writeback,
      String runId,
      JsonNode state) {
  }

  public record DataSourceQueryResult(
      List<Map<String, Object>> rows,
      long total,
      int page,
      int size,
      Map<String, Object> item) {
  }

  public record ActionRunSummary(
      String id,
      String actionKey,
      String status,
      int versionNo,
      String userId,
      String taskId,
      String processInstanceId,
      String businessId,
      long durationMs,
      String replayedFrom,
      OffsetDateTime createdAt) {
  }

  public record ActionRunDetail(
      String id,
      String actionKey,
      String status,
      int versionNo,
      String userId,
      String taskId,
      String processInstanceId,
      String businessId,
      long durationMs,
      String replayedFrom,
      OffsetDateTime createdAt,
      JsonNode params,
      JsonNode context,
      JsonNode event,
      JsonNode result,
      JsonNode vars,
      JsonNode trace,
      JsonNode error,
      JsonNode writeback) {
  }

  public record ActionRunFeed(List<ActionRunSummary> items, long total) {
  }
}
