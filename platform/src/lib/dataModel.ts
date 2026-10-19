import type {
  ArtifactRef,
  DataEntity,
  DataField,
  DataRelation,
  DataSchema,
  DataFieldType,
  RelationType,
  SemanticDef,
  StorageKind
} from "@/types/dataModel";
import { ulid } from "@/lib/ulid";

export interface ModelIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export const FIELD_TYPES: Array<{ value: DataFieldType; label: string; group: string }> = [
  { value: "string", label: "短文本", group: "基础" },
  { value: "text", label: "长文本", group: "基础" },
  { value: "richText", label: "富文本", group: "基础" },
  { value: "integer", label: "整数", group: "数字" },
  { value: "decimal", label: "小数", group: "数字" },
  { value: "boolean", label: "布尔", group: "基础" },
  { value: "date", label: "日期", group: "时间" },
  { value: "datetime", label: "日期时间", group: "时间" },
  { value: "time", label: "时间", group: "时间" },
  { value: "json", label: "JSON", group: "高级" },
  { value: "enum", label: "枚举", group: "选择" },
  { value: "ref", label: "引用实体", group: "关系" },
  { value: "file", label: "文件", group: "附件" },
  { value: "image", label: "图片", group: "附件" },
  { value: "video", label: "视频", group: "附件" },
  { value: "array", label: "数组", group: "高级" },
  { value: "signature", label: "签名", group: "附件" },
  { value: "location", label: "地理位置", group: "高级" },
  { value: "formula", label: "公式", group: "计算" }
];

const FIELD_TYPE_LABEL = new Map(FIELD_TYPES.map((item) => [item.value, item.label]));

export const RELATION_TYPES: Array<{ value: RelationType; label: string }> = [
  { value: "manyToOne", label: "多对一" },
  { value: "oneToMany", label: "一对多" },
  { value: "oneToOne", label: "一对一" },
  { value: "manyToMany", label: "多对多" }
];

const RELATION_TYPE_LABEL = new Map(RELATION_TYPES.map((item) => [item.value, item.label]));

export const UPLOAD_FIELD_TYPES: DataFieldType[] = ["file", "image", "video"];

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TABLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const ID_TYPES = ["ulid", "uuid", "bigint", "snowflake"];

export function fieldTypeLabel(type?: string | null): string {
  return (type && FIELD_TYPE_LABEL.get(type as DataFieldType)) || type || "未知";
}

export function relationTypeLabel(type?: string | null): string {
  return (type && RELATION_TYPE_LABEL.get(type as RelationType)) || type || "未知";
}

export function storageLabel(storage?: StorageKind | null): string {
  return storage === "column" ? "真实列" : "JSONB";
}

export function sanitizeKey(raw: string, fallback = "item"): string {
  let value = (raw || fallback).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  value = value.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!value) value = fallback;
  if (!/^[a-z]/.test(value)) value = `k_${value}`;
  return value.slice(0, 63);
}

export function uniqueKey(existing: string[], base: string): string {
  const seed = sanitizeKey(base);
  if (!existing.includes(seed)) return seed;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${seed}_${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${seed}_${Date.now()}`;
}

export function tableNameFor(entityKey: string, existing: string[] = []): string {
  const base = `biz_${sanitizeKey(entityKey)}`.slice(0, 63);
  if (!existing.includes(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base.slice(0, 60)}_${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base.slice(0, 54)}_${Date.now()}`;
}

export function createStarterField(type: DataFieldType = "string", key = "field", label = "字段"): DataField {
  const field: DataField = {
    id: ulid(),
    key,
    label,
    type,
    storage: type === "ref" || type === "enum" ? "column" : "jsonb"
  };
  if (type === "string" || type === "text") field.length = type === "text" ? 2000 : 64;
  if (type === "decimal") {
    field.precision = 18;
    field.scale = 2;
  }
  if (type === "enum") field.enumValues = [{ value: "option_1", label: "选项一" }];
  if (type === "array") field.itemType = { type: "string" };
  return field;
}

export function createStarterEntity(key = "entity", name = "业务实体", existingTables: string[] = []): DataEntity {
  const idField: DataField = {
    ...createStarterField("string", "id", "主键"),
    storage: "column",
    columnType: "char(26)",
    length: 26,
    required: true,
    immutable: true
  };
  const nameField: DataField = {
    ...createStarterField("string", "name", "名称"),
    storage: "column",
    length: 64,
    required: true,
    searchable: true
  };
  return {
    id: ulid(),
    key: sanitizeKey(key),
    name,
    tableName: tableNameFor(key, existingTables),
    titleField: "name",
    enabled: true,
    storage: {
      primaryKey: "id",
      idType: "ulid",
      tenantColumn: "tenant_id",
      jsonbColumn: "ext",
      softDelete: { enabled: true, column: "deleted_at", type: "timestamp" },
      timestamps: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        createdBy: "created_by",
        updatedBy: "updated_by"
      },
      optimisticLock: false,
      auditLog: false
    },
    fields: [idField, nameField],
    relations: [],
    indexes: []
  };
}

export function createStarterSchema(appKey: string, appName: string, ordinal = 1): DataSchema {
  const base = sanitizeKey(appKey || "app");
  return {
    id: ulid(),
    key: ordinal <= 1 ? `${base}_core` : `${base}_domain${ordinal}`,
    name: ordinal <= 1 ? `${appName || "应用"} 数据模型` : `${appName || "应用"} 数据域 ${ordinal}`,
    scope: "app",
    version: 1,
    description: "",
    entities: [createStarterEntity("item", "业务实体")],
    enums: []
  };
}

export function entityRef(entity: DataEntity): ArtifactRef {
  return { kind: "entity", id: entity.id };
}

export function resolveEntityByRef(
  ref: ArtifactRef | undefined,
  entities: DataEntity[]
): DataEntity | undefined {
  if (!ref) return undefined;
  return entities.find((entity) => (ref.id ? entity.id === ref.id : false) || (ref.key ? entity.key === ref.key : false));
}

export function resolveEntityId(ref: ArtifactRef | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref.id === "string" ? ref.id : undefined;
}

export function findEntity(entities: DataEntity[], id?: string | null): DataEntity | undefined {
  if (!id) return undefined;
  return entities.find((entity) => entity.id === id);
}

export function findField(entity: DataEntity | undefined, key?: string | null): DataField | undefined {
  if (!entity || !key) return undefined;
  return entity.fields.find((field) => field.key === key);
}

export function compactSemantic(semantic?: SemanticDef): SemanticDef | undefined {
  if (!semantic) return undefined;
  const result: SemanticDef = {};
  for (const [key, value] of Object.entries(semantic)) {
    if (key === "synonyms" || key === "tags" || key === "examples") {
      if (Array.isArray(value) && value.length) result[key] = value.filter((item) => item !== "" && item != null);
    } else if (typeof value === "string") {
      if (value.trim()) result[key] = value.trim();
    } else if (value != null) {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function checkUlid(value: string | undefined, where: string, label: string, issues: ModelIssue[]) {
  if (!value || !ULID_PATTERN.test(value)) {
    issues.push({ level: "error", where, message: `${label} id 必须是 26 位 ULID` });
  }
}

function checkKey(value: string | undefined, where: string, label: string, issues: ModelIssue[]) {
  if (!value || !KEY_PATTERN.test(value)) {
    issues.push({ level: "error", where, message: `${label} 必须是小写 snake_case（字母开头，仅 a-z0-9_）` });
  }
}

export function validateDataSchemas(schemas: DataSchema[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!schemas.length) {
    issues.push({ level: "error", where: "数据模型", message: "尚未创建数据域，请先新建一个数据域" });
    return issues;
  }
  const tableOwners = new Map<string, string>();

  schemas.forEach((schema, schemaIndex) => {
    const schemaWhere = schema.key || `dataSchemas[${schemaIndex}]`;
    checkUlid(schema.id, schemaWhere, "数据域", issues);
    checkKey(schema.key, schemaWhere, "数据域 key", issues);
    if (!schema.name || !schema.name.trim()) {
      issues.push({ level: "error", where: schemaWhere, message: "数据域名称不能为空" });
    }
    if (!Number.isInteger(schema.version) || schema.version < 1) {
      issues.push({ level: "error", where: schemaWhere, message: "数据域 version 必须是 >= 1 的整数" });
    }
    if (!Array.isArray(schema.entities) || schema.entities.length === 0) {
      issues.push({ level: "error", where: schemaWhere, message: "数据域至少需要一个实体" });
      return;
    }

    const entityKeys = new Set<string>();
    const entityIds = new Set<string>();

    schema.entities.forEach((entity, entityIndex) => {
      const entityWhere = `${schemaWhere} / ${entity.key || `entities[${entityIndex}]`}`;
      checkUlid(entity.id, entityWhere, "实体", issues);
      checkKey(entity.key, entityWhere, "实体 key", issues);
      if (!entity.name || !entity.name.trim()) {
        issues.push({ level: "error", where: entityWhere, message: "实体名称不能为空" });
      }
      if (entityIds.has(entity.id)) {
        issues.push({ level: "error", where: entityWhere, message: "实体 id 重复" });
      }
      entityIds.add(entity.id);
      if (entityKeys.has(entity.key)) {
        issues.push({ level: "error", where: entityWhere, message: "实体 key 在同一数据域内重复" });
      }
      entityKeys.add(entity.key);

      if (entity.tableName) {
        if (!TABLE_PATTERN.test(entity.tableName)) {
          issues.push({ level: "error", where: entityWhere, message: "表名必须以小写字母开头，仅含 a-z0-9_" });
        }
        const owner = tableOwners.get(entity.tableName);
        if (owner && owner !== entity.id) {
          issues.push({ level: "error", where: entityWhere, message: `表名 ${entity.tableName} 已被其他实体占用` });
        } else {
          tableOwners.set(entity.tableName, entity.id);
        }
      }

      const storage = entity.storage;
      if (!storage || typeof storage !== "object") {
        issues.push({ level: "error", where: entityWhere, message: "缺少 storage 存储策略" });
      } else {
        if (storage.primaryKey && !KEY_PATTERN.test(storage.primaryKey)) {
          issues.push({ level: "error", where: entityWhere, message: "storage.primaryKey 必须是合法 key" });
        }
        if (storage.idType && !ID_TYPES.includes(storage.idType)) {
          issues.push({ level: "error", where: entityWhere, message: "storage.idType 取值不合法" });
        }
        if (storage.tenantColumn === null && schema.scope !== "system") {
          issues.push({ level: "warning", where: entityWhere, message: "tenantColumn=null 仅 system scope 允许" });
        }
        if (storage.jsonbColumn && !KEY_PATTERN.test(storage.jsonbColumn)) {
          issues.push({ level: "error", where: entityWhere, message: "jsonbColumn 必须是合法列名" });
        }
      }

      if (!Array.isArray(entity.fields) || entity.fields.length === 0) {
        issues.push({ level: "error", where: entityWhere, message: "实体至少需要一个字段" });
        return;
      }

      const fieldKeys = new Set<string>();
      const fieldIds = new Set<string>();
      entity.fields.forEach((field, fieldIndex) => {
        const fieldWhere = `${entityWhere} / ${field.key || `fields[${fieldIndex}]`}`;
        checkUlid(field.id, fieldWhere, "字段", issues);
        checkKey(field.key, fieldWhere, "字段 key", issues);
        if (!field.label || !field.label.trim()) {
          issues.push({ level: "error", where: fieldWhere, message: "字段显示名称不能为空" });
        }
        if (fieldIds.has(field.id)) {
          issues.push({ level: "error", where: fieldWhere, message: "字段 id 重复" });
        }
        fieldIds.add(field.id);
        if (fieldKeys.has(field.key)) {
          issues.push({ level: "error", where: fieldWhere, message: "字段 key 在同一实体内重复" });
        }
        fieldKeys.add(field.key);

        if (field.storage && field.storage !== "column" && field.storage !== "jsonb") {
          issues.push({ level: "error", where: fieldWhere, message: "字段 storage 只能是 column 或 jsonb" });
        }
        if (field.unique && field.storage !== "column") {
          issues.push({ level: "error", where: fieldWhere, message: "唯一字段必须使用 storage=column" });
        }
        if (field.searchable && field.storage !== "column") {
          issues.push({ level: "warning", where: fieldWhere, message: "jsonb 字段参与搜索需要额外 GIN 索引" });
        }
        if (field.sortable && field.storage !== "column") {
          issues.push({ level: "warning", where: fieldWhere, message: "jsonb 字段排序性能差，建议上提为真实列" });
        }
        if (field.type === "enum") {
          const values = Array.isArray(field.enumValues) ? field.enumValues : [];
          if (!field.enumRef && values.length === 0) {
            issues.push({ level: "error", where: fieldWhere, message: "枚举字段必须提供 enumValues 或 enumRef" });
          }
          const seen = new Set<string>();
          values.forEach((value, valueIndex) => {
            if (value.value === undefined || value.value === null || `${value.value}` === "") {
              issues.push({ level: "error", where: `${fieldWhere} / 值 ${valueIndex + 1}`, message: "枚举值不能为空" });
            }
            const raw = `${value.value}`;
            if (seen.has(raw)) {
              issues.push({ level: "error", where: fieldWhere, message: `枚举值 ${raw} 重复` });
            }
            seen.add(raw);
            if (!value.label || !value.label.trim()) {
              issues.push({ level: "warning", where: fieldWhere, message: `枚举值 ${raw} 缺少显示名称` });
            }
          });
        }
        if (field.type === "ref") {
          const target = resolveEntityByRef(field.refEntity, schema.entities);
          if (!target) {
            issues.push({ level: "error", where: fieldWhere, message: "引用字段必须选择目标实体" });
          } else if (field.refField && !findField(target, field.refField)) {
            issues.push({ level: "warning", where: fieldWhere, message: `目标实体不存在字段 ${field.refField}` });
          }
          if (field.storage !== "column") {
            issues.push({ level: "warning", where: fieldWhere, message: "引用字段建议使用 storage=column 以支持外键与关联查询" });
          }
        }
        if (field.type === "array" && !field.itemType?.type) {
          issues.push({ level: "error", where: fieldWhere, message: "数组字段必须声明 itemType" });
        }
      });

      if (entity.titleField && !fieldKeys.has(entity.titleField)) {
        issues.push({ level: "error", where: entityWhere, message: `titleField ${entity.titleField} 不存在于字段列表` });
      }

      const relationKeys = new Set<string>();
      const relationIds = new Set<string>();
      (entity.relations ?? []).forEach((relation, relationIndex) => {
        const relationWhere = `${entityWhere} / 关系 ${relation.key || `relations[${relationIndex}]`}`;
        checkUlid(relation.id, relationWhere, "关系", issues);
        checkKey(relation.key, relationWhere, "关系 key", issues);
        if (relationIds.has(relation.id)) {
          issues.push({ level: "error", where: relationWhere, message: "关系 id 重复" });
        }
        relationIds.add(relation.id);
        if (relationKeys.has(relation.key)) {
          issues.push({ level: "error", where: relationWhere, message: "关系 key 在同一实体内重复" });
        }
        relationKeys.add(relation.key);

        if (!RELATION_TYPE_LABEL.has(relation.type)) {
          issues.push({ level: "error", where: relationWhere, message: "关系类型不合法" });
        }
        validateRelationEndpoint(relation.from, entity, schema.entities, relationWhere, "from", issues);
        validateRelationEndpoint(relation.to, undefined, schema.entities, relationWhere, "to", issues);
        if (relation.type === "manyToMany" && !relation.join?.tableName) {
          issues.push({ level: "warning", where: relationWhere, message: "多对多关系建议显式声明 join 中间表" });
        }
      });

      const physicalColumns = new Set<string>(["version"]);
      if (storage) {
        if (storage.primaryKey) physicalColumns.add(storage.primaryKey);
        if (storage.jsonbColumn) physicalColumns.add(storage.jsonbColumn);
        if (storage.tenantColumn) physicalColumns.add(storage.tenantColumn);
        if (storage.softDelete?.column) physicalColumns.add(storage.softDelete.column);
        for (const column of Object.values(storage.timestamps ?? {})) {
          if (column) physicalColumns.add(column);
        }
      }

      (entity.indexes ?? []).forEach((index, indexPosition) => {
        const indexWhere = `${entityWhere} / 索引 ${index.name || indexPosition + 1}`;
        if (!index.name) {
          issues.push({ level: "error", where: indexWhere, message: "索引名称不能为空" });
        }
        (index.fields ?? []).forEach((fieldKey) => {
          if (physicalColumns.has(fieldKey) || fieldKey.includes("->") || fieldKey.includes("(")) return;
          if (!fieldKeys.has(fieldKey)) {
            issues.push({ level: "warning", where: indexWhere, message: `索引字段 ${fieldKey} 不存在` });
          }
        });
      });
    });
  });

  return issues;
}

function validateRelationEndpoint(
  endpoint: DataRelation["from"] | undefined,
  localEntity: DataEntity | undefined,
  entities: DataEntity[],
  where: string,
  side: "from" | "to",
  issues: ModelIssue[]
) {
  if (!endpoint || !endpoint.entityRef || !endpoint.fieldKey) {
    issues.push({ level: "error", where, message: `${side} 端点缺少实体或字段` });
    return;
  }
  const target = localEntity && side === "from" && !endpoint.entityRef.id
    ? localEntity
    : resolveEntityByRef(endpoint.entityRef, entities);
  if (!target) {
    issues.push({ level: "error", where, message: `${side} 端点引用的实体不存在` });
    return;
  }
  const field = findField(target, endpoint.fieldKey);
  if (!field) {
    issues.push({ level: "error", where, message: `${side} 端点字段 ${endpoint.fieldKey} 不存在` });
    return;
  }
  if (field.storage !== "column") {
    issues.push({ level: "error", where, message: `关系字段 ${target.key}.${field.key} 必须使用 storage=column` });
  }
}