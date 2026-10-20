package dev.lcp.bff.runtime;

import dev.lcp.bff.runtime.dto.AttachmentViews.AttachmentView;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 页面级附件接口：上传、按业务查询、受控下载与软删除。 */
@RestController("runtimeAttachmentController")
@RequestMapping("/api/v1/runtime/apps/{appId}/pages/{pageKey}/attachments")
public class AttachmentController {

  private final AttachmentService attachments;

  public AttachmentController(AttachmentService attachments) {
    this.attachments = attachments;
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public AttachmentView upload(
      @PathVariable("appId") UUID appId,
      @PathVariable("pageKey") String pageKey,
      @RequestParam("file") MultipartFile file,
      @RequestParam("bizType") String bizType,
      @RequestParam(name = "bizId", required = false) String bizId,
      @RequestParam(name = "kind", required = false) String kind,
      @RequestParam(name = "fileName", required = false) String fileName) {
    return attachments.upload(appId, pageKey, file, bizType, bizId, kind, fileName);
  }

  @GetMapping
  public List<AttachmentView> list(
      @PathVariable("appId") UUID appId,
      @PathVariable("pageKey") String pageKey,
      @RequestParam("bizType") String bizType,
      @RequestParam("bizId") String bizId) {
    return attachments.list(appId, pageKey, bizType, bizId);
  }

  @GetMapping("/{id}/content")
  public ResponseEntity<Resource> content(
      @PathVariable("appId") UUID appId,
      @PathVariable("pageKey") String pageKey,
      @PathVariable("id") String id) throws IOException {
    AttachmentService.AttachmentContent content = attachments.content(appId, pageKey, id);
    String encoded = URLEncoder.encode(content.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.parseMediaType(content.mime()));
    headers.setContentLength(Files.size(content.path()));
    headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded);
    headers.setCacheControl("private, max-age=60");
    return new ResponseEntity<>(new InputStreamResource(Files.newInputStream(content.path())),
        headers, HttpStatus.OK);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @PathVariable("appId") UUID appId,
      @PathVariable("pageKey") String pageKey,
      @PathVariable("id") String id) {
    attachments.delete(appId, pageKey, id);
  }
}