package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;

/** 连接器与密钥库请求/响应。响应绝不包含明文或密文字节。 */
public final class ConnectorDtos {

  private ConnectorDtos() {
  }

  public record CreateConnectionRequest(
      String key,
      String name,
      String kind,
      String baseUrl,
      JsonNode config,
      Boolean enabled) {
  }

  public record UpdateConnectionRequest(
      String name,
      String baseUrl,
      JsonNode config,
      Boolean enabled) {
  }

  public record ConnectionView(
      String id,
      String key,
      String name,
      String kind,
      String baseUrl,
      JsonNode config,
      boolean enabled,
      String createdBy,
      String updatedBy,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {
  }

  public record CreateSecretRequest(
      String key,
      String name,
      String description,
      String value) {
  }

  public record UpdateSecretRequest(
      String name,
      String description,
      String value) {
  }

  public record SecretView(
      String id,
      String key,
      String name,
      String description,
      boolean configured,
      int keyVersion,
      String createdBy,
      String updatedBy,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt,
      OffsetDateTime rotatedAt) {
  }
}
