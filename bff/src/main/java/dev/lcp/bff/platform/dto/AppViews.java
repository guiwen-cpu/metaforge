package dev.lcp.bff.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.List;

/** 控制平面响应体。JsonNode 原样透传，避免平台对协议字段再做一层建模。 */
public final class AppViews {

  private AppViews() {
  }

  /** 应用索引视图：不带 draft_bundle，避免列表接口被大字段拖垮。 */
  public record AppView(
      String id,
      String key,
      String name,
      String description,
      String icon,
      String type,
      String category,
      String status,
      Integer currentVersion,
      long draftRevision,
      OffsetDateTime draftUpdatedAt,
      String draftUpdatedBy,
      JsonNode semantic,
      String createdBy,
      String updatedBy,
      OffsetDateTime createdAt,
      OffsetDateTime updatedAt) {
  }

  public record DraftView(
      String appId,
      long revision,
      JsonNode bundle,
      OffsetDateTime updatedAt,
      String updatedBy) {
  }

  /** 与协议 common.schema.json 的 Checksum 对齐。 */
  public record ChecksumView(String algo, String value) {
  }

  public record VersionSummary(
      String id,
      int versionNo,
      String status,
      String message,
      ChecksumView checksum,
      String protocolVersion,
      String snapshotId,
      Integer rollbackOfVersion,
      Integer basedOnVersion,
      String createdBy,
      OffsetDateTime createdAt) {
  }

  /**
   * 版本详情。contentChecksum 忽略 snapshot，用于判断「内容是否真的变了」；
   * unchanged=true 表示发布请求命中了内容去重，返回的是当前版本。
   */
  public record VersionDetail(
      String id,
      int versionNo,
      String status,
      String message,
      ChecksumView checksum,
      String contentChecksum,
      String protocolVersion,
      String snapshotId,
      Integer rollbackOfVersion,
      Integer basedOnVersion,
      String createdBy,
      OffsetDateTime createdAt,
      JsonNode bundle,
      boolean unchanged) {
  }

  public record ChecksumPair(String from, String to) {
  }

  public record DiffSummary(int added, int removed, int changed, int total) {
  }

  public record DiffEntry(
      String path,
      String kind,
      String artifactKind,
      String artifactKey,
      JsonNode before,
      JsonNode after) {
  }

  public record VersionDiffView(
      int fromVersion,
      int toVersion,
      boolean identical,
      ChecksumPair contentChecksum,
      DiffSummary summary,
      List<DiffEntry> changes,
      boolean truncated) {
  }

  public record PageResult<T>(List<T> items, long total, int page, int size) {
  }
}