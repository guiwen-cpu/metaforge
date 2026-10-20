package dev.lcp.bff.connector;

import dev.lcp.bff.connector.ConnectorDtos.ConnectionView;
import dev.lcp.bff.connector.ConnectorDtos.CreateConnectionRequest;
import dev.lcp.bff.connector.ConnectorDtos.UpdateConnectionRequest;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 租户连接器：所有登录用户可读，写操作要求租户管理员。 */
@RestController
@RequestMapping("/api/v1/platform/connections")
public class ConnectionController {

  private final ConnectionService service;

  public ConnectionController(ConnectionService service) {
    this.service = service;
  }

  @GetMapping
  public List<ConnectionView> list() {
    return service.list();
  }

  @PostMapping
  public ResponseEntity<ConnectionView> create(@RequestBody CreateConnectionRequest body) {
    ConnectionView created = service.create(body);
    return ResponseEntity
        .created(URI.create("/api/v1/platform/connections/" + created.id()))
        .body(created);
  }

  @GetMapping("/{id}")
  public ConnectionView get(@PathVariable("id") UUID id) {
    return service.get(id);
  }

  @PatchMapping("/{id}")
  public ConnectionView patch(
      @PathVariable("id") UUID id, @RequestBody UpdateConnectionRequest body) {
    return service.patch(id, body);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") UUID id) {
    service.delete(id);
  }
}
