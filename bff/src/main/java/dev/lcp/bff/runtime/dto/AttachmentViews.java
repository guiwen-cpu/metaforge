package dev.lcp.bff.runtime.dto;

/** 运行时附件视图；对象键只暴露相对 key，下载统一走受控接口。 */
public final class AttachmentViews {

  private AttachmentViews() {
  }

  public record AttachmentView(
      String id,
      String bizType,
      String bizId,
      String fileName,
      String objectKey,
      String mime,
      long size,
      String kind,
      String checksum,
      String createdAt,
      String url) {
  }
}