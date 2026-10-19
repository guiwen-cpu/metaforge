<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ComponentDef } from "@/types/uiModel";
import { componentPreviewHtml } from "@/lib/componentModel";

const props = withDefaults(
  defineProps<{
    component: ComponentDef;
    overrideProps?: Record<string, unknown>;
    minHeight?: number;
    maxHeight?: number;
    interactive?: boolean;
    title?: string;
  }>(),
  {
    overrideProps: () => ({}),
    minHeight: 48,
    maxHeight: 520,
    interactive: false,
    title: ""
  }
);

const emit = defineEmits<{
  event: [name: string, payload: unknown];
  resize: [height: number];
  error: [message: string];
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const frameHeight = ref(Math.max(props.minHeight, 160));
const lastError = ref("");

const srcDoc = computed(() => componentPreviewHtml(props.component, props.overrideProps ?? {}));
const frameTitle = computed(() => props.title || `${props.component.name} 沙箱预览`);

function clamp(height: unknown): number {
  const value = Number(height);
  if (!Number.isFinite(value)) return frameHeight.value;
  return Math.min(props.maxHeight, Math.max(props.minHeight, Math.round(value)));
}

function onMessage(event: MessageEvent) {
  if (!frame.value || event.source !== frame.value.contentWindow) return;
  const data = event.data as Record<string, unknown> | null;
  if (!data || data.source !== "metaforge-sandbox") return;
  if (data.type === "resize") {
    const next = clamp(data.height);
    if (Math.abs(next - frameHeight.value) > 1) {
      frameHeight.value = next;
      emit("resize", next);
    }
    return;
  }
  if (data.type === "event") {
    emit("event", String(data.name ?? ""), data.payload ?? null);
    return;
  }
  if (data.type === "error") {
    lastError.value = String(data.message ?? "组件运行错误");
    emit("error", lastError.value);
  }
}

onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));

watch(
  () => props.component,
  () => {
    lastError.value = "";
    frameHeight.value = Math.max(props.minHeight, 160);
  },
  { deep: true }
);
</script>

<template>
  <div class="mf-sandbox" :class="interactive ? 'is-interactive' : 'is-passive'">
    <iframe
      ref="frame"
      class="mf-sandbox-frame"
      :title="frameTitle"
      :srcdoc="srcDoc"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      loading="lazy"
      :style="{ height: `${frameHeight}px` }"
    />
    <div v-if="lastError" class="mf-sandbox-error">{{ lastError }}</div>
    <div v-if="!interactive" class="mf-sandbox-shield" aria-hidden="true" />
  </div>
</template>

<style scoped>
.mf-sandbox {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  background: #f8fafc;
}
.mf-sandbox-frame {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
.is-passive .mf-sandbox-frame {
  pointer-events: none;
}
.mf-sandbox-shield {
  position: absolute;
  inset: 0;
  background: transparent;
}
.mf-sandbox-error {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border-radius: 8px;
  background: rgba(190, 18, 60, 0.92);
  padding: 6px 9px;
  font-size: 11px;
  color: #fff;
}
</style>