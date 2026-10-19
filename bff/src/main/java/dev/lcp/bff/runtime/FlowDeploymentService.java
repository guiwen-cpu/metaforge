package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.tenant.TenantContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.ProcessDefinition;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** 把发布件里的 BPMN 资产部署到 Flowable，并按版本记录部署结果。 */
@Service
public class FlowDeploymentService {

  private final NamedParameterJdbcTemplate jdbc;
  private final RepositoryService repositoryService;
  private final PublishedBundleService bundles;

  public FlowDeploymentService(
      NamedParameterJdbcTemplate jdbc,
      RepositoryService repositoryService,
      PublishedBundleService bundles) {
    this.jdbc = jdbc;
    this.repositoryService = repositoryService;
    this.bundles = bundles;
  }

  /** 发布钩子：遍历 logicSchemas.flows，把引用的 BPMN 资产部署为租户级流程定义。 */
  public void deployVersion(UUID appId, String appKey, int versionNo, JsonNode bundle) {
    for (JsonNode flow : bundles.flows(bundle)) {
      if (!"flowable".equals(flow.path("engine").asText("flowable"))) {
        continue;
      }
      if (!flow.path("deployment").path("autoDeploy").asBoolean(true)) {
        continue;
      }
      String flowKey = flow.path("key").asText();
      String processKey = flow.path("processKey").asText(flowKey);
      JsonNode ref = flow.path("bpmnRef");
      JsonNode asset = bundles.asset(bundle, ref.path("key").asText(null));
      String xml = xml(asset);
      if (xml == null || xml.isBlank()) {
        throw PlatformException.badRequest("bpmn_missing",
            "流程 " + flowKey + " 引用的 BPMN 资产缺失或为空");
      }
      xml = sanitize(xml);
      String checksum = sha256(xml);
      Map<String, Object> existing = first(jdbc.queryForList(
          "select checksum, process_definition_id from lcp_flow_deployment"
              + " where tenant_id = :tenant and app_id = :app and version_no = :version"
              + " and flow_key = :flow",
          new MapSqlParameterSource("tenant", tenant()).addValue("app", appId)
              .addValue("version", versionNo).addValue("flow", flowKey)));
      if (existing != null && checksum.equals(existing.get("checksum"))
          && existing.get("process_definition_id") != null) {
        continue;
      }
      String fileName = ref.path("fileName").asText(processKey + ".bpmn20.xml");
      Deployment deployment = repositoryService.createDeployment()
          .name(appKey + " v" + versionNo + " " + flowKey)
          .category("metaforge")
          .tenantId(tenant())
          .addString(fileName, xml)
          .deploy();
      ProcessDefinition definition = repositoryService.createProcessDefinitionQuery()
          .deploymentId(deployment.getId())
          .processDefinitionKey(processKey)
          .singleResult();
      if (definition == null) {
        throw PlatformException.badRequest("bpmn_invalid",
            "BPMN 未包含 processKey=" + processKey + " 的流程");
      }
      jdbc.update("""
          insert into lcp_flow_deployment
            (id, tenant_id, app_id, version_no, flow_key, process_key, deployment_id,
             process_definition_id, checksum)
          values
            (:id, :tenant, :app, :version, :flow, :process, :deployment, :definition, :checksum)
          on conflict (tenant_id, app_id, version_no, flow_key) do update set
            process_key = excluded.process_key,
            deployment_id = excluded.deployment_id,
            process_definition_id = excluded.process_definition_id,
            checksum = excluded.checksum,
            deployed_at = now()
          """, new MapSqlParameterSource()
          .addValue("id", UUID.randomUUID())
          .addValue("tenant", tenant())
          .addValue("app", appId)
          .addValue("version", versionNo)
          .addValue("flow", flowKey)
          .addValue("process", processKey)
          .addValue("deployment", deployment.getId())
          .addValue("definition", definition.getId())
          .addValue("checksum", checksum));
    }
  }

  /** 启动前兜底：历史发布件可能早于运行时上线，按当前版本补部署一次。 */
  public List<DeployedFlow> ensureDeployed(UUID appId) {
    PublishedBundle published = bundles.load(appId);
    List<DeployedFlow> rows = deployed(appId, published.versionNo());
    if (rows.isEmpty()) {
      deployVersion(appId, published.appKey(), published.versionNo(), published.content());
      rows = deployed(appId, published.versionNo());
    }
    return rows;
  }

  public List<DeployedFlow> deployed(UUID appId, int versionNo) {
    List<DeployedFlow> out = new ArrayList<>();
    for (Map<String, Object> row : jdbc.queryForList(
        "select flow_key, process_key, deployment_id, process_definition_id"
            + " from lcp_flow_deployment"
            + " where tenant_id = :tenant and app_id = :app and version_no = :version",
        new MapSqlParameterSource("tenant", tenant()).addValue("app", appId)
            .addValue("version", versionNo))) {
      out.add(new DeployedFlow(
          String.valueOf(row.get("flow_key")),
          String.valueOf(row.get("process_key")),
          String.valueOf(row.get("deployment_id")),
          String.valueOf(row.get("process_definition_id"))));
    }
    return out;
  }

  /** 按流程定义 ID 反查发布映射；运行时据此把任务挂回 Bundle 里的 Flow 元数据。 */
  public DeployedFlow byProcessDefinitionId(String processDefinitionId) {
    List<Map<String, Object>> rows = jdbc.queryForList(
        "select flow_key, process_key, deployment_id, process_definition_id"
            + " from lcp_flow_deployment"
            + " where tenant_id = :tenant and process_definition_id = :definition",
        new MapSqlParameterSource("tenant", tenant()).addValue("definition", processDefinitionId));
    if (rows.isEmpty()) {
      return null;
    }
    Map<String, Object> row = rows.get(0);
    return new DeployedFlow(
        String.valueOf(row.get("flow_key")),
        String.valueOf(row.get("process_key")),
        String.valueOf(row.get("deployment_id")),
        String.valueOf(row.get("process_definition_id")));
  }

  public DeployedFlow find(List<DeployedFlow> flows, String flowKey) {
    if (flows.isEmpty()) {
      throw PlatformException.badRequest("flow_not_deployed", "当前版本没有已部署的 Flowable 流程");
    }
    if (flowKey == null || flowKey.isBlank()) {
      return flows.get(0);
    }
    return flows.stream().filter(flow -> flowKey.equals(flow.flowKey())).findFirst()
        .orElseThrow(() -> PlatformException.notFound("流程 " + flowKey + " 未部署"));
  }

  private static Map<String, Object> first(List<Map<String, Object>> rows) {
    return rows.isEmpty() ? null : rows.get(0);
  }

  /** 兼容 assets[].inline.content 与早期 assets[].content 两种写法。 */
  private static String xml(JsonNode asset) {
    if (asset == null) {
      return null;
    }
    JsonNode inline = asset.path("inline").path("content");
    return inline.isTextual() ? inline.asText() : asset.path("content").asText(null);
  }

  /**
   * 平台监听器统一按 delegateExpression 解析。
   * 发布件里 processEnd 用了 expression="${lcpProcessEndListener}"，Flowable 会把它当值表达式求值，
   * 这里在部署前归一化，避免部署成功但实例启动时才失败。
   */
  private static String sanitize(String xml) {
    return xml.replace("expression=\"${lcpProcessEndListener}\"",
        "delegateExpression=\"${lcpProcessEndListener}\"");
  }

  private static String sha256(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder out = new StringBuilder(digest.length * 2);
      for (byte b : digest) {
        out.append(String.format("%02x", b));
      }
      return out.toString();
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文：请求未经 TenantFilter");
    }
    return tenant;
  }

  public record DeployedFlow(
      String flowKey, String processKey, String deploymentId, String processDefinitionId) {
  }
}
