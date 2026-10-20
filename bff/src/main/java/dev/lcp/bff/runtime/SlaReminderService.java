package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.tenant.TenantContext;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 扫描流程 SLA，按 warning / escalate 两个阶段发送一次提醒。 */
@Service
public class SlaReminderService {

  private static final Logger log = LoggerFactory.getLogger(SlaReminderService.class);
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private static final DateTimeFormatter DUE_FORMAT =
      DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZONE);

  private final NamedParameterJdbcTemplate jdbc;
  private final JdbcTemplate plainJdbc;
  private final TransactionTemplate transactions;
  private final PublishedBundleService bundles;
  private final FlowDeploymentService deployments;
  private final ProcessRuntimeService runtime;
  private final BusinessRecordService records;
  private final RuntimeUserDirectory users;
  private final NotificationRuleService notificationRules;
  private final RuntimeService runtimeService;
  private final TaskService taskService;
  private final HistoryService historyService;
  private final ObjectMapper json;

  public SlaReminderService(
      NamedParameterJdbcTemplate jdbc,
      JdbcTemplate plainJdbc,
      TransactionTemplate transactions,
      PublishedBundleService bundles,
      FlowDeploymentService deployments,
      ProcessRuntimeService runtime,
      BusinessRecordService records,
      RuntimeUserDirectory users,
      NotificationRuleService notificationRules,
      RuntimeService runtimeService,
      TaskService taskService,
      HistoryService historyService,
      ObjectMapper json) {
    this.jdbc = jdbc;
    this.plainJdbc = plainJdbc;
    this.transactions = transactions;
    this.bundles = bundles;
    this.deployments = deployments;
    this.runtime = runtime;
    this.records = records;
    this.users = users;
    this.notificationRules = notificationRules;
    this.runtimeService = runtimeService;
    this.taskService = taskService;
    this.historyService = historyService;
    this.json = json;
  }

  @Scheduled(fixedDelay = 30000, initialDelay = 20000)
  public void scan() {
    log.debug("SLA 扫描触发");
    List<String> tenants;
    try {
      tenants = plainJdbc.queryForList(
          "select tenant_id from public.lcp_active_tenants()", String.class);
    } catch (RuntimeException ex) {
      log.warn("SLA 租户发现失败", ex);
      return;
    }
    log.debug("SLA 扫描开始：{} 个租户", tenants.size());
    for (String tenant : tenants) {
      try {
        inTenant(tenant, () -> {
          scanTenant(tenant);
          return null;
        });
      } catch (RuntimeException ex) {
        log.warn("SLA 扫描租户 {} 失败：{}", tenant, ex.getMessage());
      }
    }
  }

  private void scanTenant(String tenant) {
    List<UUID> appIds = jdbc.queryForList("""
        select id from lcp_application
         where tenant_id = :tenant and deleted_at is null and current_version is not null
         order by updated_at desc
        """, new MapSqlParameterSource("tenant", tenant), UUID.class);
    for (UUID appId : appIds) {
      try {
        scanApp(appId);
      } catch (RuntimeException ex) {
        log.warn("SLA 扫描应用 {} 失败：{}", appId, ex.getMessage());
      }
    }
  }

  private void scanApp(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<FlowDeploymentService.DeployedFlow> deployed =
        deployments.deployed(appId, published.versionNo());
    for (FlowDeploymentService.DeployedFlow item : deployed) {
      JsonNode flow = runtime.flowForDefinition(published.content(), item.processDefinitionId());
      if (flow == null) {
        continue;
      }
      JsonNode sla = flow.path("sla");
      if (!sla.isObject() || !sla.path("dueDateHours").isNumber()) {
        continue;
      }
      List<Task> tasks = taskService.createTaskQuery()
          .taskTenantId(TenantContext.tenantId())
          .processDefinitionId(item.processDefinitionId())
          .list();
      log.debug("SLA 扫描应用 {} 流程 {}：活跃任务 {} 个",
          published.appKey(), flow.path("key").asText(), tasks.size());
      for (Task task : tasks) {
        try {
          remind(published, flow, sla, task);
        } catch (RuntimeException ex) {
          log.warn("SLA 提醒任务 {} 失败：{}", task.getId(), ex.getMessage());
        }
      }
    }
  }

  private void remind(PublishedBundle published, JsonNode flow, JsonNode sla, Task task) {
    Date due = task.getDueDate();
    if (due == null) {
      Date start = processStart(task.getProcessInstanceId());
      if (start == null) {
        start = task.getCreateTime();
      }
      due = addHours(start, sla.path("dueDateHours").decimalValue());
    }
    if (due == null) {
      return;
    }
    long now = System.currentTimeMillis();
    long warningAt = sla.path("warningHours").isNumber()
        ? due.getTime() - hoursMillis(sla.path("warningHours").decimalValue()) : Long.MAX_VALUE;
    long escalateAt = sla.path("escalateAfterHours").isNumber()
        ? due.getTime() + hoursMillis(sla.path("escalateAfterHours").decimalValue())
        : Long.MAX_VALUE;
    String stage = now >= escalateAt ? "escalate" : now >= warningAt ? "warning" : null;
    log.debug("SLA 任务 {} due={} warningAt={} escalateAt={} stage={}",
        task.getId(), due.toInstant(), Instant.ofEpochMilli(warningAt),
        Instant.ofEpochMilli(escalateAt), stage);
    if (stage == null) {
      return;
    }

    String businessKey = businessKey(task.getProcessInstanceId());
    JsonNode entity = records.entity(published.content(), flow);
    Map<String, Object> business = records.get(entity, businessKey);
    String businessTitle = records.title(entity, business, businessKey);
    List<String> recipients = recipients(published.appId(), flow, sla, task, business, stage);
    if (recipients.isEmpty()) {
      return;
    }
    if (!claim(published.appId(), task, stage)) {
      return;
    }

    Map<String, Object> variables = runtimeService.getVariables(task.getProcessInstanceId());
    String taskName = text(task.getName(), task.getTaskDefinitionKey());
    String flowName = text(flow.path("name").asText(null), flow.path("key").asText());
    String link = "/apps/" + published.appId() + "/approvals/" + task.getId();
    String title = "warning".equals(stage) ? "SLA 预警：" + businessTitle
        : "SLA 升级：" + businessTitle;
    String body = "warning".equals(stage)
        ? "流程「" + flowName + "」的节点「" + taskName + "」将于 "
            + DUE_FORMAT.format(due.toInstant()) + " 到期，请及时处理。"
        : "流程「" + flowName + "」的节点「" + taskName + "」已超时，原到期时间为 "
            + DUE_FORMAT.format(due.toInstant()) + "，请尽快处理。";
    NotificationRuleService.Event event = new NotificationRuleService.Event(
        "warning".equals(stage) ? "slaWarning" : "slaEscalated",
        published, flow, entity, businessKey, businessTitle, business, variables,
        task.getProcessInstanceId(), task.getId(), taskName,
        recipients.get(0), "task", task.getId(), link, title, body);
    JsonNode notify = sla.path("notify");
    if (!notify.isObject()) {
      ObjectNode fallback = json.createObjectNode();
      fallback.putArray("channels").add("inApp");
      notify = fallback;
    }
    notificationRules.sendSpec(event, notify, recipients, "sla:" + stage);
  }

  private List<String> recipients(
      UUID appId,
      JsonNode flow,
      JsonNode sla,
      Task task,
      Map<String, Object> business,
      String stage) {
    if ("escalate".equals(stage)) {
      JsonNode spec = sla.path("escalateTo");
      if (!spec.isObject()) {
        return List.of();
      }
      return users.resolveAll(appId, spec.path("type").asText(null), spec, business);
    }
    if (task.getAssignee() != null && !task.getAssignee().isBlank()) {
      return List.of(task.getAssignee());
    }
    JsonNode spec = taskForm(flow, task.getTaskDefinitionKey()).path("assignee");
    String assignee = users.resolve(appId, spec.path("type").asText(null), spec, business);
    return assignee == null || assignee.isBlank() ? List.of() : List.of(assignee);
  }

  private boolean claim(UUID appId, Task task, String stage) {
    UUID id = UUID.randomUUID();
    List<UUID> inserted = jdbc.query("""
        insert into lcp_sla_reminder
          (id, tenant_id, app_id, process_instance_id, task_id, stage)
        values
          (:id, :tenant, :app, :instance, :task, :stage)
        on conflict (tenant_id, task_id, stage) do nothing
        returning id
        """, new MapSqlParameterSource("id", id)
        .addValue("tenant", TenantContext.tenantId())
        .addValue("app", appId)
        .addValue("instance", task.getProcessInstanceId())
        .addValue("task", task.getId())
        .addValue("stage", stage), (rs, rowNum) -> rs.getObject("id", UUID.class));
    return !inserted.isEmpty();
  }

  private Date processStart(String processInstanceId) {
    var instance = historyService.createHistoricProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(TenantContext.tenantId())
        .singleResult();
    return instance == null ? null : instance.getStartTime();
  }

  private String businessKey(String processInstanceId) {
    var instance = historyService.createHistoricProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .processInstanceTenantId(TenantContext.tenantId())
        .singleResult();
    return instance == null ? null : instance.getBusinessKey();
  }

  private JsonNode taskForm(JsonNode flow, String taskKey) {
    for (JsonNode form : flow.path("taskForms")) {
      if (taskKey != null && taskKey.equals(form.path("taskKey").asText())) {
        return form;
      }
    }
    return json.createObjectNode();
  }

  private <T> T inTenant(String tenant, Supplier<T> action) {
    return transactions.execute(status -> {
      plainJdbc.queryForObject("select set_config('search_path', 'public,flowable', true)",
          String.class);
      plainJdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)",
          String.class, tenant);
      TenantContext.set(tenant, "system");
      try {
        return action.get();
      } finally {
        TenantContext.clear();
      }
    });
  }

  private static Date addHours(Date start, BigDecimal hours) {
    if (start == null || hours == null || hours.signum() <= 0) {
      return null;
    }
    return new Date(start.getTime() + hoursMillis(hours));
  }

  private static long hoursMillis(BigDecimal hours) {
    return hours.multiply(BigDecimal.valueOf(3_600_000L)).longValue();
  }

  private static String text(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }
}
