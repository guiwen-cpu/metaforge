package dev.lcp.generated.leave_approval.api.crud;

import dev.lcp.generated.leave_approval.api.dto.EmployeeCreateRequest;
import dev.lcp.generated.leave_approval.api.dto.EmployeeQuery;
import dev.lcp.generated.leave_approval.api.dto.EmployeeUpdateRequest;
import dev.lcp.generated.leave_approval.api.support.LcpCrudRuntime;
import dev.lcp.generated.leave_approval.api.support.LcpFieldPolicy;
import dev.lcp.generated.leave_approval.api.support.LcpPageResult;
import dev.lcp.generated.leave_approval.api.support.LcpPrincipal;
import dev.lcp.generated.leave_approval.api.table.LeaveApprovalTables;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.LocalDate;
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
 * employee 的 CRUD 路由。HTTP 绑定在这里，SQL 与业务语义全在 LcpCrudRuntime。
 * 租户与操作人来自 LcpPrincipal，请求体里带了也不采信。
 */
@RestController
@RequestMapping("/api/v1/leave_approval/employee")
public class EmployeeController {

  private final LcpCrudRuntime runtime;

  public EmployeeController(NamedParameterJdbcTemplate jdbc, LcpPrincipal principal) {
    this.runtime = new LcpCrudRuntime(jdbc, principal,
        LcpFieldPolicy.denySensitive(LeaveApprovalTables.EMPLOYEE.sensitiveColumns()));
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
      @RequestParam(name = "position", required = false) String position,
      @RequestParam(name = "hire_date_from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hireDateFrom,
      @RequestParam(name = "hire_date_to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hireDateTo
  ) {
    EmployeeQuery query = new EmployeeQuery(page, size, sort, order, q, includeDeleted, position, hireDateFrom, hireDateTo);
    return runtime.page(LeaveApprovalTables.EMPLOYEE, query.toPageQuery(), query.toFilters());
  }

  /** 按主键取一行；不存在返回 404。 */
  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable("id") String id) {
    return runtime.get(LeaveApprovalTables.EMPLOYEE, id);
  }

  /** 创建。主键由平台生成，返回 201 + Location。 */
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody EmployeeCreateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("employee_no", body.employeeNo());
    values.put("name", body.name());
    values.put("dept_id", body.deptId());
    values.put("dept_name", body.deptName());
    values.put("phone", body.phone());
    values.put("id_card", body.idCard());
    values.put("position", body.position());
    values.put("hire_date", body.hireDate());
    Map<String, Object> created = runtime.create(LeaveApprovalTables.EMPLOYEE, values);
    String id = String.valueOf(created.get("id"));
    return ResponseEntity.created(URI.create(LeaveApprovalTables.EMPLOYEE.path() + "/" + id)).body(created);
  }

  /** 更新（整体替换）。immutable 字段被忽略。 */
  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") String id, @Valid @RequestBody EmployeeUpdateRequest body) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("name", body.name());
    values.put("dept_id", body.deptId());
    values.put("dept_name", body.deptName());
    values.put("phone", body.phone());
    values.put("id_card", body.idCard());
    values.put("position", body.position());
    values.put("hire_date", body.hireDate());
    return runtime.update(LeaveApprovalTables.EMPLOYEE, id, values, null);
  }

  /** 删除。开启软删除时是置 deleted_at，否则物理删除。 */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") String id) {
    runtime.delete(LeaveApprovalTables.EMPLOYEE, id);
  }
}
