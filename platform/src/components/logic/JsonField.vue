<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    rows?: number;
    placeholder?: string;
    monospace?: boolean;
  }>(),
  { rows: 4, placeholder: "", monospace: true }
);

const emit = defineEmits<{ "update:modelValue": [unknown] }>();

const text = ref("");
const error = ref("");
const focused = ref(false);

function pretty(value: unknown): string {
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

watch(
  () => props.modelValue,
  (value) => {
    if (focused.value) return;
    text.value = pretty(value);
    error.value = "";
  },
  { immediate: true, deep: true }
);

function commit() {
  if (!text.value.trim()) {
    error.value = "";
    emit("update:modelValue", undefined);
    return;
  }
  try {
    emit("update:modelValue", JSON.parse(text.value));
    error.value = "";
  } catch {
    error.value = "JSON 格式错误";
  }
}
</script>

<template>
  <div>
    <el-input
      v-model="text"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
      :input-style="monospace ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px' } : undefined"
      @focus="focused = true"
      @blur="focused = false; commit()"
    />
    <p v-if="error" class="mt-1 text-[10.5px] text-rose-500">{{ error }}</p>
  </div>
</template>