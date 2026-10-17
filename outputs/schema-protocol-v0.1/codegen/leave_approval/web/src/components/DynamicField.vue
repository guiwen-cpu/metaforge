<script setup lang="ts">
import { computed, ref } from "vue";
import type { FieldSpec } from "@/generated/schema";
import RefSelect from "./RefSelect.vue";
import UploadField from "./UploadField.vue";

const props = defineProps<{
  field: FieldSpec;
  modelValue: unknown;
  disabled?: boolean;
  entity?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [unknown] }>();

const value = computed({
  get: () => props.modelValue,
  set: (next: unknown) => emit("update:modelValue", next)
});

const listValue = computed<any[]>({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (next: any[]) => emit("update:modelValue", next)
});

const numberValue = computed<number | undefined>(() => {
  const raw = props.modelValue;
  if (raw === null || raw === undefined || raw === "") return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
});

const displayText = computed<string>(() => {
  const raw = props.modelValue;
  if (raw === null || raw === undefined) return "";
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item && typeof item === "object" ? JSON.stringify(item) : String(item)))
      .join("，");
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
});

const jsonDraft = ref(props.modelValue == null ? "" : JSON.stringify(props.modelValue, null, 2));
const jsonError = ref("");

function setValue(next: unknown): void {
  emit("update:modelValue", next);
}

function onJsonInput(text: string): void {
  jsonDraft.value = text;
  if (!text.trim()) {
    jsonError.value = "";
    emit("update:modelValue", null);
    return;
  }
  try {
    emit("update:modelValue", JSON.parse(text));
    jsonError.value = "";
  } catch {
    jsonError.value = "JSON 格式不合法，保存前请修正";
  }
}
</script>

<template>
  <div class="w-full">
    <el-input
      v-if="field.widget === 'readonly' || field.readonly"
      :model-value="displayText"
      disabled
    />

    <el-input
      v-else-if="field.widget === 'input'"
      v-model="value"
      :placeholder="field.placeholder"
      :disabled="disabled"
      clearable
    />

    <el-input
      v-else-if="field.widget === 'textarea'"
      v-model="value"
      type="textarea"
      :rows="field.rows ?? 3"
      :placeholder="field.placeholder"
      :disabled="disabled"
    />

    <el-input-number
      v-else-if="field.widget === 'number'"
      :model-value="numberValue"
      :min="field.min"
      :max="field.max"
      :disabled="disabled"
      class="w-full"
      @update:model-value="setValue"
    />

    <el-switch
      v-else-if="field.widget === 'switch'"
      :model-value="value === true"
      :disabled="disabled"
      @update:model-value="setValue"
    />

    <el-select
      v-else-if="field.widget === 'select'"
      v-model="value"
      :placeholder="field.placeholder ?? '请选择'"
      :disabled="disabled"
      clearable
      class="w-full"
    >
      <el-option
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <el-radio-group
      v-else-if="field.widget === 'radio'"
      v-model="value"
      :disabled="disabled"
    >
      <el-radio
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </el-radio>
    </el-radio-group>

    <el-checkbox-group
      v-else-if="field.widget === 'checkbox'"
      v-model="listValue"
      :disabled="disabled"
    >
      <el-checkbox
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>

    <el-select
      v-else-if="field.widget === 'multiselect'"
      v-model="listValue"
      multiple
      clearable
      :placeholder="field.placeholder ?? '可多选'"
      :disabled="disabled"
      class="w-full"
    >
      <el-option
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <el-select
      v-else-if="field.widget === 'tags'"
      v-model="listValue"
      multiple
      filterable
      allow-create
      default-first-option
      :placeholder="field.placeholder ?? '输入后回车添加'"
      :disabled="disabled"
      class="w-full"
    />

    <el-date-picker
      v-else-if="field.widget === 'date'"
      v-model="value"
      type="date"
      value-format="YYYY-MM-DD"
      :placeholder="field.placeholder ?? '选择日期'"
      :disabled="disabled"
      class="w-full"
    />

    <el-date-picker
      v-else-if="field.widget === 'datetime'"
      v-model="value"
      type="datetime"
      value-format="YYYY-MM-DDTHH:mm:ssZ"
      :placeholder="field.placeholder ?? '选择时间'"
      :disabled="disabled"
      class="w-full"
    />

    <el-time-picker
      v-else-if="field.widget === 'time'"
      v-model="value"
      value-format="HH:mm:ss"
      :placeholder="field.placeholder ?? '选择时间'"
      :disabled="disabled"
      class="w-full"
    />

    <RefSelect
      v-else-if="field.widget === 'ref'"
      :model-value="typeof value === 'string' ? value : null"
      :entity="field.refEntity ?? ''"
      :label-field="field.refField ?? 'name'"
      :disabled="disabled"
      @update:model-value="setValue"
    />

    <UploadField
      v-else-if="field.widget === 'upload'"
      :model-value="value"
      :spec="field.upload!"
      :disabled="disabled"
      :entity="entity ?? ''"
      :field-key="field.key"
      @update:model-value="setValue"
    />

    <div v-else-if="field.widget === 'json'">
      <el-input
        type="textarea"
        :rows="field.rows ?? 6"
        :model-value="jsonDraft"
        :disabled="disabled"
        @update:model-value="onJsonInput"
      />
      <p v-if="jsonError" class="mt-1 text-xs text-red-500">{{ jsonError }}</p>
    </div>

    <el-input
      v-else
      v-model="value"
      :placeholder="field.placeholder"
      :disabled="disabled"
    />

    <p v-if="field.help" class="mt-1 text-xs text-slate-400">{{ field.help }}</p>
    <p v-if="field.sensitive" class="mt-1 text-xs text-amber-600">
      敏感字段：只写不读，保存后不会回显。
    </p>
  </div>
</template>
