<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import type { ColumnSpec, FieldSpec, ResourceSpec } from "@/generated/schema";
import { can } from "@/lib/access";
import { ApiError } from "@/lib/http";
import { cellText, optionLabel, tagStyleOf, tagTypeOf } from "@/lib/format";
import { refLabel, resolveRefLabel } from "@/lib/refs";
import { useCrudPage } from "@/lib/useCrudPage";
import DynamicField from "./DynamicField.vue";

const props = defineProps<{ resource: ResourceSpec }>();

const {
  rows,
  total,
  page,
  size,
  loading,
  filters,
  load,
  search,
  reset,
  onSortChange,
  fetchOne,
  create,
  update,
  remove
} = useCrudPage(props.resource);

const canCreate = computed(() => can(props.resource.key, "create"));
const canUpdate = computed(() => can(props.resource.key, "update"));
const canDelete = computed(() => can(props.resource.key, "delete"));
const actionWidth = computed(() => (canUpdate.value && canDelete.value ? 140 : canUpdate.value || canDelete.value ? 90 : 0));

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const dialogTitle = computed(() => (dialogMode.value === "create" ? "新建" : "编辑") + props.resource.title);
const saving = ref(false);
const formRef = ref<FormInstance>();
const model = reactive<Record<string, unknown>>({});
const currentId = ref("");
const currentVersion = ref<number | null>(null);

const fields = computed<FieldSpec[]>(() =>
  dialogMode.value === "create" ? props.resource.createFields : props.resource.editFields
);

const rules = computed<FormRules>(() => {
  const out: FormRules = {};
  const target = out as Record<string, unknown>;
  for (const field of fields.value) {
    const list: Record<string, unknown>[] = [];
    if (field.required) {
      list.push({
        required: true,
        message: "请填写" + field.label,
        trigger: field.widget === "input" || field.widget === "textarea" ? "blur" : "change"
      });
    }
    if (field.minLength) {
      list.push({ min: field.minLength, message: field.label + "至少 " + field.minLength + " 个字符", trigger: "blur" });
    }
    if (field.maxLength) {
      list.push({ max: field.maxLength, message: field.label + "最多 " + field.maxLength + " 个字符", trigger: "blur" });
    }
    if (field.min !== undefined || field.max !== undefined) {
      const parts: string[] = [];
      if (field.min !== undefined) parts.push("不小于 " + field.min);
      if (field.max !== undefined) parts.push("不大于 " + field.max);
      list.push({ type: "number", message: field.label + parts.join("，"), trigger: "change" });
    }
    if (field.pattern) {
      list.push({ pattern: new RegExp(field.pattern), message: field.label + "格式不正确", trigger: "blur" });
    }
    if (list.length > 0) target[field.key] = list;
  }
  return out;
});

function emptyValueOf(field: FieldSpec): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.widget === "checkbox" || field.widget === "multiselect" || field.widget === "tags") return [];
  return undefined;
}

function resetModel(nextFields: FieldSpec[], source?: Record<string, unknown>): void {
  for (const key of Object.keys(model)) delete model[key];
  for (const field of nextFields) {
    const raw = source?.[field.key];
    model[field.key] = raw === undefined ? emptyValueOf(field) : raw;
  }
}

async function openCreate(): Promise<void> {
  dialogMode.value = "create";
  currentId.value = "";
  currentVersion.value = null;
  resetModel(props.resource.createFields);
  dialogVisible.value = true;
  await nextTick();
  formRef.value?.clearValidate();
}

async function openEdit(row: Record<string, unknown>): Promise<void> {
  const id = String(row[props.resource.primaryKey] ?? "");
  if (!id) {
    ElMessage.error("当前行缺少主键，无法编辑");
    return;
  }
  try {
    const full = await fetchOne(id);
    dialogMode.value = "edit";
    currentId.value = id;
    currentVersion.value = typeof full.version === "number" ? full.version : null;
    resetModel(props.resource.editFields, full);
    dialogVisible.value = true;
    await nextTick();
    formRef.value?.clearValidate();
  } catch (reason) {
    const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
    ElMessage.error(error.message);
  }
}

function payloadOf(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields.value) {
    if (dialogMode.value === "edit" && field.readonly) continue;
    const value = model[field.key];
    if (value === undefined) continue;
    out[field.key] = value;
  }
  if (dialogMode.value === "edit" && props.resource.optimisticLock) {
    out.version = currentVersion.value;
  }
  return out;
}

function validationText(error: ApiError): string {
  const details = Array.isArray(error.details) ? error.details : [];
  const parts = details.map((detail) => {
    if (detail && typeof detail === "object") {
      const item = detail as { field?: string; message?: string };
      return (item.field ? item.field + "：" : "") + (item.message ?? "");
    }
    return String(detail);
  });
  return parts.filter(Boolean).join("；") || error.message;
}

function handleWriteError(reason: unknown): void {
  const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
  if (error.isVersionConflict) {
    void ElMessageBox.alert("这条数据已被其他人修改。请刷新列表后重新编辑。", "版本冲突", {
      type: "warning"
    })
      .then(() => {
        dialogVisible.value = false;
        void load();
      })
      .catch(() => undefined);
    return;
  }
  if (error.code === "validation_failed") {
    ElMessage.error(validationText(error));
    return;
  }
  ElMessage.error(error.message || "保存失败");
}

async function submit(): Promise<void> {
  if (formRef.value) {
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;
  }
  saving.value = true;
  try {
    if (dialogMode.value === "create") {
      await create(payloadOf());
      ElMessage.success("已创建");
    } else {
      await update(currentId.value, payloadOf());
      ElMessage.success("已保存");
    }
    dialogVisible.value = false;
    await load();
  } catch (reason) {
    handleWriteError(reason);
  } finally {
    saving.value = false;
  }
}

async function removeRow(row: Record<string, unknown>): Promise<void> {
  const id = String(row[props.resource.primaryKey] ?? "");
  if (!id) return;
  try {
    await ElMessageBox.confirm("删除「" + rowLabel(row) + "」后不会出现在列表里。", "确认删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  try {
    await remove(id);
    ElMessage.success("已删除");
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (reason) {
    const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
    ElMessage.error(error.message);
  }
}

function rowLabel(row: Record<string, unknown>): string {
  const raw = row[props.resource.titleField];
  if (raw !== undefined && raw !== null && raw !== "") return String(raw);
  const first = props.resource.columns[0];
  if (first) return cellText(first, row[first.key]);
  return String(row[props.resource.primaryKey] ?? "");
}

const refColumns = computed<ColumnSpec[]>(() =>
  props.resource.columns.filter((column) => column.format === "ref" && !!column.refEntity)
);

async function resolveRefs(): Promise<void> {
  const jobs: Promise<string>[] = [];
  for (const column of refColumns.value) {
    for (const row of rows.value) {
      const id = row[column.key];
      if (typeof id === "string" && id) {
        jobs.push(resolveRefLabel(column.refEntity ?? "", id, column.refField ?? "name"));
      }
    }
  }
  if (jobs.length > 0) await Promise.all(jobs);
}

watch(rows, () => {
  void resolveRefs();
});

function onPageChange(): void {
  void load();
}

function onSizeChange(): void {
  page.value = 1;
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="space-y-4">
    <section class="lcp-card p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold text-slate-900">{{ resource.title }}</h1>
            <el-tag v-if="resource.optimisticLock" size="small" type="warning">乐观锁</el-tag>
            <el-tag v-if="resource.softDelete" size="small" type="info">软删除</el-tag>
            <el-tag v-if="resource.sensitiveFields.length > 0" size="small" type="danger">
              敏感字段 {{ resource.sensitiveFields.length }}
            </el-tag>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{ resource.subtitle }}</p>
          <p class="mt-2 font-mono text-[11px] text-slate-400">{{ resource.base }}</p>
        </div>
        <div class="flex items-center gap-2">
          <el-button plain @click="load">刷新</el-button>
          <el-button v-if="canCreate" type="primary" @click="openCreate">新建</el-button>
        </div>
      </div>
    </section>

    <section v-if="resource.filters.length > 0" class="lcp-card p-4">
      <el-form :inline="true" @submit.prevent>
        <el-form-item v-for="filter in resource.filters" :key="filter.key" :label="filter.label">
          <el-input
            v-if="filter.widget === 'input'"
            v-model="filters[filter.key]"
            clearable
            :placeholder="filter.placeholder ?? '精确匹配'"
            class="w-48"
            @keyup.enter="search"
          />
          <el-select
            v-else-if="filter.widget === 'select'"
            v-model="filters[filter.key]"
            clearable
            :placeholder="filter.placeholder ?? '全部'"
            class="w-40"
          >
            <el-option
              v-for="option in filter.options ?? []"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="filter.widget === 'date'"
            v-model="filters[filter.key]"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="filter.placeholder ?? '选择日期'"
            class="w-40"
          />
          <el-date-picker
            v-else-if="filter.widget === 'datetime'"
            v-model="filters[filter.key]"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            :placeholder="filter.placeholder ?? '选择时间'"
            class="w-56"
          />
          <el-input-number
            v-else-if="filter.widget === 'number'"
            v-model="filters[filter.key]"
            :controls="false"
            placeholder="数值"
            class="w-32"
          />
          <el-input v-else v-model="filters[filter.key]" class="w-40" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="lcp-card p-4">
      <el-table
        v-loading="loading"
        :data="rows"
        :row-key="resource.primaryKey"
        stripe
        @sort-change="onSortChange"
      >
        <el-table-column
          v-for="column in resource.columns"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          :align="column.align ?? 'left'"
          :sortable="column.sortable ? 'custom' : false"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag
              v-if="column.format === 'enum'"
              size="small"
              :type="tagTypeOf(column, row[column.key])"
              :style="tagStyleOf(column, row[column.key])"
            >
              {{ optionLabel(column.options, row[column.key]) }}
            </el-tag>
            <span v-else-if="column.format === 'ref'">
              {{ refLabel(column.refEntity ?? '', String(row[column.key] ?? '')) || '—' }}
            </span>
            <span v-else>{{ cellText(column, row[column.key]) }}</span>
          </template>
        </el-table-column>

        <el-table-column v-if="actionWidth > 0" label="操作" fixed="right" :width="actionWidth">
          <template #default="{ row }">
            <el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canDelete" link type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="没有匹配的数据" />
        </template>
      </el-table>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span class="lcp-muted">共 {{ total }} 条 · 第 {{ page }} 页</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="sizes, prev, pager, next"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
      append-to-body
    >
      <el-form ref="formRef" :model="model" :rules="rules" label-position="top">
        <el-row :gutter="16">
          <el-col v-for="field in fields" :key="field.key" :span="field.span">
            <el-form-item :label="field.label" :prop="field.key">
              <DynamicField v-model="model[field.key]" :field="field" :entity="resource.entity" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <p v-if="resource.sensitiveFields.length > 0" class="mt-2 text-xs text-amber-600">
        敏感字段（{{ resource.sensitiveFields.join("、") }}）只在创建时填写；编辑不会回显，也不会覆盖原值。
      </p>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
