package dev.lcp.bff.runtime;

import dev.lcp.bff.runtime.RuntimeNavigationService.NavigationView;
import dev.lcp.bff.runtime.RuntimeNavigationService.PageView;
import dev.lcp.bff.runtime.dto.RuntimeRequests.CompleteTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.DataSourceQueryRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.ExecuteActionRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.StartInstanceRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.TransferTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionExecutionResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionRunDetail;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionRunFeed;
import dev.lcp.bff.runtime.dto.RuntimeViews.DataSourceQueryResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.FlowView;
import dev.lcp.bff.runtime.dto.RuntimeViews.InstanceView;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationFeed;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationReadResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationView;
import dev.lcp.bff.runtime.dto.RuntimeViews.InstanceSummary;
import dev.lcp.bff.runtime.dto.RuntimeViews.StartResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskDetail;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskSummary;
import dev.lcp.bff.runtime.dto.RuntimeViews.UnreadCount;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 发布态运行时：流程定义、实例启动、待办/已办与任务办理。 */
@RestController
@RequestMapping("/api/v1/runtime/apps/{appId}")
public class RuntimeController {

  private final ProcessRuntimeService runtime;
  private final ActionRunService actionRuns;
  private final NotificationService notificationService;
  private final RuntimeNavigationService runtimeNavigation;
  private final RuntimeDataSourceService dataSources;

  public RuntimeController(
      ProcessRuntimeService runtime,
      ActionRunService actionRuns,
      NotificationService notifications,
      RuntimeNavigationService runtimeNavigation,
      RuntimeDataSourceService dataSources) {
    this.runtime = runtime;
    this.actionRuns = actionRuns;
    this.notificationService = notifications;
    this.runtimeNavigation = runtimeNavigation;
    this.dataSources = dataSources;
  }

  @GetMapping("/navigation")
  public NavigationView navigation(@PathVariable("appId") UUID appId) {
    return runtimeNavigation.navigation(appId);
  }

  @GetMapping("/pages/{pageKey}")
  public PageView page(
      @PathVariable("appId") UUID appId, @PathVariable("pageKey") String pageKey) {
    return runtimeNavigation.page(appId, pageKey);
  }

  @PostMapping("/pages/{pageKey}/data-sources/{dataSourceId}/query")
  public DataSourceQueryResult queryDataSource(
      @PathVariable("appId") UUID appId,
      @PathVariable("pageKey") String pageKey,
      @PathVariable("dataSourceId") String dataSourceId,
      @RequestBody(required = false) DataSourceQueryRequest body) {
    return dataSources.query(appId, pageKey, dataSourceId, body);
  }

  @PostMapping("/actions/{actionKey}/execute")
  public ActionExecutionResult executeAction(
      @PathVariable("appId") UUID appId,
      @PathVariable("actionKey") String actionKey,
      @RequestBody(required = false) ExecuteActionRequest body) {
    return actionRuns.execute(appId, actionKey,
        body == null ? new ExecuteActionRequest(null, null, null) : body);
  }

  @GetMapping("/action-runs")
  public ActionRunFeed listActionRuns(
      @PathVariable("appId") UUID appId,
      @RequestParam(name = "processInstanceId", required = false) String processInstanceId,
      @RequestParam(name = "actionKey", required = false) String actionKey,
      @RequestParam(name = "status", required = false) String status,
      @RequestParam(name = "limit", defaultValue = "20") int limit) {
    return actionRuns.list(appId, processInstanceId, actionKey, status, limit);
  }

  @GetMapping("/action-runs/{id}")
  public ActionRunDetail actionRun(
      @PathVariable("appId") UUID appId, @PathVariable("id") UUID id) {
    return actionRuns.detail(appId, id);
  }

  @PostMapping("/action-runs/{id}/replay")
  public ActionRunDetail replayActionRun(
      @PathVariable("appId") UUID appId, @PathVariable("id") UUID id) {
    return actionRuns.replay(appId, id);
  }

  @GetMapping("/notifications")
  public NotificationFeed notifications(
      @PathVariable("appId") UUID appId,
      @RequestParam(name = "limit", defaultValue = "20") int limit) {
    return notificationService.list(appId, limit);
  }

  @GetMapping("/notifications/unread-count")
  public UnreadCount unreadCount(@PathVariable("appId") UUID appId) {
    return new UnreadCount(notificationService.unreadCount(appId));
  }

  @PostMapping("/notifications/{id}/read")
  public NotificationView read(
      @PathVariable("appId") UUID appId, @PathVariable("id") UUID id) {
    return notificationService.markRead(appId, id);
  }

  @PostMapping("/notifications/read-all")
  public NotificationReadResult readAll(@PathVariable("appId") UUID appId) {
    return notificationService.markAllRead(appId);
  }

  @GetMapping("/flows")
  public List<FlowView> flows(@PathVariable("appId") UUID appId) {
    return runtime.listFlows(appId);
  }

  @PostMapping("/flows/{flowKey}/instances")
  public StartResult start(
      @PathVariable("appId") UUID appId,
      @PathVariable("flowKey") String flowKey,
      @RequestBody StartInstanceRequest body) {
    return runtime.start(appId, flowKey, body == null ? new StartInstanceRequest(null, null, null) : body);
  }

  @GetMapping("/tasks/todo")
  public List<TaskSummary> todo(@PathVariable("appId") UUID appId) {
    return runtime.todo(appId);
  }

  @GetMapping("/tasks/done")
  public List<TaskSummary> done(@PathVariable("appId") UUID appId) {
    return runtime.done(appId);
  }

  @GetMapping("/instances/initiated")
  public List<InstanceSummary> initiated(@PathVariable("appId") UUID appId) {
    return runtime.initiated(appId);
  }

  @GetMapping("/tasks/{taskId}")
  public TaskDetail task(@PathVariable("appId") UUID appId, @PathVariable("taskId") String taskId) {
    return runtime.taskDetail(appId, taskId);
  }

  @PostMapping("/tasks/{taskId}/claim")
  public TaskDetail claim(@PathVariable("appId") UUID appId, @PathVariable("taskId") String taskId) {
    return runtime.claim(appId, taskId);
  }

  @PostMapping("/tasks/{taskId}/complete")
  public TaskDetail complete(
      @PathVariable("appId") UUID appId,
      @PathVariable("taskId") String taskId,
      @RequestBody(required = false) CompleteTaskRequest body) {
    return runtime.complete(appId, taskId,
        body == null ? new CompleteTaskRequest(null, null, null) : body);
  }

  @PostMapping("/tasks/{taskId}/transfer")
  public TaskDetail transfer(
      @PathVariable("appId") UUID appId,
      @PathVariable("taskId") String taskId,
      @RequestBody TransferTaskRequest body) {
    return runtime.transfer(appId, taskId, body == null ? new TransferTaskRequest(null, null) : body);
  }

  @GetMapping("/instances/{instanceId}")
  public InstanceView instance(
      @PathVariable("appId") UUID appId, @PathVariable("instanceId") String instanceId) {
    return runtime.instance(appId, instanceId);
  }
}
