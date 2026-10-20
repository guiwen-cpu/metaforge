package dev.lcp.bff.runtime.engine;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/** 法定节假日日历提供者。日期值固定为 holiday 或 workday（调休上班）。 */
public interface HolidayCalendarProvider {

  Calendar loadYear(int year);

  default Calendar loadRange(LocalDate start, LocalDate end) {
    Map<LocalDate, String> days = new LinkedHashMap<>();
    boolean degraded = false;
    for (int year = start.getYear(); year <= end.getYear(); year++) {
      Calendar calendar = loadYear(year);
      days.putAll(calendar.days());
      degraded = degraded || calendar.degraded();
    }
    return new Calendar(days, degraded);
  }

  record Calendar(Map<LocalDate, String> days, boolean degraded) {

    public Calendar {
      days = days == null ? Map.of() : Map.copyOf(days);
    }

    public static Calendar empty(boolean degraded) {
      return new Calendar(Map.of(), degraded);
    }
  }
}
