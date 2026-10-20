package dev.lcp.bff.runtime.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HolidayCalendarServiceTest {

  private final ObjectMapper json = new ObjectMapper();

  @Test
  void parsesHolidayObjectAndArrayShapes() throws Exception {
    HolidayCalendarService service = new HolidayCalendarService(
        json, null, true, "http://127.0.0.1:1/{year}", 1000, 60);

    Map<LocalDate, String> timor = service.parse("""
        {"code":0,"holiday":{
          "01-01":{"holiday":true,"date":"2026-01-01"},
          "01-04":{"holiday":false,"date":"2026-01-04"}
        }}
        """, 2026);
    assertThat(timor).containsEntry(LocalDate.parse("2026-01-01"), "holiday")
        .containsEntry(LocalDate.parse("2026-01-04"), "workday");

    Map<LocalDate, String> standard = service.parse("""
        {"data":[
          {"date":"2026-10-01","type":"holiday"},
          {"date":"2026-10-10","isOffDay":false}
        ]}
        """, 2026);
    assertThat(standard).containsEntry(LocalDate.parse("2026-10-01"), "holiday")
        .containsEntry(LocalDate.parse("2026-10-10"), "workday");
  }

  @Test
  void fetchesCalendarAndDegradesOnNon2xx() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/holiday/2026", exchange -> {
      byte[] body = """
          {"code":0,"holiday":{
            "10-01":{"holiday":true,"date":"2026-10-01"},
            "10-10":{"holiday":false,"date":"2026-10-10"}
          }}
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.createContext("/holiday/2027", exchange -> {
      exchange.sendResponseHeaders(503, -1);
      exchange.close();
    });
    server.start();
    try {
      String template = "http://127.0.0.1:" + server.getAddress().getPort() + "/holiday/{year}";
      HolidayCalendarService service = new HolidayCalendarService(
          json, null, true, template, 2000, 60);

      HolidayCalendarProvider.Calendar ok = service.loadYear(2026);
      assertThat(ok.degraded()).isFalse();
      assertThat(ok.days()).containsEntry(LocalDate.parse("2026-10-01"), "holiday");

      HolidayCalendarProvider.Calendar failed = service.loadYear(2027);
      assertThat(failed.degraded()).isTrue();
      assertThat(failed.days()).isEmpty();
    } finally {
      server.stop(0);
    }
  }
}
