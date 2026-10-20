<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch, type Component } from "vue";
import type { ComponentDef } from "@/types/uiModel";
import type { RuntimeContextApi } from "@/lib/runtimeContext";
import {
  loadRemoteComponent,
  RemoteComponentError,
  type LoadedRemoteComponent
} from "@/lib/remoteComponent";

const props = withDefaults(
  defineProps<{
    component: ComponentDef;
    overrideProps?: Record<string, unknown>;
    api: RuntimeContextApi;
    height?: number;
  }>(),
  { overrideProps: () => ({}), height: 96 }
);

const emit = defineEmits<{
  event: [name: string, payload: unknown];
  resize: [height: number];
  error: [message: string];
}>();

const loaded = ref<LoadedRemoteComponent | null>(null);
const loading = ref(false);
const error = ref("");
const frameHeight = ref(Math.max(48, props.height));
let seq = 0;

const versionLabel = computed(() => `v${props.component.version}`);

function normalizeHeight(value: unknown): number {
  const height = Number(value);
  if (!Number.isFinite(height)) return frameHeight.value;
  return Math.min(960, Math.max(48, Math.round(height)));
}

function resize(value: unknown): void {
  const next = normalizeHeight(value);
  if (Math.abs(next - frameHeight.value) <= 1) return;
  frameHeight.value = next;
  emit("resize", next);
}

function contextOf(): Record<string, unknown> {
  return {
    def: props.component,
    props: props.overrideProps,
    emit(name: string, payload?: unknown) {
      emit("event", String(name ?? ""), payload ?? null);
    },
    resize,
    notify: props.api.notify,
    evaluate: props.api.evaluate,
    runHandler(name: string, event: Record<string, unknown> = {}) {
      return props.api.runHandler({ id: "remote-host", component: props.component.name }, "remote", {
        name,
        payload: event
      });
    },
    getState: () => props.api.state,
    setState(patch: Record<string, unknown>) {
      Object.assign(props.api.state, patch ?? {});
    },
    data: props.api.data,
    user: props.api.user,
    view: props.api.view
  };
}

function remoteProps(): Record<string, unknown> {
  const reserved = new Set(["class", "style", "key", "ref", "is", "v-if", "v-for"]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props.overrideProps ?? {})) {
    if (!reserved.has(key)) out[key] = value;
  }
  out.mfProps = props.overrideProps ?? {};
  out.mfContext = contextOf();
  return out;
}

async function mount(): Promise<void> {
  const current = ++seq;
  loading.value = true;
  error.value = "";
  loaded.value = null;
  try {
    const next = await loadRemoteComponent(props.component);
    if (current !== seq) return;
    loaded.value = next;
  } catch (cause) {
    if (current !== seq) return;
    const message = cause instanceof RemoteComponentError
      ? `${cause.message}（${cause.code}）`
      : cause instanceof Error ? cause.message : String(cause);
    error.value = message;
    emit("error", message);
  } finally {
    if (current === seq) loading.value = false;
  }
}

watch(
  () => [props.component.source, props.component.integrity, props.component.version, props.component.name],
  () => void mount(),
  { immediate: true }
);

watch(
  () => props.height,
  (value) => resize(value)
);

onBeforeUnmount(() => {
  seq += 1;
});

function remoteNode(): Component | null {
  return loaded.value?.component ?? null;
}
</script>

<template>
  <div class="mf-remote" :style="{ minHeight: `${frameHeight}px` }">
    <div v-if="loading" class="mf-remote__state">正在校验并加载远程组件…</div>
    <div v-else-if="error" class="mf-remote__state mf-remote__state--error">
      <strong>远程组件加载失败</strong>
      <span>{{ error }}</span>
      <code>{{ component.source }}</code>
      <button type="button" class="mf-remote__retry" @click="mount">重试</button>
    </div>
    <component :is="remoteNode()" v-else-if="remoteNode()" v-bind="remoteProps()" />
    <div class="mf-remote__badge">remote · {{ versionLabel }}</div>
  </div>
</template>

<style scoped>
.mf-remote {
  position: relative;
  min-width: 0;
  border-radius: 12px;
  background: #fff;
}
.mf-remote__state {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding: 14px;
  border: 1px dashed #c7d2fe;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  line-height: 1.5;
}
.mf-remote__state--error {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #be123c;
}
.mf-remote__state code {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 10.5px;
  opacity: 0.72;
}
.mf-remote__retry {
  padding: 3px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}
.mf-remote__badge {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
  font-size: 9px;
  letter-spacing: 0.02em;
  pointer-events: none;
}
</style>
