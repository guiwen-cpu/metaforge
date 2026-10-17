<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, type UploadRequestOptions } from "element-plus";
import type { UploadSpec } from "@/generated/schema";
import { fileName, fileUrl, formatBytes } from "@/lib/format";
import { uploadToOss } from "@/lib/oss";

const props = defineProps<{
  modelValue: unknown;
  spec: UploadSpec;
  disabled?: boolean;
  entity?: string;
  fieldKey?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [unknown] }>();

interface UploadItem {
  url: string;
  name: string;
}

interface UploadError extends Error {
  status: number;
  method: string;
  url: string;
}

const items = computed<UploadItem[]>(() => {
  const raw = Array.isArray(props.modelValue)
    ? props.modelValue
    : props.modelValue === null || props.modelValue === undefined || props.modelValue === ""
      ? []
      : [props.modelValue];
  return raw
    .map((entry) => ({ url: fileUrl(entry), name: fileName(entry) }))
    .filter((entry) => !!entry.url);
});

const uploading = ref(false);
const percent = ref(0);
const errorText = ref("");

const acceptAttr = computed(() => props.spec.accept.map((ext) => "." + ext).join(","));
const canAddMore = computed(() => props.disabled !== true && items.value.length < props.spec.maxCount);

function commit(url: string): void {
  if (props.spec.multiple) {
    emit("update:modelValue", [...items.value.map((item) => item.url), url]);
  } else {
    emit("update:modelValue", url);
  }
}

function removeAt(index: number): void {
  const next = items.value.map((item) => item.url).filter((_url, position) => position !== index);
  emit("update:modelValue", props.spec.multiple ? next : next[0] ?? null);
}

function validate(file: File): string {
  const lower = file.name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  if (ext && !props.spec.accept.includes(ext)) {
    return "仅支持 " + props.spec.accept.join(" / ");
  }
  if (file.size > props.spec.maxSize) {
    return "文件超过 " + formatBytes(props.spec.maxSize);
  }
  return "";
}

function toUploadError(reason: unknown): UploadError {
  const base = reason instanceof Error ? reason : new Error(String(reason));
  return Object.assign(base, { status: 0, method: "POST", url: "" }) as UploadError;
}

async function customUpload(options: UploadRequestOptions): Promise<void> {
  const file = options.file as File;
  const problem = validate(file);
  if (problem) {
    errorText.value = problem;
    options.onError(toUploadError(problem));
    ElMessage.error(problem);
    return;
  }

  uploading.value = true;
  percent.value = 0;
  errorText.value = "";
  try {
    const uploaded = await uploadToOss(
      file,
      props.spec,
      { entity: props.entity, field: props.fieldKey },
      (value) => {
        percent.value = value;
        options.onProgress({ percent: value } as never);
      }
    );
    commit(uploaded.url);
    options.onSuccess(uploaded as never);
    ElMessage.success("上传完成");
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorText.value = message;
    options.onError(toUploadError(reason));
    ElMessage.error(message);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="w-full">
    <div class="flex flex-wrap items-start gap-3">
      <div
        v-for="(item, index) in items"
        :key="item.url + index"
        class="relative rounded-lg border border-slate-200 bg-slate-50 p-2"
      >
        <el-image
          v-if="spec.kind === 'image'"
          :src="item.url"
          fit="cover"
          class="h-20 w-20 rounded"
          :preview-src-list="[item.url]"
          preview-teleported
        />
        <video
          v-else-if="spec.kind === 'video'"
          :src="item.url"
          controls
          class="h-24 w-40 rounded bg-black"
        />
        <a
          v-else
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          class="flex h-20 w-40 flex-col justify-center gap-1 px-2 text-xs text-slate-600"
        >
          <span class="truncate font-medium">{{ item.name }}</span>
          <span class="text-[11px] text-slate-400">点击下载 / 预览</span>
        </a>
        <el-button
          v-if="!disabled"
          class="absolute -right-2 -top-2"
          size="small"
          circle
          type="danger"
          @click="removeAt(index)"
        >
          ×
        </el-button>
      </div>

      <el-upload
        v-if="canAddMore"
        :show-file-list="false"
        :http-request="customUpload"
        :accept="acceptAttr"
        :multiple="spec.multiple"
        :disabled="uploading"
      >
        <el-button :loading="uploading" plain>
          {{ uploading ? "上传中 " + percent + "%" : "上传文件" }}
        </el-button>
      </el-upload>
    </div>

    <p class="mt-2 text-[11px] text-slate-400">
      支持 {{ spec.accept.join(" / ") }}，单个不超过 {{ formatBytes(spec.maxSize) }}，最多
      {{ spec.maxCount }} 个。
    </p>
    <p v-if="errorText" class="mt-1 text-xs text-red-500">{{ errorText }}</p>
  </div>
</template>
