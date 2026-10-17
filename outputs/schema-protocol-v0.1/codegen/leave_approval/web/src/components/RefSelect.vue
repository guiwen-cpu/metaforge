<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { baseOf, resourceByEntity } from "@/generated/schema";
import { request } from "@/lib/http";
import { searchRefOptions, type RefOption } from "@/lib/refs";

const props = defineProps<{
  modelValue: string | null;
  entity: string;
  labelField: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [string | null] }>();

const options = ref<RefOption[]>([]);
const loading = ref(false);

async function load(keyword = ""): Promise<void> {
  if (!props.entity) return;
  loading.value = true;
  try {
    options.value = await searchRefOptions(props.entity, keyword);
  } catch {
    options.value = [];
  } finally {
    loading.value = false;
  }
}

async function ensureCurrent(): Promise<void> {
  const id = props.modelValue;
  if (!id || options.value.some((option) => option.value === id)) return;
  const resource = resourceByEntity(props.entity);
  try {
    const row = await request<Record<string, unknown>>({
      url: baseOf(props.entity) + "/" + encodeURIComponent(id),
      method: "GET"
    });
    const label = String(row[props.labelField] ?? row.name ?? row.title ?? id);
    options.value = [{ value: id, label }, ...options.value];
  } catch {
    options.value = [{ value: id, label: id }, ...options.value];
  }
}

function onChange(next: string | null | undefined): void {
  emit("update:modelValue", next ?? null);
}

function onVisible(visible: boolean): void {
  if (visible) void load();
}

onMounted(async () => {
  await load();
  await ensureCurrent();
});

watch(
  () => props.modelValue,
  () => {
    void ensureCurrent();
  }
);
</script>

<template>
  <el-select
    :model-value="modelValue ?? undefined"
    filterable
    remote
    clearable
    :remote-method="load"
    :loading="loading"
    :disabled="disabled"
    placeholder="搜索并选择"
    class="w-full"
    @update:model-value="onChange"
    @visible-change="onVisible"
  >
    <el-option
      v-for="option in options"
      :key="option.value"
      :label="option.label"
      :value="option.value"
    />
  </el-select>
</template>
