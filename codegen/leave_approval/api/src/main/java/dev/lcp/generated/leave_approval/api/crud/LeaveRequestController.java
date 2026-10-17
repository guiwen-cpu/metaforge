package dev.lcp.generated.leave_approval.api.crud;

import dev.lcp.generated.leave_approval.api.dto.LeaveRequestCreateRequest;
import dev.lcp.generated.leave_approval.api.dto.LeaveRequestQuery;
import dev.lcp.generated.leave_approval.api.dto.LeaveRequestUpdateRequest;
import dev.lcp.generated.leave_approval.api.support.LcpCrudRuntime;
import dev.lcp.generated.leave_approval.api.support.LcpFieldPolicy;
import dev.lcp.generated.leave_approval.api.support.LcpPageResult;
import dev.lcp.generated.leave_approval.api.support.LcpPrincipal;
import dev.lcp.generated.leave_approval.api.table.LeaveApprovalTables;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
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
 * leave_request 的 CRUD 路由。HTTP 绑定在这里，SQL 与业务语义全在 LcpCrudRuntime。
 * 租户与操作人来自 LcpPrincipal，请求体里带了也不采信。
 */
@RestController
@RequestMapping("/api/v1/leave_approval/leave_request")
public class LeaveRequestController {

  private final LcpCrudRuntime runtime;

  public LeaveRequestController(NamedParameterJdbcTemplate jdbc, LcpPrincipal principal) {
    this.runtime = new LcpCrudRuntime(jdbc, principal,
        LcpFieldPolicy.denySensitive(LeaveApprovalTables.LEAVE_REQUEST.sensitiveColumns()));
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
      @RequestParam(name = "applicant_id", required = false) String applicantId,
      @RequestParam(name = "leave_type", required = false) String leaveType,
      @RequestParam(name = "start_at_from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startAtFrom,
      @RequestParam(name = "start_at_to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startAtTo,
      @RequestParam(name = "end_at_from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endAtFrom,
      @RequestParam(name = "end_at_to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endAtTo,
      @RequestParam(name = "days_from", required = false) BigDecimal daysFrom,
      @RequestParam(name = "days_to", required = false) BigDecimal daysTo,
      @RequestParam(name = "status", required = false) String status,
      @RequestParam(name = "approved_at_from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime approvedAtFrom,
      @RequestParam(name = "approved_at_to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime approvedAtTo
  ) {
    LeaveRequestQuery query = new LeaveRequestQuery(page, size, sort, order, q, includeDeleted, applicantId, leaveType, startAtFrom, startAtTo, endAtFrom, endAtTo, daysFrom, daysTo, status, approvedAtFrom, approvedAtTo);
    return runtime.page(LeaveApprovalTables.LEAVE_REQUEST, query.toPageQuery(), query.toFilters());
  }

  /** 按主键取一行；不存在返回 404。 */
  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable("id") String id) {
    return runtime.get(LeaveApprovalTables.LEAVE_REQUEST, id);
  }

  /** 创建。主键由平台生成，返回 201 + Location。 */
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody LeaveRequestCreateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("applicant_id", body.applicantId());
    values.put("applicant_name", body.applicantName());
    values.put("dept_id", body.deptId());
    values.put("leave_type", body.leaveType());
    values.put("start_at", body.startAt());
    values.put("end_at", body.endAt());
    values.put("days", body.days());
    values.put("reason", body.reason());
    values.put("urgency", body.urgency());
    values.put("images", body.images());
    values.put("video_proof", body.videoProof());
    values.put("documents", body.documents());
    values.put("status", body.status());
    values.put("process_instance_id", body.processInstanceId());
    values.put("current_task", body.currentTask());
    values.put("approver_id", body.approverId());
    values.put("approved_at", body.approvedAt());
    Map<String, Object> created = runtime.create(LeaveApprovalTables.LEAVE_REQUEST, values);
    String id = String.valueOf(created.get("id"));
    return ResponseEntity.created(URI.create(LeaveApprovalTables.LEAVE_REQUEST.path() + "/" + id)).body(created);
  }

  /** 更新（列整体替换 + JSONB 浅合并）。immutable 字段被忽略，sensitive 字段缺省保持。 */
  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") String id, @Valid @RequestBody LeaveRequestUpdateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("applicant_name", body.applicantName());
    values.put("dept_id", body.deptId());
    values.put("leave_type", body.leaveType());
    values.put("start_at", body.startAt());
    values.put("end_at", body.endAt());
    values.put("days", body.days());
    values.put("reason", body.reason());
    values.put("urgency", body.urgency());
    values.put("images", body.images());
    values.put("video_proof", body.videoProof());
    values.put("documents", body.documents());
    values.put("status", body.status());
    values.put("current_task", body.currentTask());
    values.put("approver_id", body.approverId());
    values.put("approved_at", body.approvedAt());
    return runtime.update(LeaveApprovalTables.LEAVE_REQUEST, id, values, body.version());
  }

  /** 删除。开启软删除时是置 deleted_at，否则物理删除。 */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") String id) {
    runtime.delete(LeaveApprovalTables.LEAVE_REQUEST, id);
  }
}
