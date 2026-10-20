package dev.lcp.bff.runtime.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.runtime.BusinessRecordService;
import dev.lcp.bff.runtime.BusinessRecordService.QueryResult;
import dev.lcp.bff.runtime.ProcessRuntimeService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RuntimeInternalApiServiceTest {

  private final ObjectMapper json = new ObjectMapper();
  private final BusinessRecordService records = mock(BusinessRecordService.class);
  private final ProcessRuntimeService processes = mock(ProcessRuntimeService.class);
  private final RuntimeInternalApiService service =
      new RuntimeInternalApiService(records, processes, json);

  @Test
  void dispatchesFindStaleWithBoundedParams() {
    when(records.findStale(any(JsonNode.class), eq(List.of("pending")), eq(7), eq(1000)))
        .thenReturn(new QueryResult(List.of(Map.of("id", "L1")), 1));

    JsonNode result = service.invokeInternalApi(
        bundle(), "api_leave_find_stale", "POST", "/bff/entity/{entity}/findStale",
        Map.of("entity", "leave_request"),
        parse("""
            {"idleDays": 7, "statuses": ["pending"], "limit": 1000}
            """));

    assertThat(result.path("code").asInt()).isEqualTo(0);
    assertThat(result.path("data").path("total").asLong()).isEqualTo(1);
    assertThat(result.path("data").path("rows").get(0).path("id").asText()).isEqualTo("L1");
    verify(records).findStale(any(JsonNode.class), eq(List.of("pending")), eq(7), eq(1000));
  }

  @Test
  void dispatchesFindOverlapWithDefaultActiveStatuses() {
    when(records.findOverlap(
        any(JsonNode.class), eq("alice"), eq("2026-02-01T09:00:00Z"),
        eq("2026-02-03T18:00:00Z"), isNull(), eq(List.of("pending", "draft", "approved"))))
        .thenReturn(new QueryResult(List.of(), 0));

    JsonNode result = service.invokeInternalApi(
        bundle(), "api_leave_find_overlap", "POST", "/bff/entity/{entity}/findOverlap",
        Map.of("entity", "leave_request"),
        parse("""
            {"applicantId": "alice", "startAt": "2026-02-01T09:00:00Z",
             "endAt": "2026-02-03T18:00:00Z"}
            """));

    assertThat(result.path("code").asInt()).isEqualTo(0);
    assertThat(result.path("data").path("total").asLong()).isZero();
  }

  @Test
  void findOverlapRequiresApplicant() {
    assertThatThrownBy(() -> service.invokeInternalApi(
        bundle(), "api_leave_find_overlap", "POST", "/bff/entity/{entity}/findOverlap",
        Map.of("entity", "leave_request"),
        parse("""
            {"startAt": "2026-02-01T09:00:00Z", "endAt": "2026-02-03T18:00:00Z"}
            """)))
        .isInstanceOf(PlatformException.class)
        .extracting(ex -> ((PlatformException) ex).code())
        .isEqualTo("query_applicant_required");
  }

  private JsonNode bundle() {
    return parse("""
        {"artifacts": {"dataSchemas": [{"entities": [{
          "key": "leave_request", "tableName": "edu_leave_request"
        }]}]}}
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
