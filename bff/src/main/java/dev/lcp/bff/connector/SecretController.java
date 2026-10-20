package dev.lcp.bff.connector;

import dev.lcp.bff.connector.ConnectorDtos.CreateSecretRequest;
import dev.lcp.bff.connector.ConnectorDtos.SecretView;
import dev.lcp.bff.connector.ConnectorDtos.UpdateSecretRequest;
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

/** 租户密钥库。所有接口仅管理员可访问，响应永不含明文或密文。 */
@RestController
@RequestMapping("/api/v1/platform/secrets")
public class SecretController {

  private final SecretService service;

  public SecretController(SecretService service) {
    this.service = service;
  }

  @GetMapping
  public List<SecretView> list() {
    return service.list();
  }

  @PostMapping
  public ResponseEntity<SecretView> create(@RequestBody CreateSecretRequest body) {
    SecretView created = service.create(body);
    return ResponseEntity
        .created(URI.create("/api/v1/platform/secrets/" + created.id()))
        .body(created);
  }

  @PatchMapping("/{id}")
  public SecretView patch(
      @PathVariable("id") UUID id, @RequestBody UpdateSecretRequest body) {
    return service.patch(id, body);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") UUID id) {
    service.delete(id);
  }
}
