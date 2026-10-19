<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformApi } from "@/api/platform";
import { ApiError, errorMessage } from "@/lib/http";
import { formatDateTime, prettyJson } from "@/lib/format";
import { ulid } from "@/lib/ulid";
import { useSessionStore } from "@/stores/session";
import {
  FIELD_TYPES,
  RELATION_TYPES,
  UPLOAD_FIELD_TYPES,
  createStarterEntity,
  createStarterField,
  createStarterSchema,
  entityRef,
  fieldTypeLabel,
  findEntity,
  findField,
  relationTypeLabel,
  resolveEntityByRef,
  resolveEntityId,
  sanitizeKey,
  storageLabel,
  tableNameFor,
  uniqueKey,
  validateDataSchemas
} from "@/lib/dataModel";
import type {
  DataEntity,
  DataField,
  DataFieldType,
  DataRelation,
  DataSchema,
  EntityStorage,
  RelationType,
  SemanticDef,
  UploadHints,
  ValueTypeRef
} from "@/types/dataModel";
import type { AppBundle, AppView, DraftView } from "@/types/platform";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const appId = computed(() => String(route.params.appId));
const app = ref<AppView | null>(null);
const draft = ref<DraftView | null>(null);
const bundle = ref<AppBundle | null>(null);
const schemas = ref<DataSchema[]>([]);
const savedSnapshot = ref("[]");
const loading = ref(true);
const saving = ref(false);
const reloading = ref(false);

const activeSchemaIndex = ref(0);
const activeEntityId = ref<string | null>(null);
const activeEntityTab = ref("fields");

const publishOpen = ref(false);
const publishing = ref(false);
const publishMessage = ref("");
const publishForce = ref(false);

const issuesOpen = ref(false);
const jsonOpen = ref(false);

const schemaDialogOpen = ref(false);
const schemaEditingIndex = ref(-1);
const schemaDraft = ref<DataSchema | null>(null);
const schemaForm = reactive({ key: "", name: "", version: 1, description: "" });

const fieldOpen = ref(false);
const fieldIndex = ref(-1);
const fieldDraft = ref<DataField | null>(null);
const refEntityId = ref("");
const defaultValueText = ref("");
const uploadAcceptText = ref("");
const fieldError = ref("");

const relationOpen = ref(false);
const relationIndex = ref(-1);
const relationDraft = ref<DataRelation | null>(null);
const relationToEntityId = ref("");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultBundle(): AppBundle {
  return {
    protocolVersion: "0.1",
    tenantId: sessionStore.tenantId,
    app: {
      id: app.value?.id ?? "",
      key: app.value?.key ?? "",
      name: app.value?.name ?? "",
      description: app.value?.description ?? ""
    },
    artifacts: {
      dataSchemas: [],
      uiSchemas: [],
      logicSchemas: []
    }
  } as AppBundle;
}

const dataSchemas = computed<DataSchema[]>(() => schemas.value);
const activeSchema = computed<DataSchema | null>(() => dataSchemas.value[activeSchemaIndex.value] ?? null);
const entities = computed<DataEntity[]>(() => activeSchema.value?.entities ?? []);
const activeEntity = computed<DataEntity | null>(
  () => entities.value.find((entity) => entity.id === activeEntityId.value) ?? null
);

const dirty = computed(() => JSON.stringify(schemas.value) !== savedSnapshot.value);
const issues = computed(() => validateDataSchemas(schemas.value));
const errorCount = computed(() => issues.value.filter((issue) => issue.level === "error").length);
const warningCount = computed(() => issues.value.filter((issue) => issue.level === "warning").length);

const totalFieldCount = computed(() =>
  entities.value.reduce((total, entity) => total + entity.fields.length, 0)
);
const columnFieldCount = computed(
  () => activeEntity.value?.fields.filter((field) => field.storage === "column").length ?? 0
);
const jsonbFieldCount = computed(
  () => activeEntity.value?.fields.filter((field) => field.storage !== "column").length ?? 0
);

const fieldTypeGroups = computed(() => {
  const groups = new Map<string, typeof FIELD_TYPES>();
  for (const item of FIELD_TYPES) {
    const items = groups.get(item.group) ?? [];
    items.push(item);
    groups.set(item.group, items);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
});

const fieldUiHints = computed(() => fieldDraft.value?.uiHints ?? {});
const fieldSemantic = computed<SemanticDef>(() => fieldDraft.value?.semantic ?? {});
const uploadHints = computed<UploadHints>(() => fieldDraft.value?.uiHints?.upload ?? {});
const arrayItemType = computed<ValueTypeRef>(() => fieldDraft.value?.itemType ?? { type: "string" });
const enumValues = computed(() => fieldDraft.value?.enumValues ?? []);
const isUploadField = computed(
  () => !!fieldDraft.value && UPLOAD_FIELD_TYPES.includes(fieldDraft.value.type)
);

const refTargetFields = computed(() => {
  const target = findEntity(entities.value, refEntityId.value);
  return target?.fields ?? [];
});

const relationLocalFields = computed(() =>
  (activeEntity.value?.fields ?? []).filter((field) => field.storage === "column")
);
const relationTargetEntity = computed(() => findEntity(entities.value, relationToEntityId.value) ?? null);
const relationTargetFields = computed(() => relationTargetEntity.value?.fields ?? []);

const softDelete = computed(() => activeEntity.value?.storage.softDelete ?? null);
const timestamps = computed(() => activeEntity.value?.storage.timestamps ?? null);

function applyDraft(next: DraftView, preserveSelection = false) {
  const previousEntityId = activeEntityId.value;
  draft.value = next;
  bundle.value = next.bundle ?? bundle.value ?? defaultBundle();
  if (!bundle.value.artifacts) bundle.value.artifacts = {};
  const raw = bundle.value.artifacts.dataSchemas;
  schemas.value = Array.isArray(raw) ? clone(raw as DataSchema[]) : [];
  savedSnapshot.value = JSON.stringify(schemas.value);

  if (preserveSelection && previousEntityId) {
    const index = schemas.value.findIndex((schema) =>
      schema.entities.some((entity) => entity.id === previousEntityId)
    );
    if (index >= 0) {
      activeSchemaIndex.value = index;
      activeEntityId.value = previousEntityId;
      return;
    }
  }
  if (activeSchemaIndex.value >= schemas.value.length) activeSchemaIndex.value = 0;
  activeEntityId.value = schemas.value[0]?.entities[0]?.id ?? null;
}

async function load() {
  loading.value = true;
  try {
    const [appView, draftView] = await Promise.all([
      platformApi.getApp(appId.value),
      platformApi.getDraft(appId.value)
    ]);
    app.value = appView;
    applyDraft(draftView);
  } catch (error) {
    ElMessage.error(errorMessage(error));
    router.replace("/");
  } finally {
    loading.value = false;
  }
}

async function reloadDraft() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        "当前数据模型有未保存的修改，重新加载会丢弃这些修改。",
        "重新加载草稿",
        { type: "warning", confirmButtonText: "丢弃并加载", cancelButtonText: "取消" }
      );
    } catch {
      return;
    }
  }
  reloading.value = true;
  try {
    const next = await platformApi.getDraft(appId.value);
    applyDraft(next);
    ElMessage.success("草稿已重新加载");
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    reloading.value = false;
  }
}

async function handleConflict() {
  try {
    await ElMessageBox.confirm(
      "草稿已被其他人修改。加载最新草稿会覆盖当前编辑内容，建议先导出 JSON 备份。",
      "草稿冲突",
      { type: "warning", confirmButtonText: "加载最新草稿", cancelButtonText: "保留当前内容" }
    );
  } catch {
    return;
  }
  try {
    applyDraft(await platformApi.getDraft(appId.value));
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

async function saveDraft() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const nextBundle = clone(bundle.value ?? defaultBundle());
    if (!nextBundle.artifacts) nextBundle.artifacts = {};
    nextBundle.artifacts.dataSchemas = clone(schemas.value);
    const next = await platformApi.saveDraft(appId.value, nextBundle, draft.value.revision);
    applyDraft(next, true);
    app.value = await platformApi.getApp(appId.value);
    ElMessage.success(`数据模型已保存 · r${next.revision}`);
  } catch (error) {
    if (error instanceof ApiError && error.code === "draft_conflict") {
      await handleConflict();
    } else {
      ElMessage.error(errorMessage(error));
    }
  } finally {
    saving.value = false;
  }
}

function selectEntity(entityId: string) {
  activeEntityId.value = entityId;
}

watch(activeSchemaIndex, () => {
  const current = entities.value.some((entity) => entity.id === activeEntityId.value);
  if (!current) activeEntityId.value = entities.value[0]?.id ?? null;
});

watch(
  () => fieldDraft.value?.type,
  (type) => {
    if (!type || !fieldDraft.value) return;
    if ((type === "ref" || type === "enum") && fieldDraft.value.storage === "jsonb") {
      fieldDraft.value.storage = "column";
    }
  }
);

watch(
  () => fieldDraft.value?.unique,
  (unique) => {
    if (unique && fieldDraft.value && fieldDraft.value.storage !== "column") {
      fieldDraft.value.storage = "column";
    }
  }
);

watch(refEntityId, (id) => {
  const target = findEntity(entities.value, id);
  if (!fieldDraft.value || !target) return;
  if (!fieldDraft.value.refField || !findField(target, fieldDraft.value.refField)) {
    fieldDraft.value.refField = target.titleField ?? target.fields[0]?.key ?? "";
  }
});

function openNewSchema() {
  const ordinal = schemas.value.length + 1;
  const starter = createStarterSchema(app.value?.key ?? "app", app.value?.name ?? "应用", ordinal);
  starter.key = uniqueKey(schemas.value.map((schema) => schema.key), starter.key);
  schemaDraft.value = starter;
  schemaEditingIndex.value = -1;
  schemaForm.key = starter.key;
  schemaForm.name = starter.name;
  schemaForm.version = starter.version;
  schemaForm.description = starter.description ?? "";
  schemaDialogOpen.value = true;
}

function openSchemaSettings() {
  const schema = activeSchema.value;
  if (!schema) return;
  schemaDraft.value = null;
  schemaEditingIndex.value = activeSchemaIndex.value;
  schemaForm.key = schema.key;
  schemaForm.name = schema.name;
  schemaForm.version = schema.version;
  schemaForm.description = schema.description ?? "";
  schemaDialogOpen.value = true;
}

function submitSchema() {
  const key = schemaForm.key.trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) {
    ElMessage.warning("数据域 key 必须是小写 snake_case");
    return;
  }
  if (!schemaForm.name.trim()) {
    ElMessage.warning("数据域名称不能为空");
    return;
  }
  if (!Number.isInteger(schemaForm.version) || schemaForm.version < 1) {
    ElMessage.warning("版本号必须是 >= 1 的整数");
    return;
  }
  const duplicate = schemas.value.some(
    (schema, index) => index !== schemaEditingIndex.value && schema.key === key
  );
  if (duplicate) {
    ElMessage.warning("数据域 key 已存在");
    return;
  }

  if (schemaEditingIndex.value < 0) {
    const created = schemaDraft.value ?? createStarterSchema(key, schemaForm.name, schemas.value.length + 1);
    created.key = key;
    created.name = schemaForm.name.trim();
    created.version = schemaForm.version;
    created.description = schemaForm.description.trim();
    schemas.value.push(created);
    activeSchemaIndex.value = schemas.value.length - 1;
    activeEntityId.value = created.entities[0]?.id ?? null;
    ElMessage.success("数据域已创建");
  } else {
    const schema = schemas.value[schemaEditingIndex.value];
    if (!schema) return;
    schema.key = key;
    schema.name = schemaForm.name.trim();
    schema.version = schemaForm.version;
    schema.description = schemaForm.description.trim();
    ElMessage.success("数据域设置已更新");
  }
  schemaDialogOpen.value = false;
}

async function removeSchema() {
  if (schemaEditingIndex.value < 0) return;
  const schema = schemas.value[schemaEditingIndex.value];
  if (!schema) return;
  try {
    await ElMessageBox.confirm(
      `删除数据域「${schema.name}」及其 ${schema.entities.length} 个实体？保存草稿后才会同步到服务端。`,
      "删除数据域",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  schemas.value.splice(schemaEditingIndex.value, 1);
  activeSchemaIndex.value = Math.max(0, Math.min(activeSchemaIndex.value, schemas.value.length - 1));
  activeEntityId.value = schemas.value[activeSchemaIndex.value]?.entities[0]?.id ?? null;
  schemaDialogOpen.value = false;
  ElMessage.success("数据域已删除");
}

function addEntity() {
  const schema = activeSchema.value;
  if (!schema) return;
  const existingKeys = schema.entities.map((entity) => entity.key);
  const existingTables = schema.entities
    .map((entity) => entity.tableName)
    .filter((name): name is string => !!name);
  const entity = createStarterEntity(
    uniqueKey(existingKeys, "entity"),
    "新实体",
    existingTables
  );
  schema.entities.push(entity);
  activeEntityId.value = entity.id;
  activeEntityTab.value = "fields";
}

function entityUsage(entity: DataEntity): { fields: number; relations: number } {
  let fields = 0;
  let relations = 0;
  for (const candidate of entities.value) {
    if (candidate.id === entity.id) continue;
    for (const field of candidate.fields) {
      if (resolveEntityId(field.refEntity) === entity.id) fields += 1;
    }
    for (const relation of candidate.relations ?? []) {
      if (resolveEntityId(relation.from?.entityRef) === entity.id) relations += 1;
      if (resolveEntityId(relation.to?.entityRef) === entity.id) relations += 1;
    }
  }
  return { fields, relations };
}

async function removeEntity(entity: DataEntity) {
  const schema = activeSchema.value;
  if (!schema) return;
  const usage = entityUsage(entity);
  const hint = usage.fields || usage.relations
    ? `\n\n该实体被 ${usage.fields} 个引用字段、${usage.relations} 个关系使用，删除后会一并清理这些引用。`
    : "";
  try {
    await ElMessageBox.confirm(
      `删除实体「${entity.name}」及其 ${entity.fields.length} 个字段？${hint}`,
      "删除实体",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }

  for (const candidate of schema.entities) {
    if (candidate.id === entity.id) continue;
    candidate.relations = (candidate.relations ?? []).filter(
      (relation) =>
        resolveEntityId(relation.from?.entityRef) !== entity.id &&
        resolveEntityId(relation.to?.entityRef) !== entity.id
    );
    for (const field of candidate.fields) {
      if (resolveEntityId(field.refEntity) === entity.id) {
        delete field.refEntity;
        delete field.refField;
      }
    }
  }

  schema.entities = schema.entities.filter((candidate) => candidate.id !== entity.id);
  if (activeEntityId.value === entity.id) {
    activeEntityId.value = schema.entities[0]?.id ?? null;
  }
  ElMessage.success("实体已删除");
}

function setEntityTableName() {
  const entity = activeEntity.value;
  const schema = activeSchema.value;
  if (!entity || !schema) return;
  const existingTables = schema.entities
    .filter((candidate) => candidate.id !== entity.id)
    .map((candidate) => candidate.tableName)
    .filter((name): name is string => !!name);
  entity.tableName = tableNameFor(entity.key, existingTables);
}

function prepareFieldDraft(field: DataField) {
  const next = clone(field);
  next.uiHints = { ...(next.uiHints ?? {}) };
  if (UPLOAD_FIELD_TYPES.includes(next.type)) {
    next.uiHints.upload = {
      maxSizeMb: 10,
      accept: [],
      multiple: false,
      ...(next.uiHints.upload ?? {})
    };
  }
  next.semantic = { ...(next.semantic ?? {}) };
  if (!Array.isArray(next.semantic.synonyms)) next.semantic.synonyms = [];
  if (!Array.isArray(next.semantic.examples)) next.semantic.examples = [];
  if (next.type === "enum" && (!next.enumValues || next.enumValues.length === 0)) {
    next.enumValues = [{ value: "option_1", label: "选项一" }];
  }
  if (next.type === "array" && !next.itemType) next.itemType = { type: "string" };
  fieldDraft.value = next;
  refEntityId.value = resolveEntityId(next.refEntity) ?? "";
  defaultValueText.value =
    next.defaultValue === undefined
      ? ""
      : typeof next.defaultValue === "string"
        ? next.defaultValue
        : JSON.stringify(next.defaultValue);
  uploadAcceptText.value = (next.uiHints.upload?.accept ?? []).join(", ");
  fieldError.value = "";
}

function openAddField() {
  const entity = activeEntity.value;
  if (!entity) return;
  const key = uniqueKey(
    entity.fields.map((field) => field.key),
    `field_${entity.fields.length + 1}`
  );
  fieldIndex.value = -1;
  prepareFieldDraft(createStarterField("string", key, "新字段"));
  fieldOpen.value = true;
}

function openEditField(field: DataField, index: number) {
  fieldIndex.value = index;
  prepareFieldDraft(field);
  fieldOpen.value = true;
}

function submitField() {
  const entity = activeEntity.value;
  const field = fieldDraft.value;
  if (!entity || !field) return;
  fieldError.value = "";

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(field.key)) {
    fieldError.value = "字段 key 必须是小写 snake_case，且以字母开头";
    return;
  }
  if (!field.label.trim()) {
    fieldError.value = "字段显示名称不能为空";
    return;
  }
  const duplicate = entity.fields.some(
    (candidate, index) => index !== fieldIndex.value && candidate.key === field.key
  );
  if (duplicate) {
    fieldError.value = `字段 key ${field.key} 已存在`;
    return;
  }

  if (field.type === "enum") {
    const values = field.enumValues ?? [];
    if (!values.length) {
      fieldError.value = "枚举字段至少需要一个选项";
      return;
    }
    const seen = new Set<string>();
    for (const value of values) {
      const raw = `${value.value ?? ""}`.trim();
      if (!raw) {
        fieldError.value = "枚举值不能为空";
        return;
      }
      if (seen.has(raw)) {
        fieldError.value = `枚举值 ${raw} 重复`;
        return;
      }
      seen.add(raw);
      value.value = raw;
      if (!value.label?.trim()) value.label = raw;
    }
  }

  if (field.type === "ref") {
    const target = findEntity(entities.value, refEntityId.value);
    if (!target) {
      fieldError.value = "请选择引用目标实体";
      return;
    }
    field.refEntity = entityRef(target);
    if (!field.refField) field.refField = target.titleField ?? target.fields[0]?.key ?? "";
  }

  const defaultValue = defaultValueText.value.trim();
  if (defaultValue) {
    try {
      field.defaultValue = JSON.parse(defaultValue);
    } catch {
      field.defaultValue = defaultValue;
    }
  } else {
    delete field.defaultValue;
  }

  field.uiHints = field.uiHints ?? {};
  if (UPLOAD_FIELD_TYPES.includes(field.type)) {
    const accept = uploadAcceptText.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    field.uiHints.upload = {
      ...(field.uiHints.upload ?? {}),
      ...(accept.length ? { accept } : {})
    };
    if (!accept.length) delete field.uiHints.upload.accept;
  } else {
    delete field.uiHints.upload;
  }

  if (field.type !== "enum") {
    delete field.enumValues;
    delete field.enumRef;
  }
  if (field.type !== "ref") {
    delete field.refEntity;
    delete field.refField;
  }
  if (field.type !== "array") {
    delete field.itemType;
  }
  if (field.type !== "formula") {
    delete field.formula;
  }

  const semantic = field.semantic ?? {};
  if (!semantic.intent?.trim()) delete semantic.intent;
  if (!semantic.description?.trim()) delete semantic.description;
  if (!semantic.businessDomain?.trim()) delete semantic.businessDomain;
  if (!semantic.synonyms?.length) delete semantic.synonyms;
  if (!semantic.examples?.length) delete semantic.examples;
  if (Object.keys(semantic).length) field.semantic = semantic;
  else delete field.semantic;

  if (field.storage === "column" && field.type === "string" && !field.length) {
    field.length = 64;
  }

  if (fieldIndex.value < 0) entity.fields.push(field);
  else entity.fields.splice(fieldIndex.value, 1, field);
  fieldOpen.value = false;
  ElMessage.success(fieldIndex.value < 0 ? "字段已添加" : "字段已更新");
}

function addEnumValue() {
  const list = enumValues.value;
  list.push({ value: `option_${list.length + 1}`, label: `选项${list.length + 1}` });
}

function removeEnumValue(index: number) {
  enumValues.value.splice(index, 1);
}

async function removeField(field: DataField) {
  const entity = activeEntity.value;
  const schema = activeSchema.value;
  if (!entity || !schema) return;
  const relatedRelations = entity.relations?.filter(
    (relation) => relation.from?.fieldKey === field.key || relation.to?.fieldKey === field.key
  ).length ?? 0;
  try {
    await ElMessageBox.confirm(
      `删除字段「${field.label}」？${relatedRelations ? `\n\n同时会删除 ${relatedRelations} 个以该字段为端点的关系。` : ""}`,
      "删除字段",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  entity.relations = (entity.relations ?? []).filter(
    (relation) => relation.from?.fieldKey !== field.key && relation.to?.fieldKey !== field.key
  );
  for (const candidate of schema.entities) {
    for (const otherField of candidate.fields) {
      if (candidate.id !== entity.id && otherField.refField === field.key) {
        const target = resolveEntityByRef(otherField.refEntity, schema.entities);
        if (target?.id === entity.id) otherField.refField = undefined;
      }
    }
  }
  entity.fields = entity.fields.filter((candidate) => candidate.id !== field.id);
  if (entity.titleField === field.key) entity.titleField = entity.fields[0]?.key;
  ElMessage.success("字段已删除");
}

function relationTargetId(relation: DataRelation | null): string {
  return resolveEntityId(relation?.to?.entityRef) ?? "";
}

function openAddRelation() {
  const entity = activeEntity.value;
  if (!entity) return;
  const fromField =
    entity.fields.find((field) => field.storage === "column" && field.key !== "id") ??
    entity.fields.find((field) => field.storage === "column") ??
    entity.fields[0];
  const target = entities.value.find((candidate) => candidate.id !== entity.id) ?? null;
  const key = uniqueKey(
    (entity.relations ?? []).map((relation) => relation.key),
    `rel_${target?.key ?? "target"}`
  );
  const relation: DataRelation = {
    id: ulid(),
    key,
    name: target ? `关联${target.name}` : "",
    type: "manyToOne",
    from: { entityRef: entityRef(entity), fieldKey: fromField?.key ?? "" },
    to: {
      entityRef: target ? entityRef(target) : { kind: "entity" },
      fieldKey: target?.titleField ?? target?.fields[0]?.key ?? ""
    },
    onDelete: "restrict",
    onUpdate: "restrict",
    required: false,
    lazy: true
  };
  relationDraft.value = relation;
  relationToEntityId.value = target?.id ?? "";
  relationIndex.value = -1;
  relationOpen.value = true;
}

function openEditRelation(relation: DataRelation, index: number) {
  relationDraft.value = clone(relation);
  if (!relationDraft.value.from) {
    relationDraft.value.from = { entityRef: entityRef(activeEntity.value as DataEntity), fieldKey: "" };
  }
  if (!relationDraft.value.to) {
    relationDraft.value.to = { entityRef: { kind: "entity" }, fieldKey: "" };
  }
  relationToEntityId.value = relationTargetId(relation);
  relationIndex.value = index;
  relationOpen.value = true;
}

function submitRelation() {
  const entity = activeEntity.value;
  const relation = relationDraft.value;
  if (!entity || !relation) return;

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(relation.key)) {
    ElMessage.warning("关系 key 必须是小写 snake_case");
    return;
  }
  const duplicate = (entity.relations ?? []).some(
    (candidate, index) => index !== relationIndex.value && candidate.key === relation.key
  );
  if (duplicate) {
    ElMessage.warning(`关系 key ${relation.key} 已存在`);
    return;
  }

  const fromField = findField(entity, relation.from.fieldKey);
  if (!fromField) {
    ElMessage.warning("请选择本实体的关联字段");
    return;
  }
  if (fromField.storage !== "column") {
    ElMessage.warning(`关联字段 ${fromField.key} 必须使用 storage=column`);
    return;
  }

  const target = findEntity(entities.value, relationToEntityId.value);
  if (!target) {
    ElMessage.warning("请选择目标实体");
    return;
  }
  const toField = findField(target, relation.to.fieldKey);
  if (!toField) {
    ElMessage.warning("请选择目标实体的关联字段");
    return;
  }

  relation.from = { entityRef: entityRef(entity), fieldKey: fromField.key };
  relation.to = { entityRef: entityRef(target), fieldKey: toField.key };
  if (relation.type === "manyToMany" && !relation.join?.tableName) {
    relation.join = {
      tableName: `rel_${entity.key}_${target.key}`.slice(0, 63),
      fromColumn: `${entity.key}_id`,
      toColumn: `${target.key}_id`
    };
  }
  relation.onDelete = relation.onDelete ?? "restrict";
  relation.onUpdate = relation.onUpdate ?? "restrict";
  if (relation.required === undefined) relation.required = false;
  if (relation.lazy === undefined) relation.lazy = true;

  entity.relations = entity.relations ?? [];
  if (relationIndex.value < 0) entity.relations.push(relation);
  else entity.relations.splice(relationIndex.value, 1, relation);
  relationOpen.value = false;
  ElMessage.success(relationIndex.value < 0 ? "关系已添加" : "关系已更新");
}

async function removeRelation(relation: DataRelation) {
  const entity = activeEntity.value;
  if (!entity) return;
  try {
    await ElMessageBox.confirm(`删除关系「${relation.name || relation.key}」？`, "删除关系", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  entity.relations = (entity.relations ?? []).filter((candidate) => candidate.id !== relation.id);
  ElMessage.success("关系已删除");
}

function endpointLabel(endpoint: DataRelation["from"] | undefined): string {
  if (!endpoint) return "—";
  const entity = resolveEntityByRef(endpoint.entityRef, entities.value);
  const field = findField(entity, endpoint.fieldKey);
  return `${entity?.name ?? "未知实体"}.${field?.label ?? endpoint.fieldKey}`;
}

function setSoftDelete(enabled: boolean) {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.storage.softDelete) {
    entity.storage.softDelete = { enabled, column: "deleted_at", type: "timestamp" };
  } else {
    entity.storage.softDelete.enabled = enabled;
  }
}

function setSoftDeleteColumn(value: string) {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.storage.softDelete) entity.storage.softDelete = { enabled: true };
  entity.storage.softDelete.column = value;
}

function setSoftDeleteType(value: "timestamp" | "boolean") {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.storage.softDelete) entity.storage.softDelete = { enabled: true };
  entity.storage.softDelete.type = value;
}

function enableTimestamps() {
  const entity = activeEntity.value;
  if (!entity) return;
  entity.storage.timestamps = {
    createdAt: "created_at",
    updatedAt: "updated_at",
    createdBy: "created_by",
    updatedBy: "updated_by"
  };
}

function setTimestamp(
  key: keyof NonNullable<EntityStorage["timestamps"]>,
  value: string
) {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.storage.timestamps) {
    entity.storage.timestamps = {};
  }
  entity.storage.timestamps[key] = value || null;
}

function setTenantColumn(value: string) {
  const entity = activeEntity.value;
  if (!entity) return;
  entity.storage.tenantColumn = value.trim() ? value.trim() : null;
}

function setPartitionBy(value: string) {
  const entity = activeEntity.value;
  if (!entity) return;
  entity.storage.partitionBy = value.trim() ? value.trim() : null;
}

function setEntitySemantic(key: "intent" | "description" | "businessDomain", value: string) {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.semantic) entity.semantic = { synonyms: [], tags: [] };
  entity.semantic[key] = value;
}

function setEntityList(key: "synonyms" | "tags", value: string[]) {
  const entity = activeEntity.value;
  if (!entity) return;
  if (!entity.semantic) entity.semantic = { synonyms: [], tags: [] };
  entity.semantic[key] = value;
}

function openPublish() {
  if (dirty.value) {
    ElMessage.warning("数据模型有未保存的修改，请先保存草稿再发布");
    return;
  }
  if (errorCount.value > 0) {
    issuesOpen.value = true;
    ElMessage.error(`存在 ${errorCount.value} 个校验错误，请先修复`);
    return;
  }
  publishMessage.value = `发布 v${(app.value?.current_version ?? 0) + 1}`;
  publishForce.value = false;
  publishOpen.value = true;
}

async function submitPublish() {
  if (!publishMessage.value.trim()) {
    ElMessage.warning("请填写发布说明");
    return;
  }
  publishing.value = true;
  try {
    const detail = await platformApi.publish(appId.value, publishMessage.value.trim(), {
      force: publishForce.value
    });
    publishOpen.value = false;
    if (detail.unchanged) {
      ElMessage.info("内容与当前版本一致，未生成新版本；如需留档可勾选「强制发布」");
    } else {
      ElMessage.success(`已发布 v${detail.version_no}`);
    }
    app.value = await platformApi.getApp(appId.value);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    publishing.value = false;
  }
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(prettyJson(schemas.value));
    ElMessage.success("JSON 已复制到剪贴板");
  } catch {
    ElMessage.warning("复制失败，请在弹窗中手动选择");
  }
}

onMounted(load);

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      "数据模型有未保存的修改，离开页面会丢失。",
      "离开页面",
      { type: "warning", confirmButtonText: "离开", cancelButtonText: "留下" }
    );
    return true;
  } catch {
    return false;
  }
});
</script>
<template>
  <div class="mx-auto max-w-[1440px]">
    <button class="mb-4 flex items-center gap-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-700" @click="router.push(`/apps/${appId}`)">
      <span>←</span> 应用详情
    </button>

    <div v-if="loading" class="rounded-2xl border border-slate-200 bg-white p-10">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else-if="app">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div class="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-lg font-semibold text-white shadow-lg shadow-sky-200">
            {{ app.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-[21px] font-semibold tracking-tight text-slate-900">{{ app.name }} · 数据模型</h1>
              <span class="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Schema 驱动</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span class="font-mono">{{ app.key }}</span>
              <span>·</span>
              <span>当前版本 {{ app.current_version ? `v${app.current_version}` : "未发布" }}</span>
              <span>·</span>
              <span>草稿 r{{ draft?.revision ?? app.draft_revision }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <el-button :loading="reloading" @click="reloadDraft">重新加载</el-button>
          <el-button @click="jsonOpen = true">查看 JSON</el-button>
          <el-button @click="issuesOpen = true">
            校验
            <span
              v-if="errorCount || warningCount"
              class="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
              :class="errorCount ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'"
            >
              {{ errorCount ? errorCount : warningCount }}
            </span>
          </el-button>
          <el-button type="primary" plain :loading="saving" @click="saveDraft">保存草稿</el-button>
          <el-button type="primary" @click="openPublish">发布</el-button>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3">
        <span class="text-[11.5px] font-medium text-slate-500">数据域</span>
        <el-select
          v-if="schemas.length"
          v-model="activeSchemaIndex"
          class="!w-[280px]"
          placeholder="选择数据域"
        >
          <el-option
            v-for="(schema, index) in schemas"
            :key="schema.id"
            :label="`${schema.name} · ${schema.key}`"
            :value="index"
          />
        </el-select>
        <span v-else class="text-[12px] text-slate-400">尚未创建</span>
        <el-button text size="small" :disabled="!schemas.length" @click="openSchemaSettings">设置</el-button>
        <el-button text size="small" @click="openNewSchema">+ 新建数据域</el-button>

        <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />

        <span class="inline-flex items-center gap-1.5 text-[11.5px]" :class="dirty ? 'text-amber-600' : 'text-slate-400'">
          <span class="h-1.5 w-1.5 rounded-full" :class="dirty ? 'bg-amber-500' : 'bg-emerald-400'" />
          {{ dirty ? "有未保存修改" : "已与服务器同步" }}
        </span>
        <span class="text-[11.5px] text-slate-300">·</span>
        <span class="text-[11.5px] text-slate-400">最近保存 {{ formatDateTime(app.draft_updated_at) }}</span>

        <div class="ml-auto flex items-center gap-2 text-[11.5px] text-slate-400">
          <span class="rounded-md bg-slate-100 px-2 py-1">实体 {{ entities.length }}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1">字段 {{ totalFieldCount }}</span>
          <span
            class="rounded-md px-2 py-1"
            :class="errorCount ? 'bg-rose-50 text-rose-600' : warningCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'"
          >
            {{ errorCount ? `${errorCount} 错误` : warningCount ? `${warningCount} 提示` : "校验通过" }}
          </span>
        </div>
      </div>

      <div v-if="!schemas.length" class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-2xl text-sky-500">▤</div>
        <h2 class="mt-4 text-[16px] font-semibold text-slate-800">从数据模型开始搭建应用</h2>
        <p class="mx-auto mt-2 max-w-lg text-[12.5px] leading-relaxed text-slate-500">
          数据模型是页面、表单、审批流与出码的共同底座。先定义实体与字段，后续页面设计器会直接引用这里的字段。
        </p>
        <el-button class="mt-5" type="primary" @click="openNewSchema">新建数据域</el-button>
      </div>

      <div v-else class="mt-5 grid items-start gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p class="text-[12.5px] font-medium text-slate-700">实体</p>
              <p class="mt-0.5 text-[10.5px] text-slate-400">{{ activeSchema?.name }}</p>
            </div>
            <el-button text size="small" @click="addEntity">+ 新建</el-button>
          </div>

          <div class="scroll-thin max-h-[620px] space-y-1 overflow-auto p-2">
            <button
              v-for="entity in entities"
              :key="entity.id"
              class="w-full rounded-xl px-3 py-2.5 text-left transition"
              :class="entity.id === activeEntityId ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-slate-50'"
              @click="selectEntity(entity.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[12.5px] font-medium" :class="entity.id === activeEntityId ? 'text-indigo-700' : 'text-slate-700'">
                  {{ entity.name }}
                </span>
                <span
                  v-if="entity.enabled === false"
                  class="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400"
                >
                  停用
                </span>
              </div>
              <p class="mt-0.5 truncate font-mono text-[10.5px] text-slate-400">{{ entity.tableName || entity.key }}</p>
              <p class="mt-1 text-[10.5px] text-slate-400">{{ entity.fields.length }} 字段 · {{ (entity.relations ?? []).length }} 关系</p>
            </button>

            <p v-if="!entities.length" class="px-3 py-8 text-center text-[11.5px] text-slate-400">
              该数据域还没有实体
            </p>
          </div>

          <div class="border-t border-slate-100 p-2">
            <el-button class="w-full" size="small" @click="addEntity">+ 新建实体</el-button>
          </div>
        </aside>

        <section v-if="activeEntity" class="space-y-4">
          <div class="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-[16px] font-semibold text-slate-900">{{ activeEntity.name }}</h2>
                  <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500">{{ activeEntity.key }}</span>
                  <span class="rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[10.5px] text-sky-700">{{ activeEntity.tableName || "未设置表名" }}</span>
                </div>
                <p class="mt-1 text-[11.5px] text-slate-400">
                  物理表由平台注入租户列与软删除列；字段默认进 JSONB，需要索引/唯一/外键时再上提为真实列。
                </p>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 text-[11.5px] text-slate-500">
                  <el-switch :model-value="activeEntity.enabled !== false" size="small" @update:model-value="activeEntity.enabled = $event" />
                  启用
                </div>
                <el-button text type="danger" size="small" @click="removeEntity(activeEntity)">删除实体</el-button>
              </div>
            </div>

            <div class="mt-4 grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
              <label class="block">
                <span class="mb-1 block text-[11px] font-medium text-slate-500">实体名称</span>
                <el-input v-model="activeEntity.name" maxlength="64" />
              </label>
              <label class="block">
                <span class="mb-1 block text-[11px] font-medium text-slate-500">实体 Key</span>
                <el-input v-model="activeEntity.key" maxlength="63" />
              </label>
              <label class="block">
                <span class="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  物理表名
                  <button class="text-[10px] font-normal text-indigo-500 hover:text-indigo-700" @click="setEntityTableName">按 key 生成</button>
                </span>
                <el-input v-model="activeEntity.tableName" maxlength="63" placeholder="biz_xxx" />
              </label>
              <label class="block">
                <span class="mb-1 block text-[11px] font-medium text-slate-500">标题字段</span>
                <el-select v-model="activeEntity.titleField" clearable filterable class="w-full" placeholder="选择用于展示的字段">
                  <el-option
                    v-for="field in activeEntity.fields"
                    :key="field.key"
                    :label="`${field.label} · ${field.key}`"
                    :value="field.key"
                  />
                </el-select>
              </label>
            </div>
          </div>          <div class="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <el-tabs v-model="activeEntityTab" class="px-5 pt-1">
              <el-tab-pane :label="`字段 ${activeEntity.fields.length}`" name="fields">
                <div class="flex flex-wrap items-center gap-2 pb-3">
                  <span class="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                    真实列 {{ columnFieldCount }} · JSONB {{ jsonbFieldCount }}
                  </span>
                  <span class="text-[11.5px] text-slate-400">
                    默认写入 {{ activeEntity.storage.jsonbColumn || "ext" }} 列，修改字段不需要 DDL
                  </span>
                  <div class="ml-auto">
                    <el-button size="small" type="primary" @click="openAddField">+ 新增字段</el-button>
                  </div>
                </div>

                <el-table :data="activeEntity.fields" size="small" class="w-full" empty-text="还没有字段">
                  <el-table-column label="字段" min-width="190">
                    <template #default="{ row }">
                      <div class="leading-tight">
                        <div class="flex items-center gap-1.5">
                          <span class="text-[12.5px] font-medium text-slate-700">{{ row.label }}</span>
                          <span v-if="row.required" class="rounded bg-rose-50 px-1 py-0.5 text-[9px] text-rose-500">必填</span>
                          <span v-if="row.sensitive" class="rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-600">敏感</span>
                        </div>
                        <p class="mt-0.5 font-mono text-[10.5px] text-slate-400">{{ row.key }}</p>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" width="170">
                    <template #default="{ row }">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[12px] text-slate-600">{{ fieldTypeLabel(row.type) }}</span>
                        <span
                          class="rounded px-1 py-0.5 text-[9.5px]"
                          :class="row.storage === 'column' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'"
                        >
                          {{ storageLabel(row.storage) }}
                        </span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="约束" min-width="160">
                    <template #default="{ row }">
                      <div class="flex flex-wrap gap-1">
                        <span v-if="row.unique" class="rounded bg-violet-50 px-1 py-0.5 text-[9.5px] text-violet-600">唯一</span>
                        <span v-if="row.searchable" class="rounded bg-sky-50 px-1 py-0.5 text-[9.5px] text-sky-600">可搜索</span>
                        <span v-if="row.sortable" class="rounded bg-teal-50 px-1 py-0.5 text-[9.5px] text-teal-600">可排序</span>
                        <span v-if="row.immutable" class="rounded bg-slate-100 px-1 py-0.5 text-[9.5px] text-slate-500">不可改</span>
                        <span v-if="!row.unique && !row.searchable && !row.sortable && !row.immutable" class="text-[11px] text-slate-300">—</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="表单" width="110">
                    <template #default="{ row }">
                      <span class="text-[11px] text-slate-500">
                        {{ row.uiHints?.hideInForm ? "隐藏" : "显示" }}
                        <span class="text-slate-300">/</span>
                        {{ row.uiHints?.colSpan ? `${row.uiHints.colSpan} 格` : "默认" }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="110" align="right">
                    <template #default="{ row, $index }">
                      <el-button text size="small" @click="openEditField(row, $index)">编辑</el-button>
                      <el-button text size="small" type="danger" @click="removeField(row)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane :label="`关系 ${(activeEntity.relations ?? []).length}`" name="relations">
                <div class="flex flex-wrap items-center gap-2 pb-3">
                  <span class="text-[11.5px] text-slate-400">
                    关系端点字段必须是真实列（storage=column），用于外键与关联查询
                  </span>
                  <div class="ml-auto">
                    <el-button size="small" type="primary" :disabled="entities.length < 2" @click="openAddRelation">+ 新增关系</el-button>
                  </div>
                </div>

                <el-table :data="activeEntity.relations ?? []" size="small" class="w-full" empty-text="还没有关系">
                  <el-table-column label="关系" min-width="150">
                    <template #default="{ row }">
                      <div class="leading-tight">
                        <p class="text-[12.5px] font-medium text-slate-700">{{ row.name || row.key }}</p>
                        <p class="mt-0.5 font-mono text-[10.5px] text-slate-400">{{ row.key }}</p>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" width="90">
                    <template #default="{ row }">
                      <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] text-indigo-600">{{ relationTypeLabel(row.type) }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="端点" min-width="240">
                    <template #default="{ row }">
                      <div class="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                        <span class="truncate">{{ endpointLabel(row.from) }}</span>
                        <span class="text-slate-300">→</span>
                        <span class="truncate">{{ endpointLabel(row.to) }}</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="删除策略" width="100">
                    <template #default="{ row }">
                      <span class="text-[11px] text-slate-500">{{ row.onDelete || "restrict" }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="110" align="right">
                    <template #default="{ row, $index }">
                      <el-button text size="small" @click="openEditRelation(row, $index)">编辑</el-button>
                      <el-button text size="small" type="danger" @click="removeRelation(row)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>

                <p v-if="entities.length < 2" class="mt-3 text-[11.5px] text-slate-400">
                  至少需要两个实体才能建立关系。
                </p>
              </el-tab-pane>              <el-tab-pane label="存储" name="storage">
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  class="!mb-4"
                  title="JSONB 优先，按需上提"
                  description="storage=jsonb 的字段写入 ext 列，新增/修改字段无需 DDL。需要唯一约束、外键、排序或聚合时，将字段切换为 storage=column。"
                />

                <div class="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">主键名</span>
                    <el-input v-model="activeEntity.storage.primaryKey" placeholder="id" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">主键类型</span>
                    <el-select v-model="activeEntity.storage.idType" class="w-full">
                      <el-option label="ULID（推荐）" value="ulid" />
                      <el-option label="UUID" value="uuid" />
                      <el-option label="BigInt" value="bigint" />
                      <el-option label="Snowflake" value="snowflake" />
                    </el-select>
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">JSONB 列名</span>
                    <el-input v-model="activeEntity.storage.jsonbColumn" placeholder="ext" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">租户列</span>
                    <el-input
                      :model-value="activeEntity.storage.tenantColumn ?? ''"
                      placeholder="tenant_id（留空表示全局表）"
                      @update:model-value="setTenantColumn"
                    />
                  </label>
                </div>

                <div class="mt-5 grid gap-4 lg:grid-cols-2">
                  <div class="rounded-xl border border-slate-200 p-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-[12.5px] font-medium text-slate-700">软删除</p>
                        <p class="mt-0.5 text-[11px] text-slate-400">平台自动过滤已删除数据</p>
                      </div>
                      <el-switch
                        :model-value="softDelete?.enabled ?? false"
                        @update:model-value="setSoftDelete"
                      />
                    </div>
                    <div v-if="softDelete" class="mt-3 grid grid-cols-2 gap-3">
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">删除标记列</span>
                        <el-input
                          :model-value="softDelete.column ?? ''"
                          @update:model-value="setSoftDeleteColumn"
                        />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">标记类型</span>
                        <el-select
                          :model-value="softDelete.type ?? 'timestamp'"
                          class="w-full"
                          @update:model-value="setSoftDeleteType"
                        >
                          <el-option label="时间戳" value="timestamp" />
                          <el-option label="布尔" value="boolean" />
                        </el-select>
                      </label>
                    </div>
                  </div>

                  <div class="rounded-xl border border-slate-200 p-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-[12.5px] font-medium text-slate-700">审计字段</p>
                        <p class="mt-0.5 text-[11px] text-slate-400">创建/更新时间与操作人列</p>
                      </div>
                      <el-button v-if="!timestamps" text size="small" @click="enableTimestamps">启用</el-button>
                    </div>
                    <div v-if="timestamps" class="mt-3 grid grid-cols-2 gap-3">
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">created_at</span>
                        <el-input :model-value="timestamps.createdAt ?? ''" @update:model-value="setTimestamp('createdAt', $event)" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">updated_at</span>
                        <el-input :model-value="timestamps.updatedAt ?? ''" @update:model-value="setTimestamp('updatedAt', $event)" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">created_by</span>
                        <el-input :model-value="timestamps.createdBy ?? ''" @update:model-value="setTimestamp('createdBy', $event)" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-[10.5px] text-slate-400">updated_by</span>
                        <el-input :model-value="timestamps.updatedBy ?? ''" @update:model-value="setTimestamp('updatedBy', $event)" />
                      </label>
                    </div>
                  </div>
                </div>

                <div class="mt-5 grid gap-4 lg:grid-cols-2">
                  <div class="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <p class="text-[12.5px] font-medium text-slate-700">乐观锁</p>
                      <p class="mt-0.5 text-[11px] text-slate-400">追加 version 列，更新时自动带版本条件</p>
                    </div>
                    <el-switch v-model="activeEntity.storage.optimisticLock" />
                  </div>
                  <div class="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <p class="text-[12.5px] font-medium text-slate-700">审计日志</p>
                      <p class="mt-0.5 text-[11px] text-slate-400">所有写入落审计表，审批场景建议开启</p>
                    </div>
                    <el-switch v-model="activeEntity.storage.auditLog" />
                  </div>
                </div>

                <div class="mt-5 grid gap-4 md:grid-cols-2">
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">分区列</span>
                    <el-input
                      :model-value="activeEntity.storage.partitionBy ?? ''"
                      placeholder="如 semester_year（留空表示不分区）"
                      @update:model-value="setPartitionBy"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">备注</span>
                    <el-input v-model="activeEntity.storage.comment" placeholder="存储策略说明" />
                  </label>
                </div>
              </el-tab-pane>

              <el-tab-pane label="语义" name="semantic">
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  class="!mb-4"
                  title="语义描述供 AI 与检索使用，不参与运行时"
                  description="填写业务意图、同义词与业务域后，AI 生成页面、表单与流程时可以更准确地理解字段含义。"
                />
                <div class="grid gap-4 md:grid-cols-2">
                  <label class="block md:col-span-2">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">业务意图</span>
                    <el-input
                      :model-value="activeEntity.semantic?.intent ?? ''"
                      type="textarea"
                      :rows="2"
                      maxlength="500"
                      show-word-limit
                      placeholder="这个实体在业务中代表什么？"
                      @update:model-value="setEntitySemantic('intent', $event)"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">业务域</span>
                    <el-input
                      :model-value="activeEntity.semantic?.businessDomain ?? ''"
                      placeholder="如 学籍 / 考勤 / 报销"
                      @update:model-value="setEntitySemantic('businessDomain', $event)"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">同义词</span>
                    <el-select
                      :model-value="activeEntity.semantic?.synonyms ?? []"
                      multiple
                      filterable
                      allow-create
                      default-first-option
                      class="w-full"
                      placeholder="输入后回车添加"
                      @update:model-value="setEntityList('synonyms', $event)"
                    />
                  </label>
                  <label class="block md:col-span-2">
                    <span class="mb-1 block text-[11px] font-medium text-slate-500">补充说明</span>
                    <el-input
                      :model-value="activeEntity.semantic?.description ?? ''"
                      type="textarea"
                      :rows="2"
                      placeholder="业务规则、数据来源或使用限制"
                      @update:model-value="setEntitySemantic('description', $event)"
                    />
                  </label>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </section>

        <section v-else class="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <p class="text-[13px] text-slate-500">该数据域还没有实体</p>
          <el-button class="mt-4" type="primary" @click="addEntity">新建实体</el-button>
        </section>
      </div>
    </template>    <el-dialog v-model="schemaDialogOpen" :title="schemaEditingIndex < 0 ? '新建数据域' : '数据域设置'" width="520px">
      <el-form label-position="top">
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="数据域 Key" required>
            <el-input v-model="schemaForm.key" maxlength="63" placeholder="leave_core" />
          </el-form-item>
          <el-form-item label="版本号" required>
            <el-input-number v-model="schemaForm.version" :min="1" :max="9999" controls-position="right" class="!w-full" />
          </el-form-item>
        </div>
        <el-form-item label="数据域名称" required>
          <el-input v-model="schemaForm.name" maxlength="64" placeholder="请假数据模型" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="schemaForm.description" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex items-center">
          <el-button v-if="schemaEditingIndex >= 0" type="danger" plain @click="removeSchema">删除数据域</el-button>
          <span class="flex-1" />
          <el-button @click="schemaDialogOpen = false">取消</el-button>
          <el-button type="primary" @click="submitSchema">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="fieldOpen"
      :title="fieldIndex < 0 ? '新增字段' : `编辑字段 · ${fieldDraft?.key ?? ''}`"
      width="820px"
      top="4vh"
      destroy-on-close
    >
      <template v-if="fieldDraft">
        <el-form label-position="top">
          <div class="grid grid-cols-2 gap-x-4">
            <el-form-item label="字段 Key" required>
              <el-input v-model="fieldDraft.key" maxlength="63" placeholder="snake_case" />
            </el-form-item>
            <el-form-item label="显示名称" required>
              <el-input v-model="fieldDraft.label" maxlength="64" />
            </el-form-item>
            <el-form-item label="字段类型">
              <el-select v-model="fieldDraft.type" class="w-full" filterable>
                <el-option-group v-for="group in fieldTypeGroups" :key="group.label" :label="group.label">
                  <el-option v-for="item in group.items" :key="item.value" :label="item.label" :value="item.value" />
                </el-option-group>
              </el-select>
            </el-form-item>
            <el-form-item label="存储方式">
              <el-select v-model="fieldDraft.storage" class="w-full">
                <el-option label="JSONB（无需迁移）" value="jsonb" />
                <el-option label="真实列（可索引/唯一/外键）" value="column" />
              </el-select>
            </el-form-item>
          </div>

          <el-alert
            v-if="fieldDraft.storage === 'jsonb'"
            type="info"
            :closable="false"
            show-icon
            class="!mb-4"
            title="JSONB 字段写入实体 ext 列，新增/修改无需 DDL；唯一约束、外键与排序请切换为真实列。"
          />

          <div class="grid grid-cols-2 gap-x-4 md:grid-cols-4">
            <el-form-item v-if="fieldDraft.type === 'string' || fieldDraft.type === 'text'" label="长度">
              <el-input-number v-model="fieldDraft.length" :min="1" :max="1000000" controls-position="right" class="!w-full" />
            </el-form-item>
            <el-form-item v-if="fieldDraft.type === 'decimal'" label="精度">
              <el-input-number v-model="fieldDraft.precision" :min="1" :max="38" controls-position="right" class="!w-full" />
            </el-form-item>
            <el-form-item v-if="fieldDraft.type === 'decimal'" label="小数位">
              <el-input-number v-model="fieldDraft.scale" :min="0" :max="18" controls-position="right" class="!w-full" />
            </el-form-item>
            <el-form-item v-if="fieldDraft.storage === 'column'" label="列类型（可选）">
              <el-input v-model="fieldDraft.columnType" placeholder="varchar(64)" />
            </el-form-item>
          </div>

          <div v-if="fieldDraft.type === 'enum'" class="mb-4 rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-[12.5px] font-medium text-slate-700">枚举选项</p>
                <p class="mt-0.5 text-[11px] text-slate-400">value 写入数据库，label 用于页面展示</p>
              </div>
              <el-button size="small" @click="addEnumValue">+ 添加选项</el-button>
            </div>
            <div class="mt-3 space-y-2">
              <div v-for="(value, index) in enumValues" :key="index" class="grid grid-cols-[1fr_1fr_120px_56px] items-center gap-2">
                <el-input v-model="value.value" placeholder="值" />
                <el-input v-model="value.label" placeholder="显示名" />
                <el-input v-model="value.color" placeholder="颜色（可选）" />
                <el-button text type="danger" @click="removeEnumValue(index)">删除</el-button>
              </div>
              <p v-if="!enumValues.length" class="text-[11.5px] text-slate-400">还没有选项</p>
            </div>
          </div>

          <div v-if="fieldDraft.type === 'ref'" class="mb-4 grid grid-cols-2 gap-4">
            <el-form-item label="目标实体">
              <el-select v-model="refEntityId" filterable class="w-full" placeholder="选择实体">
                <el-option
                  v-for="entity in entities"
                  :key="entity.id"
                  :label="`${entity.name} · ${entity.key}`"
                  :value="entity.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="展示字段">
              <el-select v-model="fieldDraft.refField" clearable filterable class="w-full" placeholder="默认使用标题字段">
                <el-option
                  v-for="field in refTargetFields"
                  :key="field.key"
                  :label="`${field.label} · ${field.key}`"
                  :value="field.key"
                />
              </el-select>
            </el-form-item>
          </div>

          <div v-if="fieldDraft.type === 'array'" class="mb-4 grid grid-cols-2 gap-4">
            <el-form-item label="元素类型">
              <el-select v-model="arrayItemType.type" class="w-full">
                <el-option v-for="item in FIELD_TYPES" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="格式（可选）">
              <el-input v-model="arrayItemType.format" placeholder="email / url / phone" />
            </el-form-item>
          </div>

          <div v-if="isUploadField" class="mb-4 grid grid-cols-3 gap-4">
            <el-form-item label="单文件上限 (MB)">
              <el-input-number v-model="uploadHints.maxSizeMb" :min="1" :max="2048" controls-position="right" class="!w-full" />
            </el-form-item>
            <el-form-item label="接受类型">
              <el-input v-model="uploadAcceptText" placeholder="image/*, application/pdf" />
            </el-form-item>
            <el-form-item label="多文件">
              <el-switch v-model="uploadHints.multiple" />
            </el-form-item>
          </div>

          <div v-if="fieldDraft.type === 'formula'" class="mb-4">
            <el-form-item label="公式表达式">
              <el-input v-model="fieldDraft.formula" placeholder="如 amount * 0.13" />
            </el-form-item>
          </div>

          <div class="mb-4 rounded-xl border border-slate-200 p-4">
            <p class="mb-3 text-[12px] font-medium text-slate-700">约束与行为</p>
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
              <el-checkbox v-model="fieldDraft.required">必填</el-checkbox>
              <el-checkbox v-model="fieldDraft.unique">唯一</el-checkbox>
              <el-checkbox v-model="fieldDraft.searchable">可搜索</el-checkbox>
              <el-checkbox v-model="fieldDraft.sortable">可排序</el-checkbox>
              <el-checkbox v-model="fieldDraft.immutable">创建后不可改</el-checkbox>
              <el-checkbox v-model="fieldDraft.sensitive">敏感字段</el-checkbox>
              <el-checkbox v-model="fieldUiHints.hideInList">列表隐藏</el-checkbox>
              <el-checkbox v-model="fieldUiHints.hideInForm">表单隐藏</el-checkbox>
            </div>
            <div class="mt-3">
              <span class="mb-1 block text-[10.5px] text-slate-400">默认值（JSON 或纯文本）</span>
              <el-input v-model="defaultValueText" placeholder='如 "待审批" / 0 / true' />
            </div>
          </div>

          <div class="mb-4 rounded-xl border border-slate-200 p-4">
            <p class="mb-3 text-[12px] font-medium text-slate-700">表单与列表提示</p>
            <div class="grid grid-cols-2 gap-x-4 md:grid-cols-3">
              <el-form-item label="控件">
                <el-select v-model="fieldUiHints.widget" filterable allow-create clearable class="w-full" placeholder="默认控件">
                  <el-option label="el-input" value="el-input" />
                  <el-option label="el-input-number" value="el-input-number" />
                  <el-option label="el-select" value="el-select" />
                  <el-option label="el-date-picker" value="el-date-picker" />
                  <el-option label="el-switch" value="el-switch" />
                  <el-option label="el-upload" value="el-upload" />
                  <el-option label="el-radio-group" value="el-radio-group" />
                </el-select>
              </el-form-item>
              <el-form-item label="占位提示">
                <el-input v-model="fieldUiHints.placeholder" />
              </el-form-item>
              <el-form-item label="宽度（24 栅格）">
                <el-input-number v-model="fieldUiHints.colSpan" :min="1" :max="24" controls-position="right" class="!w-full" />
              </el-form-item>
              <el-form-item label="帮助文本" class="md:col-span-2">
                <el-input v-model="fieldUiHints.help" placeholder="显示在表单控件下方" />
              </el-form-item>
              <div class="flex items-end pb-1">
                <el-checkbox v-model="fieldUiHints.copyable">可复制</el-checkbox>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-4">
            <p class="mb-3 text-[12px] font-medium text-slate-700">语义（供 AI 使用）</p>
            <div class="grid grid-cols-2 gap-4">
              <el-form-item label="业务意图" class="col-span-2">
                <el-input v-model="fieldSemantic.intent" maxlength="500" placeholder="这个字段代表什么业务含义？" />
              </el-form-item>
              <el-form-item label="同义词">
                <el-select v-model="fieldSemantic.synonyms" multiple filterable allow-create default-first-option class="w-full" placeholder="回车添加" />
              </el-form-item>
              <el-form-item label="示例值">
                <el-select v-model="fieldSemantic.examples" multiple filterable allow-create default-first-option class="w-full" placeholder="回车添加" />
              </el-form-item>
            </div>
          </div>

          <el-alert v-if="fieldError" class="!mt-4" type="error" :closable="false" show-icon :title="fieldError" />
        </el-form>
      </template>
      <template #footer>
        <el-button @click="fieldOpen = false">取消</el-button>
        <el-button type="primary" @click="submitField">{{ fieldIndex < 0 ? "添加字段" : "保存字段" }}</el-button>
      </template>
    </el-dialog>    <el-dialog
      v-model="relationOpen"
      :title="relationIndex < 0 ? '新增关系' : '编辑关系'"
      width="620px"
    >
      <template v-if="relationDraft">
        <el-form label-position="top">
          <div class="grid grid-cols-2 gap-4">
            <el-form-item label="关系 Key" required>
              <el-input v-model="relationDraft.key" maxlength="63" placeholder="rel_department" />
            </el-form-item>
            <el-form-item label="显示名称">
              <el-input v-model="relationDraft.name" maxlength="64" placeholder="所属部门" />
            </el-form-item>
            <el-form-item label="关系类型">
              <el-select v-model="relationDraft.type" class="w-full">
                <el-option v-for="item in RELATION_TYPES" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="本实体字段" required>
              <el-select v-model="relationDraft.from.fieldKey" filterable class="w-full" placeholder="选择真实列字段">
                <el-option
                  v-for="field in relationLocalFields"
                  :key="field.key"
                  :label="`${field.label} · ${field.key}`"
                  :value="field.key"
                />
              </el-select>
            </el-form-item>
          </div>

          <div class="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p class="mb-3 text-[12px] font-medium text-slate-700">目标端点</p>
            <div class="grid grid-cols-2 gap-4">
              <el-form-item label="目标实体" required>
                <el-select v-model="relationToEntityId" filterable class="w-full" placeholder="选择实体">
                  <el-option
                    v-for="entity in entities"
                    :key="entity.id"
                    :label="`${entity.name} · ${entity.key}`"
                    :value="entity.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="目标字段" required>
                <el-select v-model="relationDraft.to.fieldKey" filterable class="w-full" placeholder="选择真实列字段">
                  <el-option
                    v-for="field in relationTargetFields"
                    :key="field.key"
                    :label="`${field.label} · ${field.key}`"
                    :value="field.key"
                  />
                </el-select>
              </el-form-item>
            </div>
            <p v-if="relationDraft.type === 'manyToMany'" class="mt-1 text-[11px] text-slate-400">
              多对多关系保存时会自动生成中间表配置。
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <el-form-item label="删除策略">
              <el-select v-model="relationDraft.onDelete" class="w-full">
                <el-option label="restrict（禁止删除）" value="restrict" />
                <el-option label="cascade（级联删除）" value="cascade" />
                <el-option label="setNull（置空）" value="setNull" />
                <el-option label="none（不处理）" value="none" />
              </el-select>
            </el-form-item>
            <el-form-item label="更新策略">
              <el-select v-model="relationDraft.onUpdate" class="w-full">
                <el-option label="restrict" value="restrict" />
                <el-option label="cascade" value="cascade" />
                <el-option label="setNull" value="setNull" />
                <el-option label="none" value="none" />
              </el-select>
            </el-form-item>
          </div>

          <div class="flex items-center gap-6">
            <el-checkbox v-model="relationDraft.required">必填关系</el-checkbox>
            <el-checkbox v-model="relationDraft.lazy">懒加载</el-checkbox>
          </div>

          <el-alert
            v-if="!relationLocalFields.length"
            class="!mt-4"
            type="warning"
            :closable="false"
            show-icon
            title="本实体还没有真实列字段，请先把关联字段切换为 storage=column"
          />
        </el-form>
      </template>
      <template #footer>
        <el-button @click="relationOpen = false">取消</el-button>
        <el-button type="primary" @click="submitRelation">{{ relationIndex < 0 ? "添加关系" : "保存关系" }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="issuesOpen" title="Schema 校验" width="760px" top="6vh">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-600">错误 {{ errorCount }}</span>
        <span class="rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-700">提示 {{ warningCount }}</span>
        <span class="text-[11.5px] text-slate-400">错误会阻止发布；草稿仍可保存</span>
      </div>

      <div v-if="!issues.length" class="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center text-[12.5px] text-emerald-700">
        没有发现结构问题，可以发布。
      </div>

      <div v-else class="scroll-thin mt-4 max-h-[58vh] space-y-2 overflow-auto pr-1">
        <div
          v-for="(issue, index) in issues"
          :key="`${issue.where}-${index}`"
          class="rounded-lg border px-3.5 py-2.5"
          :class="issue.level === 'error' ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/40'"
        >
          <div class="flex items-center gap-2">
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="issue.level === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'"
            >
              {{ issue.level === "error" ? "错误" : "提示" }}
            </span>
            <span class="font-mono text-[10.5px] text-slate-500">{{ issue.where }}</span>
          </div>
          <p class="mt-1 text-[12px] leading-relaxed text-slate-700">{{ issue.message }}</p>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="jsonOpen" title="数据模型 JSON" width="880px" top="5vh">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11.5px] text-slate-400">artifacts.dataSchemas · 仅展示当前数据模型</span>
        <el-button size="small" @click="copyJson">复制 JSON</el-button>
      </div>
      <pre class="scroll-thin max-h-[64vh] overflow-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11.5px] leading-relaxed text-slate-200">{{ prettyJson(schemas) }}</pre>
    </el-dialog>

    <el-dialog v-model="publishOpen" title="发布数据模型" width="500px">
      <p class="mb-4 text-[12px] leading-relaxed text-slate-500">
        发布后会生成新版本快照。页面设计器、出码引擎与运行时都将读取这一版本。
      </p>
      <el-form label-position="top">
        <el-form-item label="发布说明" required>
          <el-input v-model="publishMessage" maxlength="200" show-word-limit />
        </el-form-item>
        <el-checkbox v-model="publishForce">强制发布（内容未变化时也生成新版本）</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="publishOpen = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>