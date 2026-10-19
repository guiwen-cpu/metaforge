package dev.lcp.bff.platform;

import dev.lcp.bff.platform.dto.AppRequests.CreateAppRequest;
import dev.lcp.bff.platform.dto.AppRequests.PublishRequest;
import dev.lcp.bff.platform.dto.AppRequests.RollbackRequest;
import dev.lcp.bff.platform.dto.AppRequests.RestoreDraftRequest;
import dev.lcp.bff.platform.dto.AppRequests.SaveDraftRequest;
import dev.lcp.bff.platform.dto.AppRequests.UpdateAppRequest;
import dev.lcp.bff.platform.dto.AppViews.AppView;
import dev.lcp.bff.platform.dto.AppViews.DraftView;
import dev.lcp.bff.platform.dto.AppViews.PageResult;
import dev.lcp.bff.platform.dto.AppViews.VersionDetail;
import dev.lcp.bff.platform.dto.AppViews.VersionDiffView;
import dev.lcp.bff.platform.dto.AppViews.VersionSummary;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台控制平面：应用、草稿、发布与回滚。
 *
 * <p>租户与操作人来自 TenantContext（网关注入的请求头），请求体不采信 tenant_id / created_by。
 * 事务与 RLS 会话变量由 TenantTransactionAspect 统一注入。
 */
@RestController
@RequestMapping("/api/v1/platform/apps")
public class AppController {

  private final AppService service;

  public AppController(AppService service) {
    this.service = service;
  }

  @GetMapping
  public PageResult<AppView> list(
      @RequestParam(name = "page", defaultValue = "1") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(name = "status", required = false) String status) {
    return service.list(page, size, q, status);
  }

  @PostMapping
  public ResponseEntity<AppView> create(@Valid @RequestBody CreateAppRequest body) {
    AppView created = service.create(body);
    return ResponseEntity
        .created(URI.create("/api/v1/platform/apps/" + created.id()))
        .body(created);
  }

  @GetMapping("/{appId}")
  public AppView get(@PathVariable("appId") UUID appId) {
    return service.get(appId);
  }

  @PatchMapping("/{appId}")
  public AppView patch(
      @PathVariable("appId") UUID appId, @Valid @RequestBody UpdateAppRequest body) {
    return service.patch(appId, body);
  }

  @DeleteMapping("/{appId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("appId") UUID appId) {
    service.delete(appId);
  }

  @GetMapping("/{appId}/draft")
  public DraftView getDraft(@PathVariable("appId") UUID appId) {
    return service.getDraft(appId);
  }

  @PutMapping("/{appId}/draft")
  public DraftView saveDraft(
      @PathVariable("appId") UUID appId, @RequestBody SaveDraftRequest body) {
    return service.saveDraft(appId, body);
  }

  /**
   * 发布。内容与当前版本一致时返回 200 + unchanged=true，不生成空版本；
   * 需要强制补发说明时传 force=true，此时返回 201。
   */
  @PostMapping("/{appId}/versions")
  public ResponseEntity<VersionDetail> publish(
      @PathVariable("appId") UUID appId, @Valid @RequestBody PublishRequest body) {
    VersionDetail detail = service.publish(appId, body);
    if (detail.unchanged()) {
      return ResponseEntity.ok(detail);
    }
    return ResponseEntity
        .created(URI.create("/api/v1/platform/apps/" + appId + "/versions/" + detail.versionNo()))
        .body(detail);
  }

  @GetMapping("/{appId}/versions")
  public PageResult<VersionSummary> listVersions(
      @PathVariable("appId") UUID appId,
      @RequestParam(name = "page", defaultValue = "1") int page,
      @RequestParam(name = "size", defaultValue = "20") int size) {
    return service.listVersions(appId, page, size);
  }

  @GetMapping("/{appId}/versions/{versionNo}")
  public VersionDetail getVersion(
      @PathVariable("appId") UUID appId, @PathVariable("versionNo") int versionNo) {
    return service.getVersion(appId, versionNo);
  }

  @GetMapping("/{appId}/versions/{fromVersionNo}/diff/{toVersionNo}")
  public VersionDiffView diff(
      @PathVariable("appId") UUID appId,
      @PathVariable("fromVersionNo") int fromVersionNo,
      @PathVariable("toVersionNo") int toVersionNo) {
    return service.diff(appId, fromVersionNo, toVersionNo);
  }

  @PostMapping("/{appId}/versions/{versionNo}/restore-draft")
  public DraftView restoreDraft(
      @PathVariable("appId") UUID appId,
      @PathVariable("versionNo") int versionNo,
      @RequestBody(required = false) RestoreDraftRequest body) {
    return service.restoreDraft(appId, versionNo,
        body == null ? new RestoreDraftRequest(null) : body);
  }

  @PostMapping("/{appId}/versions/{versionNo}/rollback")
  public ResponseEntity<VersionDetail> rollback(
      @PathVariable("appId") UUID appId,
      @PathVariable("versionNo") int versionNo,
      @Valid @RequestBody RollbackRequest body) {
    VersionDetail detail = service.rollback(appId, versionNo, body);
    return ResponseEntity
        .created(URI.create("/api/v1/platform/apps/" + appId + "/versions/" + detail.versionNo()))
        .body(detail);
  }
}