package dev.lcp.bff.connector;

import dev.lcp.bff.connector.ConnectorDtos.CreateSecretRequest;
import dev.lcp.bff.connector.ConnectorDtos.SecretView;
import dev.lcp.bff.connector.ConnectorDtos.UpdateSecretRequest;
import dev.lcp.bff.identity.IdentityService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** 租户密钥库。列表只返回元数据；明文只在运行时按引用短时读取。 */
@Service
public class SecretService {

  private static final int MAX_VALUE_LENGTH = 16_384;

  private static final String SECRET_COLUMNS =
      "id, secret_key, name, description, key_version, created_by, updated_by,"
          + " created_at, updated_at, rotated_at";

  private static final RowMapper<SecretView> VIEW_MAPPER = (rs, rowNum) -> view(rs);

  private final NamedParameterJdbcTemplate jdbc;
  private final SecretCipher cipher;
  private final IdentityService identity;

  public SecretService(
      NamedParameterJdbcTemplate jdbc, SecretCipher cipher, IdentityService identity) {
    this.jdbc = jdbc;
    this.cipher = cipher;
    this.identity = identity;
  }

  public List<SecretView> list() {
    identity.requireAdmin();
    return jdbc.query(
        "select " + SECRET_COLUMNS + " from lcp_secret where tenant_id = :tenant"
            + " order by updated_at desc, secret_key",
        params(), VIEW_MAPPER);
  }

  public SecretView create(CreateSecretRequest request) {
    identity.requireAdmin();
    String key = requireKey(request.key());
    String name = required(request.name(), "密钥名称");
    String value = requiredValue(request.value());
    SecretCipher.Encrypted encrypted = encrypt(key, value);
    UUID id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into lcp_secret
            (id, tenant_id, secret_key, name, description, ciphertext, iv, key_version,
             created_by, updated_by)
          values
            (:id, :tenant, :key, :name, :description, :ciphertext, :iv, :version,
             :user, :user)
          """, params()
          .addValue("id", id)
          .addValue("key", key)
          .addValue("name", name)
          .addValue("description", trimToNull(request.description()))
          .addValue("ciphertext", encrypted.ciphertext())
          .addValue("iv", encrypted.iv())
          .addValue("version", encrypted.keyVersion()));
    } catch (DuplicateKeyException ex) {
      throw PlatformException.conflict("SECRET_KEY_EXISTS", "密钥 key 已存在：" + key);
    }
    return get(id);
  }

  public SecretView patch(UUID id, UpdateSecretRequest request) {
    identity.requireAdmin();
    SecretRow current = row(id);
    String name = request.name() == null ? current.name() : required(request.name(), "密钥名称");
    String description = request.description() == null
        ? current.description() : trimToNull(request.description());
    boolean rotate = request.value() != null && !request.value().isEmpty();
    SecretCipher.Encrypted encrypted = rotate
        ? encrypt(current.key(), requiredValue(request.value())) : null;
    jdbc.update("""
        update lcp_secret
           set name = :name,
               description = :description,
               ciphertext = case when :rotate then cast(:ciphertext as bytea) else ciphertext end,
               iv = case when :rotate then cast(:iv as bytea) else iv end,
               key_version = case when :rotate then key_version + 1 else key_version end,
               rotated_at = case when :rotate then now() else rotated_at end,
               updated_by = :user,
               updated_at = now()
         where tenant_id = :tenant and id = :id
        """, params()
        .addValue("id", id)
        .addValue("name", name)
        .addValue("description", description)
        .addValue("ciphertext", encrypted == null ? null : encrypted.ciphertext())
        .addValue("iv", encrypted == null ? null : encrypted.iv())
        .addValue("rotate", rotate));
    return get(id);
  }

  public void delete(UUID id) {
    identity.requireAdmin();
    int changed = jdbc.update(
        "delete from lcp_secret where tenant_id = :tenant and id = :id",
        params().addValue("id", id));
    if (changed == 0) {
      throw PlatformException.notFound("密钥 " + id + " 不存在");
    }
  }

  /** 运行时解析。调用方保证不会把返回值写入 trace 或日志。 */
  public String value(String ref) {
    String key;
    try {
      key = SecretRefs.key(ref);
    } catch (IllegalArgumentException ex) {
      throw PlatformException.badRequest("SECRET_REF_INVALID", ex.getMessage());
    }
    List<SecretRow> rows = jdbc.query("""
        select id, secret_key, name, description, ciphertext, iv, key_version,
               created_by, updated_by, created_at, updated_at, rotated_at
          from lcp_secret
         where tenant_id = :tenant and secret_key = :key
        """, params().addValue("key", key), (rs, rowNum) -> secretRow(rs));
    if (rows.isEmpty()) {
      throw new PlatformException(
          HttpStatus.NOT_FOUND, "SECRET_NOT_FOUND", "密钥 " + key + " 不存在");
    }
    try {
      return cipher.decrypt(tenant(), key, rows.get(0).ciphertext(), rows.get(0).iv());
    } catch (SecretCipher.CipherFailure ex) {
      throw new PlatformException(
          HttpStatus.INTERNAL_SERVER_ERROR, "SECRET_DECRYPT_FAILED", ex.getMessage());
    }
  }

  private SecretView get(UUID id) {
    return jdbc.query(
        "select " + SECRET_COLUMNS + " from lcp_secret"
            + " where tenant_id = :tenant and id = :id",
        params().addValue("id", id), VIEW_MAPPER)
        .stream().findFirst()
        .orElseThrow(() -> PlatformException.notFound("密钥 " + id + " 不存在"));
  }

  private SecretRow row(UUID id) {
    return jdbc.query("""
        select id, secret_key, name, description, ciphertext, iv, key_version,
               created_by, updated_by, created_at, updated_at, rotated_at
          from lcp_secret
         where tenant_id = :tenant and id = :id
        """, params().addValue("id", id), (rs, rowNum) -> secretRow(rs))
        .stream().findFirst()
        .orElseThrow(() -> PlatformException.notFound("密钥 " + id + " 不存在"));
  }

  private SecretCipher.Encrypted encrypt(String key, String value) {
    try {
      return cipher.encrypt(tenant(), key, value);
    } catch (SecretCipher.CipherFailure ex) {
      throw new PlatformException(
          HttpStatus.INTERNAL_SERVER_ERROR, "SECRET_MASTER_KEY", ex.getMessage());
    }
  }

  private static SecretView view(ResultSet rs) throws SQLException {
    return new SecretView(
        rs.getObject("id", UUID.class).toString(), rs.getString("secret_key"),
        rs.getString("name"), rs.getString("description"), true, rs.getInt("key_version"),
        rs.getString("created_by"), rs.getString("updated_by"),
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class),
        rs.getObject("rotated_at", OffsetDateTime.class));
  }

  private static SecretRow secretRow(ResultSet rs) throws SQLException {
    return new SecretRow(
        rs.getObject("id", UUID.class), rs.getString("secret_key"), rs.getString("name"),
        rs.getString("description"), rs.getBytes("ciphertext"), rs.getBytes("iv"),
        rs.getInt("key_version"), rs.getString("created_by"), rs.getString("updated_by"),
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class),
        rs.getObject("rotated_at", OffsetDateTime.class));
  }

  private static String requireKey(String value) {
    String key = trimToNull(value);
    if (!SecretRefs.validKey(key)) {
      throw PlatformException.badRequest(
          "SECRET_KEY_INVALID", "密钥 key 需为小写字母开头的 1-64 位小写字母、数字或下划线");
    }
    return key;
  }

  private static String requiredValue(String value) {
    if (value == null || value.isEmpty()) {
      throw PlatformException.badRequest("SECRET_VALUE_REQUIRED", "密钥值不能为空");
    }
    if (value.length() > MAX_VALUE_LENGTH) {
      throw PlatformException.badRequest("SECRET_VALUE_TOO_LONG", "密钥值过长");
    }
    return value;
  }

  private static String required(String value, String label) {
    String text = trimToNull(value);
    if (text == null) {
      throw PlatformException.badRequest("FIELD_REQUIRED", label + "不能为空");
    }
    return text;
  }

  private static String trimToNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private static String tenant() {
    String tenant = TenantContext.tenantId();
    if (!StringUtils.hasText(tenant)) {
      throw new IllegalStateException("缺少租户上下文");
    }
    return tenant;
  }

  private static String user() {
    String user = TenantContext.userId();
    return StringUtils.hasText(user) ? user : "anonymous";
  }

  private static MapSqlParameterSource params() {
    return new MapSqlParameterSource("tenant", tenant()).addValue("user", user());
  }

  private record SecretRow(
      UUID id,
      String key,
      String name,
      String description,
      byte[] ciphertext,
      byte[] iv,
      int keyVersion,
      String createdBy,
      String updatedBy,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt,
      OffsetDateTime rotatedAt) {
  }
}
