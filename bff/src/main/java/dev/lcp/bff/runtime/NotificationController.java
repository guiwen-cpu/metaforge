package dev.lcp.bff.runtime;

import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationFeed;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationReadResult;
import dev.lcp.bff.runtime.dto.RuntimeViews.NotificationView;
import dev.lcp.bff.runtime.dto.RuntimeViews.UnreadCount;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 跨应用的当前用户通知中心。 */
@RestController
@RequestMapping("/api/v1/runtime/notifications")
public class NotificationController {

  private final NotificationService notifications;

  public NotificationController(NotificationService notifications) {
    this.notifications = notifications;
  }

  @GetMapping
  public NotificationFeed list(
      @RequestParam(name = "limit", defaultValue = "20") int limit) {
    return notifications.listAll(limit);
  }

  @GetMapping("/unread-count")
  public UnreadCount unreadCount() {
    return new UnreadCount(notifications.unreadCountAll());
  }

  @PostMapping("/{id}/read")
  public NotificationView read(@PathVariable("id") UUID id) {
    return notifications.markRead(id);
  }

  @PostMapping("/read-all")
  public NotificationReadResult readAll() {
    return notifications.markAllRead();
  }
}
