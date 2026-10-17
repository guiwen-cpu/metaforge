package dev.lcp.generated.leave_approval.api.crud;

import dev.lcp.generated.leave_approval.api.dto.AttachmentCreateRequest;
import dev.lcp.generated.leave_approval.api.dto.AttachmentQuery;
import dev.lcp.generated.leave_approval.api.dto.AttachmentUpdateRequest;
import dev.lcp.generated.leave_approval.api.support.LcpCrudRuntime;
import dev.lcp.generated.leave_approval.api.support.LcpFieldPolicy;
import dev.lcp.generated.leave_approval.api.support.LcpPageResult;
import dev.lcp.generated.leave_approval.api.support.LcpPrincipal;
import dev.lcp.generated.leave_approval.api.table.LeaveApprovalTables;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * attachment 的 CRUD 路由。HTTP 绑定在这里，SQL 与业务语义全在 LcpCrudRuntime。
 * 租户与操作人来自 LcpPrincipal，请求体里带了也不采信。
 */
@RestController
@RequestMapping("/api/v1/leave_approval/attachment")
public class AttachmentController {

  private final LcpCrudRuntime runtime;

  public AttachmentController(NamedParameterJdbcTemplate jdbc, LcpPrincipal principal) {
    this.runtime = new LcpCrudRuntime(jdbc, principal,
        LcpFieldPolicy.denySensitive(LeaveApprovalTables.ATTACHMENT.sensitiveColumns()));
  }

  /** 分页查询。q 走 searchable 列，其余筛选条件见 Query 记录。 */
  @GetMapping
  public LcpPageResult<Map<String, Object>> page(
      @RequestParam(name = "page", defaultValue = "1") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "sort", required = false) String sort,
      @RequestParam(name = "order", defaultValue = "desc") String order,
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(name = "include_deleted", defaultValue = "false") boolean includeDeleted,
      @RequestParam(name = "size_from", required = false) Integer sizeFrom,
      @RequestParam(name = "size_to", required = false) Integer sizeTo,
      @RequestParam(name = "kind", required = false) String kind
  ) {
    AttachmentQuery query = new AttachmentQuery(page, size, sort, order, q, includeDeleted, sizeFrom, sizeTo, kind);
    return runtime.page(LeaveApprovalTables.ATTACHMENT, query.toPageQuery(), query.toFilters());
  }

  /** 按主键取一行；不存在返回 404。 */
  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable("id") String id) {
    return runtime.get(LeaveApprovalTables.ATTACHMENT, id);
  }

  /** 创建。主键由平台生成，返回 201 + Location。 */
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody AttachmentCreateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("biz_type", body.bizType());
    values.put("biz_id", body.bizId());
    values.put("file_name", body.fileName());
    values.put("object_key", body.objectKey());
    values.put("mime", body.mime());
    values.put("size", body.size());
    values.put("kind", body.kind());
    values.put("checksum", body.checksum());
    Map<String, Object> created = runtime.create(LeaveApprovalTables.ATTACHMENT, values);
    String id = String.valueOf(created.get("id"));
    return ResponseEntity.created(URI.create(LeaveApprovalTables.ATTACHMENT.path() + "/" + id)).body(created);
  }

  /** 更新（整体替换）。immutable 字段被忽略。 */
  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") String id, @Valid @RequestBody AttachmentUpdateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("biz_type", body.bizType());
    values.put("biz_id", body.bizId());
    values.put("file_name", body.fileName());
    values.put("mime", body.mime());
    values.put("size", body.size());
    values.put("kind", body.kind());
    values.put("checksum", body.checksum());
    return runtime.update(LeaveApprovalTables.ATTACHMENT, id, values, null);
  }

  /** 删除。开启软删除时是置 deleted_at，否则物理删除。 */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") String id) {
    runtime.delete(LeaveApprovalTables.ATTACHMENT, id);
  }
}
