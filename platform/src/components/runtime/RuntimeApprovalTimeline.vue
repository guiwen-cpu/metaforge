<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { RUNTIME_CONTEXT, type RuntimeContextApi } from "@/lib/runtimeContext";
import ProcessTimeline from "@/components/runtime/ProcessTimeline.vue";
import type { TimelineItem } from "@/types/runtime";

const props = defineProps<{ processInstanceId: string }>();

const injectedApi = inject(RUNTIME_CONTEXT);
if (!injectedApi) throw new Error("RuntimeApprovalTimeline 必须在 RuntimePageRenderer 内使用");
const api: RuntimeContextApi = injectedApi;

const items = ref<TimelineItem[]>([]);
const loading = ref(false);
const error = ref("");

async function load(id: string): Promise<void> {
  if (!id) {
    items.value = [];
    error.value = "";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const instance = await runtimeApi.getInstance(api.appId, id);
    items.value = instance.timeline ?? [];
  } catch (cause) {
    items.value = [];
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.processInstanceId,
  (id) => {
    void load(id);
  },
  { immediate: true }
);
</script>

<template>
  <div v-loading="loading" class="min-h-[40px]">
    <el-alert v-if="error" :title="error" type="warning" show-icon :closable="false" />
    <ProcessTimeline v-else-if="items.length" :items="items" />
    <p v-else-if="processInstanceId" class="text-[12px] text-slate-400">暂无流转记录</p>
    <p v-else class="text-[12px] text-slate-400">该单据尚未发起审批流程</p>
  </div>
</template>