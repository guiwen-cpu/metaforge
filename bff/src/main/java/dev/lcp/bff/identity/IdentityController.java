package dev.lcp.bff.identity;

import dev.lcp.bff.identity.IdentityRequests.DepartmentRequest;
import dev.lcp.bff.identity.IdentityRequests.PositionRequest;
import dev.lcp.bff.identity.IdentityRequests.UserRequest;
import dev.lcp.bff.identity.IdentityRequests.UserRolesRequest;
import dev.lcp.bff.identity.IdentityViews.DepartmentView;
import dev.lcp.bff.identity.IdentityViews.OverviewView;
import dev.lcp.bff.identity.IdentityViews.PositionView;
import dev.lcp.bff.identity.IdentityViews.UserView;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 租户组织、用户与角色分配。仅租户管理员可写。 */
@RestController
@RequestMapping("/api/v1/platform/identity")
public class IdentityController {

  private final IdentityService identity;

  public IdentityController(IdentityService identity) {
    this.identity = identity;
  }

  @GetMapping("/overview")
  public OverviewView overview(
      @RequestParam(name = "appId", required = false) UUID appId) {
    identity.requireAdmin();
    return identity.overview(appId);
  }

  @PostMapping("/departments")
  public DepartmentView createDepartment(@RequestBody DepartmentRequest request) {
    return identity.createDepartment(request);
  }

  @PutMapping("/departments/{id}")
  public DepartmentView updateDepartment(
      @PathVariable("id") String id, @RequestBody DepartmentRequest request) {
    return identity.updateDepartment(id, request);
  }

  @DeleteMapping("/departments/{id}")
  public ResponseEntity<Void> deleteDepartment(@PathVariable("id") String id) {
    identity.deleteDepartment(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/positions")
  public PositionView createPosition(@RequestBody PositionRequest request) {
    return identity.createPosition(request);
  }

  @PutMapping("/positions/{id}")
  public PositionView updatePosition(
      @PathVariable("id") String id, @RequestBody PositionRequest request) {
    return identity.updatePosition(id, request);
  }

  @DeleteMapping("/positions/{id}")
  public ResponseEntity<Void> deletePosition(@PathVariable("id") String id) {
    identity.deletePosition(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/users")
  public UserView createUser(@RequestBody UserRequest request) {
    return identity.createUser(request);
  }

  @PutMapping("/users/{id}")
  public UserView updateUser(
      @PathVariable("id") String id, @RequestBody UserRequest request) {
    return identity.updateUser(id, request);
  }

  @DeleteMapping("/users/{id}")
  public ResponseEntity<Void> deleteUser(@PathVariable("id") String id) {
    identity.deleteUser(id);
    return ResponseEntity.noContent().build();
  }

  @PutMapping("/users/{id}/roles")
  public UserView setUserRoles(
      @PathVariable("id") String id, @RequestBody UserRolesRequest request) {
    identity.requireAdmin();
    return identity.setUserRoles(id, request.appId(), request.roleKeys());
  }
}