package dev.lcp.generated.leave_approval.api.support;

import java.util.ArrayList;
import java.util.List;

/**
 * 一张表的运行期元数据。所有 SQL 都只从这份描述拼，绝不从请求里取表名 / 列名。
 * platform 里为 null 表示该能力未启用（无租户 / 无软删除 / 无乐观锁 / 无审计戳）。
 */
public record LcpTableSpec(
    String entityKey,
    String table,
    String path,
    String idType,
    PlatformColumns platform,
    List<LcpColumn> columns) {

  /** 平台注入列。null = 该实体没有启用这项能力。 */
  public record PlatformColumns(
      String primaryKey,
      String tenant,
      String jsonb,
      String softDelete,
      String version,
      String createdAt,
      String updatedAt,
      String createdBy,
      String updatedBy) {
  }

  public LcpTableSpec {
    columns = List.copyOf(columns);
  }

  public String primaryKey() {
    return platform.primaryKey();
  }

  public String tenant() {
    return platform.tenant();
  }

  public String jsonb() {
    return platform.jsonb();
  }

  public String softDeleteColumn() {
    return platform.softDelete();
  }

  public String versionColumn() {
    return platform.version();
  }

  public String createdAt() {
    return platform.createdAt();
  }

  public String updatedAt() {
    return platform.updatedAt();
  }

  public String createdBy() {
    return platform.createdBy();
  }

  public String updatedBy() {
    return platform.updatedBy();
  }

  /** 按字段 key 查列；查不到返回 null。 */
  public LcpColumn column(String key) {
    for (LcpColumn column : columns) {
      if (column.key().equals(key)) {
        return column;
      }
    }
    return null;
  }

  /** 真正建了列的字段（storage=column）。 */
  public List<LcpColumn> stored() {
    return pick(false);
  }

  /** 落在 JSONB 文档里的字段（storage=jsonb）。 */
  public List<LcpColumn> documents() {
    return pick(true);
  }

  /** 参与 q 全局搜索的列（只有列存 + searchable）。 */
  public List<String> searchColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.searchable() && !column.jsonb()) {
        out.add(column.key());
      }
    }
    return out;
  }

  /** ORDER BY 白名单（只有列存 + sortable）。 */
  public List<String> sortableColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.sortable() && !column.jsonb()) {
        out.add(column.key());
      }
    }
    return out;
  }

  public List<String> sensitiveColumns() {
    List<String> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.sensitive()) {
        out.add(column.key());
      }
    }
    return out;
  }

  private List<LcpColumn> pick(boolean jsonb) {
    List<LcpColumn> out = new ArrayList<>();
    for (LcpColumn column : columns) {
      if (column.jsonb() == jsonb) {
        out.add(column);
      }
    }
    return out;
  }
}
