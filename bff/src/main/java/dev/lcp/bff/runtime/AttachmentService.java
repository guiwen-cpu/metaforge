package dev.lcp.bff.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import dev.lcp.bff.auth.PermissionService;
import dev.lcp.bff.platform.PlatformException;
import dev.lcp.bff.platform.Ulid;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.AttachmentViews.AttachmentView;
import dev.lcp.bff.tenant.TenantContext;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 运行时附件上传、查询与受控下载。
 *
 * <p>文件内容不进入业务 JSONB，只登记元数据；对象键由服务端按租户/应用隔离生成。
 * 上传前先校验页面 ACL，避免绕过页面权限直接向附件中心写数据。
 */
@Service
public class AttachmentService {

  private static final long MAX_FILE_SIZE = 100L * 1024 * 1024;
  private static final int MAX_LIST_SIZE = 200;
  private static final DateTimeFormatter YEAR = DateTimeFormatter.ofPattern("yyyy");
  private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MM");

  private static final Map<String, Set<String>> EXTENSIONS = Map.of(
      "image", Set.of("jpg", "jpeg", "png", "webp", "gif"),
      "video", Set.of("mp4", "mov", "m4v", "webm"),
      "document", Set.of("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"),
      "other", Set.of("zip", "rar", "7z", "tar", "gz"));

  private static final Map<String, String> MIME = Map.ofEntries(
      Map.entry("jpg", "image/jpeg"),
      Map.entry("jpeg", "image/jpeg"),
      Map.entry("png", "image/png"),
      Map.entry("webp", "image/webp"),
      Map.entry("gif", "image/gif"),
      Map.entry("mp4", "video/mp4"),
      Map.entry("mov", "video/quicktime"),
      Map.entry("m4v", "video/x-m4v"),
      Map.entry("webm", "video/webm"),
      Map.entry("pdf", "application/pdf"),
      Map.entry("doc", "application/msword"),
      Map.entry("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      Map.entry("xls", "application/vnd.ms-excel"),
      Map.entry("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      Map.entry("ppt", "application/vnd.ms-powerpoint"),
      Map.entry("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      Map.entry("txt", "text/plain"),
      Map.entry("csv", "text/csv"),
      Map.entry("zip", "application/zip"),
      Map.entry("rar", "application/vnd.rar"),
      Map.entry("7z", "application/x-7z-compressed"),
      Map.entry("tar", "application/x-tar"),
      Map.entry("gz", "application/gzip"));

  private final PublishedBundleService bundles;
  private final RuntimeNavigationService navigation;
  private final PermissionService permissions;
  private final BusinessRecordService records;
  private final AttachmentStorage storage;

  public AttachmentService(
      PublishedBundleService bundles,
      RuntimeNavigationService navigation,
      PermissionService permissions,
      BusinessRecordService records,
      AttachmentStorage storage) {
    this.bundles = bundles;
    this.navigation = navigation;
    this.permissions = permissions;
    this.records = records;
    this.storage = storage;
  }

  public AttachmentView upload(
      UUID appId,
      String pageKey,
      MultipartFile file,
      String bizType,
      String bizId,
      String kind,
      String fileNameOverride) {
    PublishedBundle published = accessible(appId, pageKey);
    JsonNode entity = bundles.entity(published.content(), "attachment");
    if (entity == null) {
      throw PlatformException.badRequest("attachment_entity_missing", "发布件缺少 attachment 实体");
    }
    if (file == null || file.isEmpty()) {
      throw PlatformException.badRequest("file_required", "请选择要上传的文件");
    }
    if (file.getSize() > MAX_FILE_SIZE) {
      throw PlatformException.badRequest("file_too_large", "单个文件不得超过 100MB");
    }
    String type = requiredToken(bizType, "biz_type_required", "缺少业务类型", 64);
    String businessId = bizId == null || bizId.isBlank() ? Ulid.next() : requiredToken(bizId, "biz_id_invalid", "业务主键格式不正确", 26);
    String fileName = safeName(fileNameOverride == null || fileNameOverride.isBlank()
        ? file.getOriginalFilename() : fileNameOverride);
    String ext = extension(fileName);
    String fileKind = normalizeKind(kind, ext);
    Set<String> allowed = EXTENSIONS.get(fileKind);
    if (allowed == null || !allowed.contains(ext)) {
      throw PlatformException.badRequest("file_type_not_allowed",
          "不支持的文件类型：" + ext);
    }
    String id = Ulid.next();
    String objectKey = TenantContext.tenantId() + "/" + appId + "/" + LocalDate.now().format(YEAR)
        + "/" + LocalDate.now().format(MONTH) + "/" + id + "." + ext;
    AttachmentStorage.Stored stored;
    try (InputStream input = file.getInputStream()) {
      stored = storage.store(objectKey, input);
    } catch (IOException ex) {
      throw PlatformException.badRequest("file_store_failed", "文件保存失败：" + ex.getMessage());
    }
    Map<String, Object> business = new LinkedHashMap<>();
    business.put("id", id);
    business.put("biz_type", type);
    business.put("biz_id", businessId);
    business.put("file_name", fileName);
    business.put("object_key", objectKey);
    business.put("mime", contentType(file.getContentType(), ext));
    business.put("size", file.getSize());
    business.put("kind", fileKind);
    business.put("checksum", stored.checksum());
    try {
      records.create(entity, business, TenantContext.userId());
    } catch (RuntimeException ex) {
      try {
        storage.delete(objectKey);
      } catch (IOException ignored) {
        // 数据库失败时尽力清理，避免留下无登记文件
      }
      throw ex;
    }
    return view(appId, pageKey, records.get(entity, id));
  }

  public List<AttachmentView> list(UUID appId, String pageKey, String bizType, String bizId) {
    PublishedBundle published = accessible(appId, pageKey);
    JsonNode entity = bundles.entity(published.content(), "attachment");
    if (entity == null) {
      throw PlatformException.badRequest("attachment_entity_missing", "发布件缺少 attachment 实体");
    }
    String type = requiredToken(bizType, "biz_type_required", "缺少业务类型", 64);
    String businessId = requiredToken(bizId, "biz_id_invalid", "缺少业务主键", 26);
    Map<String, Object> filters = new LinkedHashMap<>();
    filters.put("biz_type", type);
    filters.put("biz_id", businessId);
    return records.list(entity, filters, "created_at", false, MAX_LIST_SIZE).stream()
        .map(row -> view(appId, pageKey, row))
        .toList();
  }

  public AttachmentContent content(UUID appId, String pageKey, String id) {
    PublishedBundle published = accessible(appId, pageKey);
    JsonNode entity = bundles.entity(published.content(), "attachment");
    if (entity == null) {
      throw PlatformException.badRequest("attachment_entity_missing", "发布件缺少 attachment 实体");
    }
    Map<String, Object> row = records.get(entity, id);
    if (row.isEmpty()) {
      throw PlatformException.notFound("附件不存在");
    }
    String objectKey = string(row.get("object_key"));
    Path path = storage.resolve(objectKey);
    if (!Files.isRegularFile(path)) {
      throw PlatformException.notFound("附件文件已丢失");
    }
    return new AttachmentContent(
        string(row.get("file_name")),
        fallback(string(row.get("mime")), "application/octet-stream"),
        path);
  }

  public void delete(UUID appId, String pageKey, String id) {
    PublishedBundle published = accessible(appId, pageKey);
    JsonNode entity = bundles.entity(published.content(), "attachment");
    if (entity == null) {
      throw PlatformException.badRequest("attachment_entity_missing", "发布件缺少 attachment 实体");
    }
    if (records.get(entity, id).isEmpty()) {
      throw PlatformException.notFound("附件不存在");
    }
    records.softDelete(entity, id, TenantContext.userId());
  }

  private PublishedBundle accessible(UUID appId, String pageKey) {
    PublishedBundle published = bundles.load(appId);
    JsonNode page = findPage(published.content(), pageKey);
    if (page == null) {
      throw PlatformException.notFound("页面 " + pageKey + " 不存在");
    }
    Set<String> roles = permissions.effectiveRoles(appId, published.content());
    if (!navigation.pageAllowed(appId, published.content(), roles, pageKey)) {
      throw PlatformException.forbidden("无权访问页面 " + pageKey);
    }
    return published;
  }

  private AttachmentView view(UUID appId, String pageKey, Map<String, Object> row) {
    String id = string(row.get("id"));
    return new AttachmentView(
        id,
        string(row.get("biz_type")),
        string(row.get("biz_id")),
        string(row.get("file_name")),
        string(row.get("object_key")),
        string(row.get("mime")),
        number(row.get("size")),
        string(row.get("kind")),
        string(row.get("checksum")),
        string(row.get("created_at")),
        "/runtime/apps/" + appId + "/pages/" + pageKey + "/attachments/" + id + "/content");
  }

  private static String normalizeKind(String kind, String ext) {
    String value = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
    if (value.isBlank()) {
      for (Map.Entry<String, Set<String>> entry : EXTENSIONS.entrySet()) {
        if (entry.getValue().contains(ext)) {
          return entry.getKey();
        }
      }
      return "other";
    }
    if (!EXTENSIONS.containsKey(value)) {
      throw PlatformException.badRequest("attachment_kind_invalid", "附件类别必须是 image / video / document / other");
    }
    return value;
  }

  private static String requiredToken(String value, String code, String message, int max) {
    if (value == null || value.isBlank() || value.length() > max
        || !value.matches("[A-Za-z0-9_.:-]+")) {
      throw PlatformException.badRequest(code, message);
    }
    return value;
  }

  private static String safeName(String original) {
    String value = original == null ? "" : original.replace('\\', '/');
    int slash = value.lastIndexOf('/');
    if (slash >= 0) {
      value = value.substring(slash + 1);
    }
    value = value.replaceAll("[\\p{Cntrl}]", "").trim();
    if (value.isBlank()) {
      value = "attachment";
    }
    return value.length() > 200 ? value.substring(value.length() - 200) : value;
  }

  private static String extension(String name) {
    int dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length() - 1) {
      throw PlatformException.badRequest("file_extension_missing", "文件缺少扩展名");
    }
    return name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private static String contentType(String declared, String ext) {
    if (declared != null && !declared.isBlank() && !"application/octet-stream".equals(declared)) {
      return declared;
    }
    return MIME.getOrDefault(ext, "application/octet-stream");
  }

  private static JsonNode findPage(JsonNode bundle, String pageKey) {
    for (JsonNode page : bundle.path("artifacts").path("uiSchemas")) {
      if (pageKey != null && pageKey.equals(page.path("key").asText())) {
        return page;
      }
    }
    return null;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static long number(Object value) {
    return value instanceof Number num ? num.longValue() : 0L;
  }

  private static String fallback(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  public record AttachmentContent(String fileName, String mime, Path path) {
  }
}