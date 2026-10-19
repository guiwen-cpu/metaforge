package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.RuntimeRequests.CompleteTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.StartInstanceRequest;
import dev.lcp.bff.runtime.dto.RuntimeRequests.TransferTaskRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionView;
import dev.lcp.bff.runtime.dto.RuntimeViews.FieldView;
import dev.lcp.bff.runtime.dto.RuntimeViews.FieldOption;
import dev.lcp.bff.runtime.dto.RuntimeViews.FlowView;
import dev.lcp.bff.runtime.dto.RuntimeViews.InstanceView;
import dev.lcp.bff.runtime.dto.RuntimeViews.InstanceSummary;
import dev.lcp.bff.runtime.dto.RuntimeViews.StartResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskDetail;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskFormView;
import dev.lcp.bff.runtime.dto.RuntimeViews.TaskSummary;
import dev.lcp.bff.runtime.dto.RuntimeViews.TimelineItem;
import dev.lcp.bff.tenant.TenantContext;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.flowable.engine.HistoryService;
import org.flowable.engine.IdentityService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.springframework.stereotype.Service;

/** Flowable 运行时：启动实例、解析办理人、办理任务并回写业务单据。 */
@Service
public class ProcessRuntimeService {

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  private final RepositoryService repositoryService;
  private final RuntimeService runtimeService;
  private final TaskService taskService;
  private final HistoryService historyService;
  private final IdentityService identityService;
  private final PublishedBundleService bundles;
  private final FlowDeploymentService deployments;
  private final BusinessRecordService records;
  private final RuntimeUserDirectory users;
  private final NotificationService notifications;

  public ProcessRuntimeService(
      RepositoryService repositoryService,
      RuntimeService runtimeService,
      TaskService taskService,
      HistoryService historyService,
      IdentityService identityService,
      PublishedBundleService bundles,
      FlowDeploymentService deployments,
      BusinessRecordService records,
      RuntimeUserDirectory users,
      NotificationService notifications) {
    this.repositoryService = repositoryService;
    this.runtimeService = runtimeService;
    this.taskService = taskService;
    this.historyService = historyService;
    this.identityService = identityService;
    this.bundles = bundles;
    this.deployments = deployments;
    this.records = records;
    this.users = users;
    this.notifications = notifications;
  }

  // ------------------------------------------------------------ 流程定义

  public List<FlowView> listFlows(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<FlowDeploymentService.DeployedFlow> deployed = deployments.ensureDeployed(appId);
    List<FlowView> out = new ArrayList<>();
    for (JsonNode flow : bundles.flows(published.content())) {
      String flowKey = flow.path("key").asText();
      String processKey = flow.path("processKey").asText(flowKey);
      String definitionId = deployed.stream()
          .filter(item -> flowKey.equals(item.flowKey()))
          .map(FlowDeploymentService.DeployedFlow::processDefinitionId)
          .findFirst().orElse(null);
      List<TaskFormView> forms = new ArrayList<>();
      for (JsonNode form : flow.path("taskForms")) {
        forms.add(taskFormView(form));
      }
      out.add(new FlowView(flowKey, text(flow.path("name"), flowKey), processKey,
          definitionId, definitionId != null, forms));
    }
    return out;
  }

  // ------------------------------------------------------------ 实例

  public StartResult start(UUID appId, String flowKey, StartInstanceRequest request) {
    PublishedBundle published = bundles.load(appId);
    JsonNode flow = bundles.flow(published.content(), flowKey);
    String key = flow.path("key").asText();
    JsonNode entity = records.entity(published.content(), flow);
    if (entity == null) {
      throw PlatformException.badRequest("entity_missing", "流程 " + key + " 未绑定业务实体");
    }

    String businessId = trimToNull(request.businessId());
    Map<String, Object> business;
    if (businessId == null) {
      if (request.business() == null || request.business().isEmpty()) {
        throw PlatformException.badRequest("business_required", "启动流程需要 businessId 或 business 数据");
      }
      business = new LinkedHashMap<>(request.business());
      business.putIfAbsent("applicant_id", user());
      business.putIfAbsent("created_by", user());
      businessId = records.create(entity, business, user());
    } else {
      business = records.get(entity, businessId);
      if (business.isEmpty()) {
        throw PlatformException.notFound("业务单据 " + businessId + " 不存在");
      }
      if (trimToNull(string(business.get("process_instance_id"))) != null) {
        throw PlatformException.conflict("process_already_started",
            "业务单据 " + businessId + " 已启动流程");
      }
    }

    Map<String, Object> variables = variables(flow, business, request.variables());
    FlowDeploymentService.DeployedFlow deployed = deployments.find(
        deployments.ensureDeployed(appId), key);
    ProcessDefinition definition = repositoryService.getProcessDefinition(
        deployed.processDefinitionId());
    if (definition == null || !tenant().equals(definition.getTenantId())) {
      throw PlatformException.badRequest("flow_not_deployed", "流程定义不属于当前租户");
    }

    ProcessInstance instance;
    identityService.setAuthenticatedUserId(user());
    try {
      instance = runtimeService.createProcessInstanceBuilder()
          .processDefinitionId(deployed.processDefinitionId())
          .businessKey(businessId)
          .name(records.title(entity, business, businessId))
          .tenantId(tenant())
          .variables(variables)
          .start();
    } finally {
      identityService.setAuthenticatedUserId(null);
    }

    markBusiness(entity, businessId, updates(
        "status", "pending",
        "process_instance_id", instance.getId(),
        "current_task", "applySubmit",
        "approver_id", null));

    // 提交动作启动后立即完成申请人节点；退回修改时该节点会再次出现。
    Task apply = taskService.createTaskQuery()
        .processInstanceId(instance.getId())
        .taskDefinitionKey("applySubmit")
        .taskTenantId(tenant())
        .singleResult();
    if (apply != null) {
      String applicant = string(variables.get("applicantId"));
      if (applicant != null) {
        taskService.setAssignee(apply.getId(), applicant);
      }
      taskService.complete(apply.getId(), variables);
    }

    Task next = assignActiveTasks(appId, published.content(), flow, entity, businessId, instance.getId());
    String currentTaskKey = next == null ? null : next.getTaskDefinitionKey();
    String assignee = next == null ? null : next.getAssignee();
    TaskDetail detail = next == null ? null : taskDetail(appId, next.getId());
    return new StartResult(instance.getId(), businessId, key, currentTaskKey, assignee, detail);
  }

  public InstanceView instance(UUID appId, String instanceId) {
    PublishedBundle published = bundles.load(appId);
    ProcessInstance active = runtimeService.createProcessInstanceQuery()
        .processInstanceId(instanceId)
        .processInstanceTenantId(tenant())
        .singleResult();
    HistoricProcessInstance historic = active == null
        ? historyService.createHistoricProcessInstanceQuery()
            .processInstanceId(instanceId)
            .processInstanceTenantId(tenant())
            .singleResult()
        : null;
    if (active == null && historic == null) {
      throw PlatformException.notFound("流程实例 " + instanceId + " 不存在");
    }
    String definitionId = active == null ? historic.getProcessDefinitionId() : active.getProcessDefinitionId();
    String businessKey = active == null ? historic.getBusinessKey() : active.getBusinessKey();
    JsonNode flow = flowFor(published.content(), definitionId, null);
    JsonNode entity = records.entity(published.content(), flow);
    Map<String, Object> business = records.get(entity, businessKey);
    Map<String, Object> variables = active == null
        ? historicVariables(instanceId) : runtimeService.getVariables(instanceId);
    List<TaskSummary> activeTasks = active == null
        ? List.of() : todoForInstance(published.content(), instanceId);
    return new InstanceView(instanceId, definitionId, businessKey,
        records.title(entity, business, businessKey),
        flow.path("key").asText(), text(flow.path("name"), flow.path("key").asText()),
        active == null, string(business.get("status")), business, variables,
        fields(published.content(), entity, business), activeTasks, timeline(instanceId));
  }

  // ------------------------------------------------------------ 待办 / 已办

  public List<TaskSummary> todo(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<Task> tasks = taskService.createTaskQuery()
        .taskTenantId(tenant())
        .taskAssignee(user())
        .orderByTaskCreateTime().desc()
        .listPage(0, 100);
    List<TaskSummary> out = new ArrayList<>();
    for (Task task : tasks) {
      out.add(taskSummary(published.content(), task));
    }
    return out;
  }

  public List<TaskSummary> done(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<HistoricTaskInstance> tasks = historyService.createHistoricTaskInstanceQuery()
        .taskTenantId(tenant())
        .taskAssignee(user())
        .finished()
        .orderByHistoricTaskInstanceEndTime().desc()
        .listPage(0, 100);
    List<TaskSummary> out = new ArrayList<>();
    for (HistoricTaskInstance task : tasks) {
      JsonNode flow = flowFor(published.content(), task.getProcessDefinitionId(), null);
      if (isInitiatorTask(flow, task.getTaskDefinitionKey())) {
        continue;
      }
      out.add(taskSummary(published.content(), task));
    }
    return out;
  }

  private boolean isInitiatorTask(JsonNode flow, String taskKey) {
    for (JsonNode form : flow.path("taskForms")) {
      if (taskKey != null && taskKey.equals(form.path("taskKey").asText())
          && "initiator".equals(form.path("assignee").path("type").asText())) {
        return true;
      }
    }
    return false;
  }

  public List<InstanceSummary> initiated(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<HistoricProcessInstance> instances = historyService.createHistoricProcessInstanceQuery()
        .processInstanceTenantId(tenant())
        .variableValueEquals("applicantId", user())
        .orderByProcessInstanceStartTime().desc()
        .listPage(0, 100);
    List<InstanceSummary> out = new ArrayList<>();
    for (HistoricProcessInstance instance : instances) {
      JsonNode flow = flowFor(published.content(), instance.getProcessDefinitionId(), null);
      JsonNode entity = records.entity(published.content(), flow);
      Map<String, Object> business = records.get(entity, instance.getBusinessKey());
      out.add(new InstanceSummary(
          instance.getId(),
          instance.getProcessDefinitionId(),
          instance.getBusinessKey(),
          flow.path("key").asText(),
          text(flow.path("name"), flow.path("key").asText()),
          records.title(entity, business, instance.getBusinessKey()),
          string(business.get("applicant_id")),
          string(business.get("status")),
          instance.getEndTime() != null,
          at(instance.getStartTime()),
          at(instance.getEndTime())));
    }
    return out;
  }

  public TaskDetail taskDetail(UUID appId, String taskId) {
    PublishedBundle published = bundles.load(appId);
    Task active = taskService.createTaskQuery()
        .taskId(taskId).taskTenantId(tenant()).singleResult();
    HistoricTaskInstance historic = active == null
        ? historyService.createHistoricTaskInstanceQuery()
            .taskId(taskId).taskTenantId(tenant()).singleResult()
        : null;
    if (active == null && historic == null) {
      throw PlatformException.notFound("任务 " + taskId + " 不存在");
    }

    String processInstanceId = active == null ? historic.getProcessInstanceId() : active.getProcessInstanceId();
    String definitionId = active == null ? historic.getProcessDefinitionId() : active.getProcessDefinitionId();
    String taskKey = active == null ? historic.getTaskDefinitionKey() : active.getTaskDefinitionKey();
    String taskName = active == null ? historic.getName() : active.getName();
    String assignee = active == null ? historic.getAssignee() : active.getAssignee();
    Date created = active == null ? historic.getCreateTime() : active.getCreateTime();
    Date due = active == null ? historic.getDueDate() : active.getDueDate();
    String businessKey = businessKey(processInstanceId, active == null);
    Map<String, Object> variables = active == null
        ? historicVariables(processInstanceId) : runtimeService.getVariables(processInstanceId);
    JsonNode flow = flowFor(published.content(), definitionId, null);
    JsonNode entity = records.entity(published.content(), flow);
    Map<String, Object> business = records.get(entity, businessKey);
    JsonNode form = taskForm(flow, taskKey);
    boolean finished = active == null;
    boolean canAct = !finished && (assignee == null || assignee.equals(user()));
    List<ActionView> actions = canAct ? actions(form) : List.of();

    return new TaskDetail(
        taskId,
        taskKey,
        text(taskName, text(form.path("name").path("default"), taskKey)),
        processInstanceId,
        definitionId,
        businessKey,
        records.title(entity, business, businessKey),
        flow.path("key").asText(),
        text(flow.path("name"), flow.path("key").asText()),
        assignee,
        string(business.get("applicant_id")),
        canAct,
        finished,
        string(business.get("status")),
        at(created),
        at(due),
        business,
        fields(published.content(), entity, business),
        variables,
        actions,
        strings(form.path("editableFields")),
        strings(form.path("readonlyFields")),
        timeline(processInstanceId));
  }

  // ------------------------------------------------------------ 任务动作

  public TaskDetail claim(UUID appId, String taskId) {
    Task task = requireTask(taskId);
    if (task.getAssignee() != null && !task.getAssignee().equals(user())) {
      throw PlatformException.conflict("task_claimed", "任务已由 " + task.getAssignee() + " 领取");
    }
    taskService.claim(taskId, user());
    PublishedBundle published = bundles.load(appId);
    JsonNode flow = flowFor(published.content(), task.getProcessDefinitionId(), null);
    JsonNode entity = records.entity(published.content(), flow);
    String businessKey = businessKey(task.getProcessInstanceId(), false);
    markBusiness(entity, businessKey, updates("approver_id", user()));
    return taskDetail(appId, taskId);
  }

  public TaskDetail transfer(UUID appId, String taskId, TransferTaskRequest request) {
    String toUserId = trimToNull(request.toUserId());
    if (toUserId == null) {
      throw PlatformException.badRequest("transfer_target_required", "请选择转办目标");
    }
    Task task = requireTask(taskId);
    requireOwner(task);
    if (trimToNull(request.comment()) != null) {
      taskService.addComment(taskId, task.getProcessInstanceId(), request.comment().trim());
    }
    taskService.setAssignee(taskId, toUserId);
    PublishedBundle published = bundles.load(appId);
    JsonNode flow = flowFor(published.content(), task.getProcessDefinitionId(), null);
    JsonNode entity = records.entity(published.content(), flow);
    String businessKey = businessKey(task.getProcessInstanceId(), false);
    markBusiness(entity, businessKey, updates("approver_id", toUserId));
    if (!toUserId.equals(user())) {
      String businessTitle = records.title(entity, records.get(entity, businessKey), businessKey);
      notifications.send(appId, toUserId, "task_transferred",
          "任务已转办给你",
          "流程「" + text(flow.path("name"), flow.path("key").asText())
              + "」的单据「" + businessTitle + "」已转交给你处理。",
          "/apps/" + appId + "/approvals/" + taskId, "task", taskId);
    }
    return taskDetail(appId, taskId);
  }

  public TaskDetail complete(UUID appId, String taskId, CompleteTaskRequest request) {
    Task task = requireTask(taskId);
    requireOwner(task);
    PublishedBundle published = bundles.load(appId);
    JsonNode flow = flowFor(published.content(), task.getProcessDefinitionId(), null);
    JsonNode entity = records.entity(published.content(), flow);
    JsonNode form = taskForm(flow, task.getTaskDefinitionKey());
    String outcome = trimToNull(request.outcome());
    outcome = outcome == null
        ? ("applySubmit".equals(task.getTaskDefinitionKey()) ? "submit" : "approve") : outcome;
    ActionView action = findAction(actions(form), outcome);
    String comment = trimToNull(request.comment());
    if (action != null && action.commentRequired() && comment == null) {
      throw PlatformException.badRequest("comment_required", "该操作必须填写审批意见");
    }
    if (action == null && !"applySubmit".equals(task.getTaskDefinitionKey())) {
      throw PlatformException.badRequest("outcome_invalid", "当前节点不支持操作 " + outcome);
    }

    String businessKey = businessKey(task.getProcessInstanceId(), false);
    Map<String, Object> business = records.get(entity, businessKey);
    String businessTitle = records.title(entity, business, businessKey);
    String flowName = text(flow.path("name"), flow.path("key").asText());
    Map<String, Object> variables = new LinkedHashMap<>(runtimeService.getVariables(task.getProcessInstanceId()));
    Map<String, Object> incoming = request.variables() == null ? Map.of() : request.variables();
    if ("applySubmit".equals(task.getTaskDefinitionKey())) {
      variables.putAll(incoming);
    } else {
      Set<String> editable = new LinkedHashSet<>(strings(form.path("editableFields")));
      for (Map.Entry<String, Object> entry : incoming.entrySet()) {
        if (editable.contains(entry.getKey()) || editable.contains(snake(entry.getKey()))) {
          variables.put(entry.getKey(), entry.getValue());
        }
      }
    }
    variables.put("outcome", outcome);
    if (comment != null) {
      variables.put("comment", comment);
    }
    recomputeNeedProof(variables);
    updateBusiness(entity, businessKey, form, incoming);

    if (comment != null) {
      taskService.addComment(taskId, task.getProcessInstanceId(), comment);
    }

    if ("reject".equals(outcome)) {
      runtimeService.setVariables(task.getProcessInstanceId(), variables);
      runtimeService.deleteProcessInstance(task.getProcessInstanceId(),
          "reject" + (comment == null ? "" : ": " + comment));
      markBusiness(entity, businessKey, updates(
          "status", "rejected", "current_task", null, "approver_id", user(),
          "approved_at", OffsetDateTime.now(ZONE)));
      notifyApplicant(appId, variables, "flow_rejected", "流程已驳回",
          "你的申请「" + businessTitle + "」在流程「" + flowName + "」中被驳回。",
          "/apps/" + appId + "/instances/" + task.getProcessInstanceId(),
          "instance", task.getProcessInstanceId());
      return taskDetail(appId, taskId);
    }

    if ("return".equals(outcome)) {
      runtimeService.setVariables(task.getProcessInstanceId(), variables);
      runtimeService.createChangeActivityStateBuilder()
          .processInstanceId(task.getProcessInstanceId())
          .moveActivityIdTo(task.getTaskDefinitionKey(), "applySubmit")
          .changeState();
      Task returned = taskService.createTaskQuery()
          .processInstanceId(task.getProcessInstanceId())
          .taskDefinitionKey("applySubmit")
          .taskTenantId(tenant())
          .singleResult();
      String applicant = string(variables.get("applicantId"));
      if (returned != null && applicant != null) {
        taskService.setAssignee(returned.getId(), applicant);
      }
      markBusiness(entity, businessKey, updates(
          "status", "returned", "current_task", "applySubmit", "approver_id", applicant));
      String returnedId = returned == null ? task.getProcessInstanceId() : returned.getId();
      String returnedLink = returned == null
          ? "/apps/" + appId + "/instances/" + task.getProcessInstanceId()
          : "/apps/" + appId + "/approvals/" + returnedId;
      notifyApplicant(appId, variables, "task_returned", "流程已退回",
          "你的申请「" + businessTitle + "」被退回，请修改后重新提交。",
          returnedLink, returned == null ? "instance" : "task", returnedId);
      return taskDetail(appId, taskId);
    }

    if ("transfer".equals(outcome)) {
      throw PlatformException.badRequest("transfer_use_endpoint", "请使用转办接口提交目标人员");
    }

    taskService.complete(taskId, variables);
    Task next = assignActiveTasks(appId, published.content(), flow, entity, businessKey,
        task.getProcessInstanceId());
    if (next == null) {
      markBusiness(entity, businessKey, updates(
          "status", "approved", "current_task", null, "approver_id", user(),
          "approved_at", OffsetDateTime.now(ZONE)));
      notifyApplicant(appId, variables, "flow_approved", "流程已通过",
          "你的申请「" + businessTitle + "」已通过审批。",
          "/apps/" + appId + "/instances/" + task.getProcessInstanceId(),
          "instance", task.getProcessInstanceId());
    }
    return taskDetail(appId, taskId);
  }

  public JsonNode flowForDefinition(JsonNode bundle, String definitionId) {
    if (definitionId == null || definitionId.isBlank()) {
      return null;
    }
    try {
      return flowFor(bundle, definitionId, null);
    } catch (RuntimeException ex) {
      return null;
    }
  }

  public String businessKeyOf(String processInstanceId) {
    if (processInstanceId == null || processInstanceId.isBlank()) {
      return null;
    }
    return businessKey(processInstanceId, false);
  }

  // ------------------------------------------------------------ 内部：查询与映射

  private void notifyApplicant(
      UUID appId,
      Map<String, Object> variables,
      String type,
      String title,
      String body,
      String link,
      String bizType,
      String bizId) {
    String applicant = string(variables.get("applicantId"));
    if (applicant == null || applicant.isBlank() || applicant.equals(user())) {
      return;
    }
    notifications.send(appId, applicant, type, title, body, link, bizType, bizId);
  }

  private Task requireTask(String taskId) {
    Task task = taskService.createTaskQuery().taskId(taskId).taskTenantId(tenant()).singleResult();
    if (task == null) {
      throw PlatformException.notFound("任务 " + taskId + " 不存在或已办理");
    }
    return task;
  }

  private void requireOwner(Task task) {
    String assignee = task.getAssignee();
    if (assignee == null) {
      taskService.claim(task.getId(), user());
      return;
    }
    if (!assignee.equals(user())) {
      throw PlatformException.forbidden("任务当前由 " + assignee + " 办理");
    }
  }

  private Task assignActiveTasks(
      UUID appId, JsonNode bundle, JsonNode flow, JsonNode entity, String businessKey,
      String processInstanceId) {
    List<Task> tasks = taskService.createTaskQuery()
        .processInstanceId(processInstanceId)
        .taskTenantId(tenant())
        .orderByTaskCreateTime().asc()
        .list();
    if (tasks.isEmpty()) {
      return null;
    }
    Map<String, Object> variables = runtimeService.getVariables(processInstanceId);
    Map<String, Object> business = records.get(entity, businessKey);
    String businessTitle = records.title(entity, business, businessKey);
    String flowName = text(flow.path("name"), flow.path("key").asText());
    String firstAssignee = null;
    String firstTaskName = null;
    for (Task task : tasks) {
      JsonNode form = taskForm(flow, task.getTaskDefinitionKey());
      JsonNode spec = form.path("assignee");
      String assignee = users.resolve(spec.path("type").asText(null), spec,
          variables.get("applicantId"));
      if (assignee != null) {
        taskService.setAssignee(task.getId(), assignee);
        if (!assignee.equals(user())) {
          notifications.send(appId, assignee, "task_assigned",
              "待办：" + businessTitle,
              "流程「" + flowName + "」的节点「" + text(task.getName(), task.getTaskDefinitionKey())
                  + "」等待你处理。",
              "/apps/" + appId + "/approvals/" + task.getId(), "task", task.getId());
        }
      }
      if (firstAssignee == null) {
        firstAssignee = assignee == null ? task.getAssignee() : assignee;
        firstTaskName = text(task.getName(), task.getTaskDefinitionKey());
      }
    }
    markBusiness(entity, businessKey, updates(
        "status", "pending",
        "current_task", firstTaskName,
        "approver_id", firstAssignee));
    return tasks.get(0);
  }

  private List<TaskSummary> todoForInstance(JsonNode bundle, String processInstanceId) {
    List<Task> tasks = taskService.createTaskQuery()
        .processInstanceId(processInstanceId)
        .taskTenantId(tenant())
        .orderByTaskCreateTime().asc()
        .list();
    List<TaskSummary> out = new ArrayList<>();
    for (Task task : tasks) {
      out.add(taskSummary(bundle, task));
    }
    return out;
  }

  private TaskSummary taskSummary(JsonNode bundle, Task task) {
    String definitionId = task.getProcessDefinitionId();
    JsonNode flow = flowFor(bundle, definitionId, null);
    JsonNode entity = records.entity(bundle, flow);
    String businessKey = businessKey(task.getProcessInstanceId(), false);
    Map<String, Object> business = records.get(entity, businessKey);
    return new TaskSummary(task.getId(), task.getTaskDefinitionKey(),
        text(task.getName(), task.getTaskDefinitionKey()), task.getProcessInstanceId(),
        definitionId, businessKey, records.title(entity, business, businessKey),
        flow.path("key").asText(), text(flow.path("name"), flow.path("key").asText()),
        task.getAssignee(), string(business.get("applicant_id")), string(business.get("status")),
        at(task.getCreateTime()), at(task.getDueDate()));
  }

  private TaskSummary taskSummary(JsonNode bundle, HistoricTaskInstance task) {
    String definitionId = task.getProcessDefinitionId();
    JsonNode flow = flowFor(bundle, definitionId, null);
    JsonNode entity = records.entity(bundle, flow);
    String businessKey = businessKey(task.getProcessInstanceId(), true);
    Map<String, Object> business = records.get(entity, businessKey);
    return new TaskSummary(task.getId(), task.getTaskDefinitionKey(),
        text(task.getName(), task.getTaskDefinitionKey()), task.getProcessInstanceId(),
        definitionId, businessKey, records.title(entity, business, businessKey),
        flow.path("key").asText(), text(flow.path("name"), flow.path("key").asText()),
        task.getAssignee(), string(business.get("applicant_id")), string(business.get("status")),
        at(task.getCreateTime()), at(task.getDueDate()));
  }

  private String businessKey(String processInstanceId, boolean finished) {
    if (finished) {
      HistoricProcessInstance instance = historyService.createHistoricProcessInstanceQuery()
          .processInstanceId(processInstanceId).processInstanceTenantId(tenant()).singleResult();
      return instance == null ? null : instance.getBusinessKey();
    }
    ProcessInstance instance = runtimeService.createProcessInstanceQuery()
        .processInstanceId(processInstanceId).processInstanceTenantId(tenant()).singleResult();
    if (instance != null) {
      return instance.getBusinessKey();
    }
    HistoricProcessInstance historic = historyService.createHistoricProcessInstanceQuery()
        .processInstanceId(processInstanceId).processInstanceTenantId(tenant()).singleResult();
    return historic == null ? null : historic.getBusinessKey();
  }

  private JsonNode flowFor(JsonNode bundle, String definitionId, String fallbackKey) {
    FlowDeploymentService.DeployedFlow deployed = deployments.byProcessDefinitionId(definitionId);
    if (deployed != null) {
      return bundles.flow(bundle, deployed.flowKey());
    }
    if (fallbackKey != null) {
      return bundles.flow(bundle, fallbackKey);
    }
    for (JsonNode flow : bundles.flows(bundle)) {
      String processKey = flow.path("processKey").asText(flow.path("key").asText());
      if (processKey.equals(definitionId) || flow.path("key").asText().equals(definitionId)) {
        return flow;
      }
    }
    throw PlatformException.notFound("流程定义 " + definitionId + " 未关联发布版本");
  }

  private List<FieldView> fields(JsonNode bundle, JsonNode entity, Map<String, Object> business) {
    List<FieldView> out = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (JsonNode field : entity.path("fields")) {
      String key = field.path("key").asText();
      if (key.isBlank() || "process_instance_id".equals(key) || "id".equals(key)
          || field.path("uiHints").path("hideInForm").asBoolean(false)) {
        continue;
      }
      seen.add(key);
      out.add(new FieldView(key, field.path("label").asText(key), field.path("type").asText("string"),
          business.get(key), fieldOptions(bundle, field),
          field.path("uiHints").path("widget").asText(null)));
    }
    for (Map.Entry<String, Object> entry : business.entrySet()) {
      String key = entry.getKey();
      if (seen.contains(key) || key.startsWith("__") || "process_instance_id".equals(key)
          || "tenant_id".equals(key) || "ext".equals(key) || "id".equals(key)) {
        continue;
      }
      out.add(new FieldView(key, key, "string", entry.getValue(), null, null));
    }
    return out;
  }

  private List<FieldOption> fieldOptions(JsonNode bundle, JsonNode field) {
    List<FieldOption> out = new ArrayList<>();
    for (JsonNode option : field.path("enumValues")) {
      out.add(new FieldOption(text(option.path("label"), option.path("value").asText()),
          option.path("value").asText()));
    }
    String enumKey = field.path("enumRef").path("key").asText(null);
    if (out.isEmpty() && enumKey != null) {
      JsonNode schema = findEnum(bundle, enumKey);
      if (schema != null) {
        for (JsonNode option : schema.path("values")) {
          out.add(new FieldOption(text(option.path("label"), option.path("value").asText()),
              option.path("value").asText()));
        }
      }
    }
    return out.isEmpty() ? null : out;
  }

  private JsonNode findEnum(JsonNode bundle, String enumKey) {
    for (JsonNode schema : bundle.path("artifacts").path("dataSchemas")) {
      for (JsonNode enumSchema : schema.path("enums")) {
        if (enumKey.equals(enumSchema.path("key").asText())) {
          return enumSchema;
        }
      }
    }
    for (JsonNode enumSchema : bundle.path("artifacts").path("enums")) {
      if (enumKey.equals(enumSchema.path("key").asText())) {
        return enumSchema;
      }
    }
    return null;
  }

  private List<TimelineItem> timeline(String processInstanceId) {
    List<TimelineItem> out = new ArrayList<>();
    List<HistoricActivityInstance> activities = historyService.createHistoricActivityInstanceQuery()
        .processInstanceId(processInstanceId)
        .orderByHistoricActivityInstanceStartTime().asc()
        .list();
    for (HistoricActivityInstance activity : activities) {
      if ("sequenceFlow".equals(activity.getActivityType())) {
        continue;
      }
      out.add(new TimelineItem(activity.getActivityId(), activity.getActivityName(),
          activity.getActivityType(), activity.getAssignee(), at(activity.getStartTime()),
          at(activity.getEndTime()), activity.getDurationInMillis(),
          activity.getEndTime() == null ? "active" : "completed"));
    }
    return out;
  }

  private Map<String, Object> historicVariables(String processInstanceId) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (org.flowable.variable.api.history.HistoricVariableInstance variable
        : historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId).list()) {
      out.put(variable.getVariableName(), variable.getValue());
    }
    return out;
  }

  private List<ActionView> actions(JsonNode form) {
    List<ActionView> out = new ArrayList<>();
    for (JsonNode button : form.path("buttons")) {
      String outcome = text(button.path("outcome"), button.path("key").asText());
      out.add(new ActionView(button.path("key").asText(), button.path("label").path("default")
          .asText(button.path("key").asText()), outcome, button.path("style").asText("default"),
          button.path("commentRequired").asBoolean(false)));
    }
    if (out.isEmpty() && "applySubmit".equals(form.path("taskKey").asText())) {
      out.add(new ActionView("submit", "提交", "submit", "primary", false));
    }
    if (out.isEmpty()) {
      out.add(new ActionView("approve", "同意", "approve", "primary", false));
      out.add(new ActionView("reject", "驳回", "reject", "danger", true));
    }
    return out;
  }

  private static ActionView findAction(List<ActionView> actions, String outcome) {
    for (ActionView action : actions) {
      if (action.outcome().equals(outcome) || action.key().equals(outcome)) {
        return action;
      }
    }
    return null;
  }

  private TaskFormView taskFormView(JsonNode form) {
    String name = text(form.path("name").path("default"), form.path("taskKey").asText());
    return new TaskFormView(form.path("taskKey").asText(), name,
        form.path("pageRef").path("key").asText(null),
        form.path("assignee").path("type").asText(null), actions(form),
        strings(form.path("editableFields")), strings(form.path("readonlyFields")));
  }

  private static JsonNode taskForm(JsonNode flow, String taskKey) {
    for (JsonNode form : flow.path("taskForms")) {
      if (taskKey != null && taskKey.equals(form.path("taskKey").asText())) {
        return form;
      }
    }
    throw PlatformException.badRequest("task_form_missing", "流程未声明节点 " + taskKey + " 的表单");
  }

  // ------------------------------------------------------------ 内部：变量与业务回写

  private Map<String, Object> variables(
      JsonNode flow, Map<String, Object> business, Map<String, Object> overrides) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (JsonNode spec : flow.path("variables")) {
      String direction = spec.path("direction").asText("in");
      if (!"in".equals(direction) && !"inout".equals(direction)) {
        continue;
      }
      String name = spec.path("name").asText();
      Object value = eval(spec.path("source"), business, out);
      if (value == null && spec.has("defaultValue")) {
        value = plain(spec.get("defaultValue"));
      }
      if (value != null) {
        out.put(name, coerce(spec.path("type").asText("string"), value));
      }
    }
    if (overrides != null) {
      out.putAll(overrides);
    }
    recomputeNeedProof(out);
    return out;
  }

  private static void recomputeNeedProof(Map<String, Object> variables) {
    Object leaveType = variables.get("leaveType");
    if (leaveType == null) {
      leaveType = variables.get("leave_type");
    }
    Object days = variables.get("days");
    if (leaveType != null && days != null) {
      boolean sick = "sick".equals(String.valueOf(leaveType));
      boolean longLeave = number(days).compareTo(BigDecimal.valueOf(3)) >= 0;
      variables.put("needProof", sick && longLeave);
    }
  }

  private void updateBusiness(
      JsonNode entity, String businessId, JsonNode form, Map<String, Object> incoming) {
    if (incoming == null || incoming.isEmpty()) {
      return;
    }
    Set<String> editable = new LinkedHashSet<>(strings(form.path("editableFields")));
    Set<String> columns = new LinkedHashSet<>();
    for (JsonNode field : entity.path("fields")) {
      columns.add(field.path("key").asText());
    }
    Map<String, Object> updates = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : incoming.entrySet()) {
      String key = entry.getKey();
      String column = columns.contains(key) ? key : columns.contains(snake(key)) ? snake(key) : null;
      if (column == null) {
        continue;
      }
      if (editable.isEmpty() || editable.contains(column)) {
        updates.put(column, entry.getValue());
      }
    }
    if (!updates.isEmpty()) {
      markBusiness(entity, businessId, updates);
    }
  }

  private void markBusiness(JsonNode entity, String businessId, Map<String, Object> updates) {
    if (entity == null || businessId == null || updates.isEmpty()) {
      return;
    }
    records.update(entity, businessId, updates, user());
  }

  private Object eval(JsonNode source, Map<String, Object> form, Map<String, Object> variables) {
    if (source == null || source.isNull() || source.isMissingNode()) {
      return null;
    }
    if (source.has("$lit")) {
      return plain(source.get("$lit"));
    }
    if (source.has("$ref")) {
      return reference(source.get("$ref").asText(), form, variables);
    }
    if (source.has("$fn")) {
      String fn = source.get("$fn").asText();
      List<Object> args = new ArrayList<>();
      for (JsonNode arg : source.path("$args")) {
        args.add(eval(arg, form, variables));
      }
      return call(fn, args);
    }
    return plain(source);
  }

  private Object reference(String ref, Map<String, Object> form, Map<String, Object> variables) {
    if (ref.startsWith("$form.")) {
      return form.get(ref.substring("$form.".length()));
    }
    if (ref.startsWith("$process.variables.")) {
      return variables.get(ref.substring("$process.variables.".length()));
    }
    if ("$user.id".equals(ref)) {
      return user();
    }
    return null;
  }

  private static Object call(String fn, List<Object> args) {
    return switch (fn) {
      case "and" -> args.stream().allMatch(ProcessRuntimeService::truthy);
      case "or" -> args.stream().anyMatch(ProcessRuntimeService::truthy);
      case "eq" -> equal(args.get(0), args.get(1));
      case "ne" -> !equal(args.get(0), args.get(1));
      case "gt" -> compare(args.get(0), args.get(1)) > 0;
      case "gte" -> compare(args.get(0), args.get(1)) >= 0;
      case "lt" -> compare(args.get(0), args.get(1)) < 0;
      case "lte" -> compare(args.get(0), args.get(1)) <= 0;
      case "in" -> args.size() > 1 && contains(args.get(1), args.get(0));
      case "concat" -> args.stream().map(String::valueOf).reduce("", String::concat);
      default -> null;
    };
  }

  private static boolean contains(Object collection, Object value) {
    if (collection instanceof Collection<?> items) {
      return items.stream().anyMatch(item -> equal(item, value));
    }
    return false;
  }

  private static boolean equal(Object left, Object right) {
    if (left instanceof Number || right instanceof Number) {
      return number(left).compareTo(number(right)) == 0;
    }
    return Objects.equals(left == null ? null : String.valueOf(left),
        right == null ? null : String.valueOf(right));
  }

  private static int compare(Object left, Object right) {
    if (left instanceof Number || right instanceof Number) {
      return number(left).compareTo(number(right));
    }
    return String.valueOf(left).compareTo(String.valueOf(right));
  }

  private static BigDecimal number(Object value) {
    if (value == null) {
      return BigDecimal.ZERO;
    }
    return value instanceof BigDecimal decimal ? decimal : new BigDecimal(String.valueOf(value));
  }

  private static boolean truthy(Object value) {
    return value instanceof Boolean bool ? bool : value != null && !String.valueOf(value).isBlank();
  }

  private static Object coerce(String type, Object value) {
    if (value == null) {
      return null;
    }
    return switch (type) {
      case "decimal", "number" -> number(value);
      case "integer" -> number(value).intValue();
      case "boolean" -> value instanceof Boolean bool ? bool : Boolean.parseBoolean(String.valueOf(value));
      default -> String.valueOf(value);
    };
  }

  private static Object plain(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return null;
    }
    if (node.isObject()) {
      Map<String, Object> out = new LinkedHashMap<>();
      node.fields().forEachRemaining(entry -> out.put(entry.getKey(), plain(entry.getValue())));
      return out;
    }
    if (node.isArray()) {
      List<Object> out = new ArrayList<>();
      node.forEach(item -> out.add(plain(item)));
      return out;
    }
    if (node.isNumber()) {
      return node.numberValue();
    }
    if (node.isBoolean()) {
      return node.booleanValue();
    }
    return node.asText();
  }

  private static List<String> strings(JsonNode node) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : node) {
      out.add(item.asText());
    }
    return out;
  }

  private static String text(JsonNode node, String fallback) {
    return node == null || node.isMissingNode() || node.isNull() || node.asText().isBlank()
        ? fallback : node.asText();
  }

  private static String text(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static Map<String, Object> updates(Object... pairs) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (int index = 0; index + 1 < pairs.length; index += 2) {
      out.put(String.valueOf(pairs[index]), pairs[index + 1]);
    }
    return out;
  }

  private static String snake(String value) {
    StringBuilder out = new StringBuilder();
    for (int index = 0; index < value.length(); index++) {
      char ch = value.charAt(index);
      if (Character.isUpperCase(ch)) {
        out.append('_').append(Character.toLowerCase(ch));
      } else {
        out.append(ch);
      }
    }
    return out.toString();
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static OffsetDateTime at(Date date) {
    return date == null ? null : OffsetDateTime.ofInstant(Instant.ofEpochMilli(date.getTime()), ZONE);
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return tenant;
  }

  private static String user() {
    String user = TenantContext.userId();
    return user == null || user.isBlank() ? "anonymous" : user;
  }
}
