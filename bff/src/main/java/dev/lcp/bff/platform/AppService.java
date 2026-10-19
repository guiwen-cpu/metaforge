package dev.lcp.bff.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.lcp.bff.platform.dto.AppRequests.CreateAppRequest;
import dev.lcp.bff.platform.dto.AppRequests.PublishRequest;
import dev.lcp.bff.platform.dto.AppRequests.RestoreDraftRequest;
import dev.lcp.bff.platform.dto.AppRequests.RollbackRequest;
import dev.lcp.bff.platform.dto.AppRequests.SaveDraftRequest;
import dev.lcp.bff.platform.dto.AppRequests.UpdateAppRequest;
import dev.lcp.bff.platform.dto.AppViews.AppView;
import dev.lcp.bff.platform.dto.AppViews.ChecksumView;
import dev.lcp.bff.platform.dto.AppViews.DraftView;
import dev.lcp.bff.platform.dto.AppViews.PageResult;
import dev.lcp.bff.platform.dto.AppViews.VersionDetail;
import dev.lcp.bff.platform.dto.AppViews.VersionDiffView;
import dev.lcp.bff.platform.dto.AppViews.VersionSummary;
import dev.lcp.bff.runtime.FlowDeploymentService;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 控制平面应用服务。
 *
 * <p>三条语义：
 * <ul>
 *   <li>草稿可反复覆盖，带 revision 乐观锁；</li>
 *   <li>发布 append-only，版本号单调递增，snapshot 由平台盖章；</li>
 *   <li>回滚 = 把历史内容重新发布成新版本，历史版本永不被改写。</li>
 * </ul>
 *
 * <p>所有 SQL 都显式带 tenant_id；RLS 是最后一道兜底，不是唯一防线。
 */
@Service
public class AppService {

  private static final int MAX_PAGE_SIZE = 100;

  private static final String APP_COLUMNS =
      "id, app_key, name, description, icon, app_type, category, status, current_version, "
          + "draft_revision, draft_updated_at, draft_updated_by, semantic, created_by, updated_by, "
          + "created_at, updated_at";

  private static final String VERSION_SELECT = """
      select v.id, v.version_no, v.status, v.message, v.bundle, v.checksum, v.protocol_version,
             v.snapshot_id, v.based_on, v.rollback_of, v.created_by, v.created_at,
             b.version_no as based_on_version, r.version_no as rollback_of_version
        from lcp_app_version v
        left join lcp_app_version b on b.tenant_id = v.tenant_id and b.id = v.based_on
        left join lcp_app_version r on r.tenant_id = v.tenant_id and r.id = v.rollback_of
      """;

  private static final RowMapper<AppView> APP_MAPPER = (rs, rowNum) -> new AppView(
      rs.getObject("id", UUID.class).toString(),
      rs.getString("app_key"),
      rs.getString("name"),
      rs.getString("description"),
      rs.getString("icon"),
      rs.getString("app_type"),
      rs.getString("category"),
      rs.getString("status"),
      nullableInt(rs, "current_version"),
      rs.getLong("draft_revision"),
      rs.getObject("draft_updated_at", OffsetDateTime.class),
      rs.getString("draft_updated_by"),
      JsonCanonical.parse(rs.getString("semantic")),
      rs.getString("created_by"),
      rs.getString("updated_by"),
      rs.getObject("created_at", OffsetDateTime.class),
      rs.getObject("updated_at", OffsetDateTime.class));

  private static final RowMapper<DraftView> DRAFT_MAPPER = (rs, rowNum) -> {
    JsonNode bundle = JsonCanonical.parse(rs.getString("draft_bundle"));
    return new DraftView(
        rs.getObject("id", UUID.class).toString(),
        rs.getLong("draft_revision"),
        bundle == null ? com.fasterxml.jackson.databind.node.NullNode.instance : PublishSeal.inner(bundle),
        rs.getObject("draft_updated_at", OffsetDateTime.class),
        rs.getString("draft_updated_by"));
  };

  private static final RowMapper<VersionRow> VERSION_MAPPER = (rs, rowNum) -> new VersionRow(
      rs.getObject("id", UUID.class),
      rs.getInt("version_no"),
      rs.getString("status"),
      rs.getString("message"),
      rs.getString("bundle"),
      rs.getString("checksum"),
      rs.getString("protocol_version"),
      rs.getString("snapshot_id"),
      rs.getObject("based_on", UUID.class),
      nullableInt(rs, "based_on_version"),
      rs.getObject("rollback_of", UUID.class),
      nullableInt(rs, "rollback_of_version"),
      rs.getString("created_by"),
      rs.getObject("created_at", OffsetDateTime.class));

  private final NamedParameterJdbcTemplate jdbc;
  private final FlowDeploymentService flowDeployments;

  public AppService(NamedParameterJdbcTemplate jdbc, FlowDeploymentService flowDeployments) {
    this.jdbc = jdbc;
    this.flowDeployments = flowDeployments;
  }

  // ------------------------------------------------------------ 应用

  public PageResult<AppView> list(int page, int size, String q, String status) {
    int safePage = Math.max(1, page);
    int safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant());
    List<String> where = new ArrayList<>();
    where.add("tenant_id = :tenant");
    where.add("deleted_at is null");
    if (StringUtils.hasText(status)) {
      where.add("status = :status");
      params.addValue("status", status.trim());
    }
    if (StringUtils.hasText(q)) {
      where.add("(app_key ilike :q or name ilike :q or coalesce(description, '') ilike :q)");
      params.addValue("q", "%" + q.trim() + "%");
    }
    String whereSql = " where " + String.join(" and ", where);
    Long total = jdbc.queryForObject(
        "select count(*) from lcp_application" + whereSql, params, Long.class);
    params.addValue("limit", safeSize);
    params.addValue("offset", (long) (safePage - 1) * safeSize);
    List<AppView> items = jdbc.query(
        "select " + APP_COLUMNS + " from lcp_application" + whereSql
            + " order by updated_at desc, id limit :limit offset :offset",
        params, APP_MAPPER);
    return new PageResult<>(items, total == null ? 0 : total, safePage, safeSize);
  }

  public AppView get(UUID id) {
    return queryApp(id);
  }

  @Transactional
  public AppView create(CreateAppRequest req) {
    UUID id = UUID.randomUUID();
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("id", id)
        .addValue("tenant", tenant())
        .addValue("key", req.key().trim())
        .addValue("name", req.name().trim())
        .addValue("description", blankToNull(req.description()))
        .addValue("icon", blankToNull(req.icon()))
        .addValue("type", StringUtils.hasText(req.type()) ? req.type().trim() : "business")
        .addValue("category", blankToNull(req.category()))
        .addValue("semantic", JsonCanonical.write(req.semantic()), Types.VARCHAR)
        .addValue("user", user());
    try {
      jdbc.update("""
          insert into lcp_application
            (id, tenant_id, app_key, name, description, icon, app_type, category, semantic,
             created_by, updated_by)
          values
            (:id, :tenant, :key, :name, :description, :icon, :type, :category,
             cast(:semantic as jsonb), :user, :user)
          """, params);
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("app_key_exists", "应用 key 已存在：" + req.key().trim());
    }
    return queryApp(id);
  }

  @Transactional
  public AppView patch(UUID id, UpdateAppRequest req) {
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant())
        .addValue("id", id)
        .addValue("user", user());
    List<String> sets = new ArrayList<>();
    if (req.name() != null) {
      sets.add("name = :name");
      params.addValue("name", req.name().trim());
    }
    if (req.description() != null) {
      sets.add("description = :description");
      params.addValue("description", blankToNull(req.description()));
    }
    if (req.icon() != null) {
      sets.add("icon = :icon");
      params.addValue("icon", blankToNull(req.icon()));
    }
    if (req.type() != null) {
      sets.add("app_type = :type");
      params.addValue("type", req.type().trim());
    }
    if (req.category() != null) {
      sets.add("category = :category");
      params.addValue("category", blankToNull(req.category()));
    }
    if (req.semantic() != null) {
      sets.add("semantic = cast(:semantic as jsonb)");
      params.addValue("semantic", JsonCanonical.write(req.semantic()), Types.VARCHAR);
    }
    sets.add("updated_at = now()");
    sets.add("updated_by = :user");
    int updated = jdbc.update(
        "update lcp_application set " + String.join(", ", sets)
            + " where tenant_id = :tenant and id = :id and deleted_at is null",
        params);
    if (updated == 0) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
    return queryApp(id);
  }

  @Transactional
  public void delete(UUID id) {
    int updated = jdbc.update("""
        update lcp_application
           set deleted_at = now(), status = 'archived', updated_at = now(), updated_by = :user
         where tenant_id = :tenant and id = :id and deleted_at is null
        """, new MapSqlParameterSource("tenant", tenant()).addValue("id", id).addValue("user", user()));
    if (updated == 0) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
  }

  // ------------------------------------------------------------ 草稿

  public DraftView getDraft(UUID id) {
    List<DraftView> rows = jdbc.query(
        "select id, draft_revision, draft_bundle, draft_updated_at, draft_updated_by "
            + "from lcp_application where tenant_id = :tenant and id = :id and deleted_at is null",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", id), DRAFT_MAPPER);
    if (rows.isEmpty()) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
    return rows.get(0);
  }

  @Transactional
  public DraftView saveDraft(UUID id, SaveDraftRequest req) {
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant())
        .addValue("id", id)
        .addValue("user", user())
        .addValue("bundle", JsonCanonical.write(PublishSeal.envelope(PublishSeal.inner(req.bundle()))),
            Types.VARCHAR);
    String sql = "update lcp_application"
        + " set draft_bundle = cast(:bundle as jsonb), draft_revision = draft_revision + 1,"
        + " draft_updated_at = now(), draft_updated_by = :user,"
        + " updated_at = now(), updated_by = :user"
        + " where tenant_id = :tenant and id = :id and deleted_at is null";
    if (req.revision() != null) {
      sql += " and draft_revision = :revision";
      params.addValue("revision", req.revision());
    }
    int updated = jdbc.update(sql, params);
    if (updated == 0) {
      if (!exists(id)) {
        throw PlatformException.notFound("应用 " + id + " 不存在");
      }
      throw PlatformException.conflict("draft_conflict", "草稿已被其他人修改，请刷新后重试");
    }
    return getDraft(id);
  }

  // ------------------------------------------------------------ 发布 / 版本

  @Transactional
  public VersionDetail publish(UUID appId, PublishRequest req) {
    AppRow app = lockApp(appId);
    JsonNode payload = PublishSeal.inner(req.bundle() == null || req.bundle().isNull()
        ? draftPayload(appId)
        : req.bundle());
    if (payload == null || payload.isNull()) {
      throw PlatformException.badRequest("draft_empty", "草稿为空，请先保存草稿或直接提交 bundle");
    }
    payload = payload.deepCopy();
    JsonNode envelope = PublishSeal.envelope(payload);
    PublishSeal.validate(envelope, app.key());

    VersionRow head = app.currentVersion() == null ? null : findVersion(appId, app.currentVersion());
    String contentChecksum = PublishSeal.contentChecksum(envelope);
    if (head != null
        && !Boolean.TRUE.equals(req.force())
        && contentChecksum != null
        && contentChecksum.equals(head.contentChecksum())) {
      return head.detail(true);
    }

    int next = nextVersionNo(appId);
    JsonNode stamped = PublishSeal.stamp(
        envelope, next, req.message().trim(), user(), null, head == null ? null : head.snapshotId());
    return insertVersion(app, next, stamped, head, null, req.message().trim());
  }

  public PageResult<VersionSummary> listVersions(UUID appId, int page, int size) {
    requireApp(appId);
    int safePage = Math.max(1, page);
    int safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant()).addValue("app", appId);
    Long total = jdbc.queryForObject(
        "select count(*) from lcp_app_version where tenant_id = :tenant and app_id = :app",
        params, Long.class);
    params.addValue("limit", safeSize);
    params.addValue("offset", (long) (safePage - 1) * safeSize);
    List<VersionSummary> items = jdbc.query(
        VERSION_SELECT + " where v.tenant_id = :tenant and v.app_id = :app"
            + " order by v.version_no desc limit :limit offset :offset",
        params, VERSION_MAPPER).stream().map(VersionRow::summary).toList();
    return new PageResult<>(items, total == null ? 0 : total, safePage, safeSize);
  }

  public VersionDetail getVersion(UUID appId, int versionNo) {
    requireApp(appId);
    return findVersion(appId, versionNo).detail();
  }

  @Transactional
  public VersionDetail rollback(UUID appId, int versionNo, RollbackRequest req) {
    AppRow app = lockApp(appId);
    VersionRow source = findVersion(appId, versionNo);
    int next = nextVersionNo(appId);
    VersionRow head = app.currentVersion() == null ? null : findVersion(appId, app.currentVersion());
    JsonNode payload = JsonCanonical.parse(source.bundle());
    if (payload == null) {
      throw new IllegalStateException("版本 " + versionNo + " 缺少 bundle");
    }
    JsonNode stamped = PublishSeal.stamp(
        payload.deepCopy(), next, req.message().trim(), user(), source.snapshotId(),
        head == null ? null : head.snapshotId());
    return insertVersion(app, next, stamped, head, source, req.message().trim());
  }

  /** 版本内容对比：忽略 snapshot，只比较真正会进入运行时的元数据。 */
  public VersionDiffView diff(UUID appId, int fromVersionNo, int toVersionNo) {
    requireApp(appId);
    VersionRow from = findVersion(appId, fromVersionNo);
    VersionRow to = findVersion(appId, toVersionNo);
    return VersionDiff.compare(
        from.versionNo(), JsonCanonical.parse(from.bundle()), from.contentChecksum(),
        to.versionNo(), JsonCanonical.parse(to.bundle()), to.contentChecksum());
  }

  /** 把历史版本内容放回草稿：剥掉 snapshot，不产生新版本，编辑后可再发布。 */
  @Transactional
  public DraftView restoreDraft(UUID appId, int versionNo, RestoreDraftRequest req) {
    AppRow app = lockApp(appId);
    VersionRow source = findVersion(appId, versionNo);
    JsonNode content = PublishSeal.content(JsonCanonical.parse(source.bundle()));
    if (content == null || !content.isObject()) {
      throw PlatformException.badRequest("bundle_required", "版本 " + versionNo + " 缺少可恢复的内容");
    }
    ObjectNode draft = ((ObjectNode) content).deepCopy();
    if (draft.get("app") instanceof ObjectNode appMeta) {
      appMeta.put("key", app.key());
    }
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant())
        .addValue("id", appId)
        .addValue("user", user())
        .addValue("bundle", JsonCanonical.write(PublishSeal.envelope(draft)), Types.VARCHAR);
    String sql = "update lcp_application"
        + " set draft_bundle = cast(:bundle as jsonb), draft_revision = draft_revision + 1,"
        + " draft_updated_at = now(), draft_updated_by = :user,"
        + " updated_at = now(), updated_by = :user"
        + " where tenant_id = :tenant and id = :id and deleted_at is null";
    if (req.revision() != null) {
      sql += " and draft_revision = :revision";
      params.addValue("revision", req.revision());
    }
    int updated = jdbc.update(sql, params);
    if (updated == 0) {
      if (!exists(appId)) {
        throw PlatformException.notFound("应用 " + appId + " 不存在");
      }
      throw PlatformException.conflict("draft_conflict", "草稿已被其他人修改，请刷新后重试");
    }
    return getDraft(appId);
  }

  // ------------------------------------------------------------ 内部

  private VersionDetail insertVersion(
      AppRow app, int versionNo, JsonNode stamped, VersionRow basedOn, VersionRow rollbackSource,
      String message) {
    String checksum = JsonCanonical.sha256(stamped);
    String snapshotId = PublishSeal.snapshotId(stamped);
    String protocolVersion = PublishSeal.text(stamped.path("bundle"), "protocolVersion");
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("id", UUID.randomUUID())
        .addValue("tenant", tenant())
        .addValue("app", app.id())
        .addValue("version", versionNo)
        .addValue("message", message)
        .addValue("bundle", JsonCanonical.write(stamped))
        .addValue("checksum", checksum)
        .addValue("protocol", protocolVersion)
        .addValue("snapshot", snapshotId)
        .addValue("user", user());
    addUuid(params, "basedOn", basedOn == null ? null : basedOn.id());
    addUuid(params, "rollbackOf", rollbackSource == null ? null : rollbackSource.id());
    jdbc.update("""
        insert into lcp_app_version
          (id, tenant_id, app_id, version_no, status, message, bundle, checksum, protocol_version,
           snapshot_id, based_on, rollback_of, created_by)
        values
          (:id, :tenant, :app, :version, 'published', :message, cast(:bundle as jsonb), :checksum,
           :protocol, :snapshot, :basedOn, :rollbackOf, :user)
        """, params);
    markPublished(app, versionNo, stamped);
    flowDeployments.deployVersion(app.id(), app.key(), versionNo, PublishSeal.inner(stamped));
    return findVersion(app.id(), versionNo).detail();
  }

  /** 发布即把 bundle.app 的展示信息同步回应用索引，避免列表页与发布件长期漂移。 */
  private void markPublished(AppRow app, int versionNo, JsonNode stamped) {
    JsonNode appMeta = stamped.path("bundle").get("app");
    MapSqlParameterSource params = new MapSqlParameterSource("tenant", tenant())
        .addValue("id", app.id())
        .addValue("version", versionNo)
        .addValue("user", user())
        .addValue("name", PublishSeal.text(appMeta, "name"))
        .addValue("description", PublishSeal.text(appMeta, "description"))
        .addValue("icon", PublishSeal.text(appMeta, "icon"))
        .addValue("type", PublishSeal.text(appMeta, "type"))
        .addValue("category", PublishSeal.text(appMeta, "category"))
        .addValue("semantic", appMeta == null ? null : JsonCanonical.write(appMeta.get("semantic")),
            Types.VARCHAR);
    jdbc.update("""
        update lcp_application
           set name = coalesce(:name, name),
               description = coalesce(:description, description),
               icon = coalesce(:icon, icon),
               app_type = coalesce(:type, app_type),
               category = coalesce(:category, category),
               semantic = coalesce(cast(:semantic as jsonb), semantic),
               current_version = :version,
               status = 'published',
               updated_at = now(),
               updated_by = :user
         where tenant_id = :tenant and id = :id
        """, params);
  }

  private AppRow lockApp(UUID id) {
    List<AppRow> rows = jdbc.query(
        "select id, app_key, current_version from lcp_application"
            + " where tenant_id = :tenant and id = :id and deleted_at is null for update",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", id),
        (rs, rowNum) -> new AppRow(
            rs.getObject("id", UUID.class),
            rs.getString("app_key"),
            nullableInt(rs, "current_version")));
    if (rows.isEmpty()) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
    return rows.get(0);
  }

  private AppView queryApp(UUID id) {
    List<AppView> rows = jdbc.query(
        "select " + APP_COLUMNS + " from lcp_application"
            + " where tenant_id = :tenant and id = :id and deleted_at is null",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", id), APP_MAPPER);
    if (rows.isEmpty()) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
    return rows.get(0);
  }

  private void requireApp(UUID id) {
    if (!exists(id)) {
      throw PlatformException.notFound("应用 " + id + " 不存在");
    }
  }

  private boolean exists(UUID id) {
    Integer count = jdbc.queryForObject(
        "select count(*) from lcp_application"
            + " where tenant_id = :tenant and id = :id and deleted_at is null",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", id), Integer.class);
    return count != null && count > 0;
  }

  private JsonNode draftPayload(UUID appId) {
    List<String> rows = jdbc.query(
        "select draft_bundle from lcp_application"
            + " where tenant_id = :tenant and id = :id and deleted_at is null",
        new MapSqlParameterSource("tenant", tenant()).addValue("id", appId),
        (rs, rowNum) -> rs.getString("draft_bundle"));
    if (rows.isEmpty()) {
      throw PlatformException.notFound("应用 " + appId + " 不存在");
    }
    return JsonCanonical.parse(rows.get(0));
  }

  private VersionRow findVersion(UUID appId, int versionNo) {
    List<VersionRow> rows = jdbc.query(
        VERSION_SELECT + " where v.tenant_id = :tenant and v.app_id = :app and v.version_no = :version",
        new MapSqlParameterSource("tenant", tenant()).addValue("app", appId)
            .addValue("version", versionNo),
        VERSION_MAPPER);
    if (rows.isEmpty()) {
      throw PlatformException.notFound("应用 " + appId + " 的版本 " + versionNo + " 不存在");
    }
    return rows.get(0);
  }

  private int nextVersionNo(UUID appId) {
    Integer max = jdbc.queryForObject(
        "select coalesce(max(version_no), 0) from lcp_app_version"
            + " where tenant_id = :tenant and app_id = :app",
        new MapSqlParameterSource("tenant", tenant()).addValue("app", appId), Integer.class);
    return (max == null ? 0 : max) + 1;
  }

  private static void addUuid(MapSqlParameterSource params, String name, UUID value) {
    if (value == null) {
      params.addValue(name, null, Types.OTHER);
    } else {
      params.addValue(name, value);
    }
  }

  private static Integer nullableInt(ResultSet rs, String column) throws SQLException {
    int value = rs.getInt(column);
    return rs.wasNull() ? null : value;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
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

  private record AppRow(UUID id, String key, Integer currentVersion) {
  }

  private record VersionRow(
      UUID id,
      int versionNo,
      String status,
      String message,
      String bundle,
      String checksum,
      String protocolVersion,
      String snapshotId,
      UUID basedOn,
      Integer basedOnVersion,
      UUID rollbackOf,
      Integer rollbackOfVersion,
      String createdBy,
      OffsetDateTime createdAt) {

    VersionSummary summary() {
      return new VersionSummary(
          id.toString(), versionNo, status, message, new ChecksumView("sha256", checksum),
          protocolVersion, snapshotId, rollbackOfVersion, basedOnVersion, createdBy, createdAt);
    }

    String contentChecksum() {
      return PublishSeal.contentChecksum(JsonCanonical.parse(bundle));
    }

    VersionDetail detail() {
      return detail(false);
    }

    VersionDetail detail(boolean unchanged) {
      return new VersionDetail(
          id.toString(), versionNo, status, message, new ChecksumView("sha256", checksum),
          contentChecksum(), protocolVersion, snapshotId, rollbackOfVersion, basedOnVersion,
          createdBy, createdAt, PublishSeal.inner(JsonCanonical.parse(bundle)), unchanged);
    }
  }
}
