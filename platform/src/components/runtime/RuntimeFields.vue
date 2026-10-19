<script setup lang="ts">
import { computed } from "vue";
import {
  arrayText,
  fieldDisplay,
  splitList,
  workflowStatusClass,
  workflowStatusMeta
} from "@/lib/runtime";
import type { RuntimeField } from "@/types/runtime";

const props = defineProps<{
  fields: RuntimeField[];
  values: Record<string, unknown>;
  editableKeys?: string[];
}>();

const emit = defineEmits<{
  (event: "change", key: string, value: unknown): void;
}>();

const editableSet = computed(() => new Set(props.editableKeys ?? []));

function canEdit(field: RuntimeField): boolean {
  return editableSet.value.has(field.key);
}

function valueOf(field: RuntimeField): unknown {
  return props.values[field.key];
}

function update(field: RuntimeField, value: unknown): void {
  emit("change", field.key, value);
}

function arrayItems(field: RuntimeField): unknown[] {
  const value = valueOf(field);
  return Array.isArray(value) ? value : [];
}

function textValue(field: RuntimeField): string {
  const value = valueOf(field);
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(field: RuntimeField): number | undefined {
  const value = valueOf(field);
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
}

function dateValue(field: RuntimeField): string | null {
  const value = valueOf(field);
  return value === null || value === undefined || value === "" ? null : String(value);
}

function wide(field: RuntimeField): boolean {
  return field.type === "text" || field.type === "array" || field.type === "video";
}
</script>

<template>
  <div class="grid gap-x-6 gap-y-4 md:grid-cols-2">
    <div
      v-for="field in fields"
      :key="field.key"
      :class="wide(field) ? 'md:col-span-2' : ''"
    >
      <p class="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400">{{ field.label }}</p>

      <el-select
        v-if="canEdit(field) && field.options?.length"
        :model-value="textValue(field)"
        class="w-full"
        @update:model-value="update(field, $event)"
      >
        <el-option
          v-for="option in field.options"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>

      <el-input-number
        v-else-if="canEdit(field) && ['integer', 'decimal', 'number'].includes(field.type)"
        :model-value="numberValue(field)"
        :precision="field.type === 'integer' ? 0 : undefined"
        :step="field.type === 'integer' ? 1 : 0.5"
        controls-position="right"
        class="!w-full"
        @update:model-value="update(field, $event)"
      />

      <el-switch
        v-else-if="canEdit(field) && field.type === 'boolean'"
        :model-value="Boolean(valueOf(field))"
        @update:model-value="update(field, $event)"
      />

      <el-date-picker
        v-else-if="canEdit(field) && field.type === 'datetime'"
        :model-value="dateValue(field)"
        type="datetime"
        value-format="YYYY-MM-DDTHH:mm:ssZ"
        class="!w-full"
        @update:model-value="update(field, $event)"
      />

      <el-date-picker
        v-else-if="canEdit(field) && field.type === 'date'"
        :model-value="dateValue(field)"
        type="date"
        value-format="YYYY-MM-DD"
        class="!w-full"
        @update:model-value="update(field, $event)"
      />

      <el-input
        v-else-if="canEdit(field) && field.type === 'array'"
        :model-value="arrayText(valueOf(field))"
        type="textarea"
        :rows="2"
        placeholder="每行一个值，也支持用逗号分隔"
        @update:model-value="update(field, splitList($event))"
      />

      <el-input
        v-else-if="canEdit(field) && field.type === 'text'"
        :model-value="textValue(field)"
        type="textarea"
        :rows="4"
        @update:model-value="update(field, $event)"
      />

      <el-input
        v-else-if="canEdit(field)"
        :model-value="textValue(field)"
        @update:model-value="update(field, $event)"
      />

      <span
        v-else-if="field.key === 'status'"
        :class="workflowStatusClass(textValue(field))"
      >
        {{ workflowStatusMeta(textValue(field)).label }}
      </span>

      <div
        v-else-if="field.type === 'array'"
        class="flex min-h-[30px] flex-wrap items-center gap-1.5"
      >
        <span
          v-for="(item, index) in arrayItems(field)"
          :key="index"
          class="rounded-md bg-slate-100 px-2 py-1 text-[12px] text-slate-600"
        >
          {{ item }}
        </span>
        <span v-if="arrayItems(field).length === 0" class="text-[13px] text-slate-400">—</span>
      </div>

      <a
        v-else-if="field.type === 'video' && valueOf(field)"
        :href="textValue(field)"
        target="_blank"
        rel="noreferrer"
        class="text-[13px] font-medium text-indigo-600 hover:text-indigo-500"
      >
        查看视频
      </a>

      <p
        v-else
        class="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700"
      >
        {{ fieldDisplay(field, valueOf(field)) }}
      </p>
    </div>
  </div>
</template>
