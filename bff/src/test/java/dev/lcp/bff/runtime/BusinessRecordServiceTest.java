package dev.lcp.bff.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.tenant.TenantContext;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class BusinessRecordServiceTest {

  private final ObjectMapper json = new ObjectMapper();
  private NamedParameterJdbcTemplate jdbc;
  private BusinessRecordService records;

  @BeforeEach
  void setUp() {
    jdbc = mock(NamedParameterJdbcTemplate.class);
    records = new BusinessRecordService(jdbc, json);
    TenantContext.set("tenant_demo_school", "alice");
  }

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void findStaleUsesEntityMetadataAndBoundParameters() {
    when(jdbc.queryForObject(anyString(), any(SqlParameterSource.class), eq(Long.class))).thenReturn(3L);
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", "L1");
    row.put("status", "pending");
    row.put("updated_at", Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
    row.put("ext", "{\"reason\":\"sick\"}");
    row.put("__ext_json", "{\"reason\":\"sick\"}");
    when(jdbc.queryForList(anyString(), any(SqlParameterSource.class))).thenReturn(List.of(row));

    BusinessRecordService.QueryResult result =
        records.findStale(entity(), List.of("pending", "approved"), 7, 100);

    assertThat(result.total()).isEqualTo(3);
    assertThat(result.rows()).hasSize(1);
    assertThat(result.rows().get(0)).containsEntry("reason", "sick").doesNotContainKey("ext");

    ArgumentCaptor<String> countSql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<SqlParameterSource> countParams = ArgumentCaptor.forClass(SqlParameterSource.class);
    verify(jdbc).queryForObject(countSql.capture(), countParams.capture(), eq(Long.class));
    assertThat(countSql.getValue())
        .contains("edu_leave_request", "tenant_id = :t", "deleted_at is null",
            "updated_at < now()", "status in (:statuses)");
    assertThat(countParams.getValue().getValue("idleDays")).isEqualTo(7);
    assertThat(countParams.getValue().getValue("statuses")).isEqualTo(List.of("pending", "approved"));
    assertThat(countParams.getValue().getValue("t")).isEqualTo("tenant_demo_school");

    ArgumentCaptor<String> selectSql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<SqlParameterSource> selectParams = ArgumentCaptor.forClass(SqlParameterSource.class);
    verify(jdbc).queryForList(selectSql.capture(), selectParams.capture());
    assertThat(selectSql.getValue())
        .contains("order by t.updated_at asc", "limit :limit", "as __ext_json");
    assertThat(selectParams.getValue().getValue("limit")).isEqualTo(100);
  }

  @Test
  void findOverlapUsesOwnerTimeAndStatusMetadata() {
    when(jdbc.queryForObject(anyString(), any(SqlParameterSource.class), eq(Long.class))).thenReturn(1L);
    when(jdbc.queryForList(anyString(), any(SqlParameterSource.class))).thenReturn(List.of());

    BusinessRecordService.QueryResult result = records.findOverlap(
        entity(), "alice", "2026-02-01T09:00:00Z", "2026-02-03T18:00:00Z",
        "L1", List.of("pending", "draft"));

    assertThat(result.total()).isEqualTo(1);
    ArgumentCaptor<String> countSql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<SqlParameterSource> countParams = ArgumentCaptor.forClass(SqlParameterSource.class);
    verify(jdbc).queryForObject(countSql.capture(), countParams.capture(), eq(Long.class));
    assertThat(countSql.getValue())
        .contains("applicant_id = :applicantId",
            "start_at < cast(:endAt as timestamptz)",
            "end_at > cast(:startAt as timestamptz)",
            "id <> :excludeId",
            "status in (:activeStatuses)",
            "deleted_at is null");
    assertThat(countParams.getValue().getValue("applicantId")).isEqualTo("alice");
    assertThat(countParams.getValue().getValue("startAt")).isEqualTo("2026-02-01T09:00:00Z");
    assertThat(countParams.getValue().getValue("endAt")).isEqualTo("2026-02-03T18:00:00Z");
    assertThat(countParams.getValue().getValue("excludeId")).isEqualTo("L1");
    assertThat(countParams.getValue().getValue("activeStatuses")).isEqualTo(List.of("pending", "draft"));
  }

  @Test
  void findOverlapRejectsJsonbTimeField() {
    JsonNode entity = entityWithJsonbStart();

    assertThatThrownBy(() -> records.findOverlap(
        entity, "alice", "2026-02-01T09:00:00Z", "2026-02-03T18:00:00Z", null, List.of()))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("start_at");
  }

  private JsonNode entity() {
    return parse("""
        {
          "key": "leave_request",
          "tableName": "edu_leave_request",
          "statusField": "status",
          "storage": {
            "primaryKey": "id",
            "tenantColumn": "tenant_id",
            "jsonbColumn": "ext",
            "softDelete": {"enabled": true, "column": "deleted_at"},
            "timestamps": {"updatedAt": "updated_at"}
          },
          "access": {"ownerField": "applicant_id"},
          "fields": [
            {"key": "id", "type": "string", "storage": "column"},
            {"key": "applicant_id", "type": "string", "storage": "column"},
            {"key": "start_at", "type": "datetime", "storage": "column"},
            {"key": "end_at", "type": "datetime", "storage": "column"},
            {"key": "status", "type": "enum", "storage": "column"},
            {"key": "reason", "type": "text", "storage": "jsonb"}
          ]
        }
        """);
  }

  private JsonNode entityWithJsonbStart() {
    return parse("""
        {
          "tableName": "edu_leave_request",
          "storage": {"primaryKey": "id", "tenantColumn": "tenant_id", "jsonbColumn": "ext"},
          "access": {"ownerField": "applicant_id"},
          "fields": [
            {"key": "applicant_id", "type": "string", "storage": "column"},
            {"key": "start_at", "type": "datetime", "storage": "jsonb"},
            {"key": "end_at", "type": "datetime", "storage": "column"},
            {"key": "status", "type": "enum", "storage": "column"}
          ]
        }
        """);
  }

  private JsonNode parse(String raw) {
    try {
      return json.readTree(raw);
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }
}
