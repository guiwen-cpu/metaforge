<script setup lang="ts">
import { computed } from "vue";
import type { UINode } from "@/types/uiModel";
import { componentOf, textOf } from "@/lib/uiModel";

defineOptions({ name: "NodeOutline" });

const props = withDefaults(
  defineProps<{
    node: UINode;
    selectedId?: string | null;
    depth?: number;
  }>(),
  { depth: 0, selectedId: null }
);

const emit = defineEmits<{ select: [id: string] }>();

const def = computed(() => componentOf(props.node.component));
const title = computed(
  () =>
    textOf(props.node.props?.title) ||
    textOf(props.node.props?.text) ||
    textOf(props.node.props?.label) ||
    textOf(def.value?.title) ||
    props.node.component
);
const selected = computed(() => props.selectedId === props.node.id);

const kindColor = computed(() => {
  switch (def.value?.kind) {
    case "layout":
      return "bg-slate-300";
    case "container":
      return "bg-teal-400";
    case "data":
      return "bg-indigo-400";
    case "field":
      return "bg-sky-400";
    case "action":
      return "bg-amber-400";
    case "advanced":
      return "bg-violet-400";
    default:
      return "bg-slate-300";
  }
});

function slotLabel(name: string): string {
  const slot = def.value?.slots?.find((item) => item.name === name);
  return textOf(slot?.label) || name;
}
</script>

<template>
  <div>
    <button
      class="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[11.5px] transition"
      :class="selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'"
      :style="{ paddingLeft: `${8 + depth * 12}px` }"
      @click="emit('select', node.id)"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="kindColor" />
      <span class="truncate">{{ title }}</span>
      <span class="ml-auto shrink-0 font-mono text-[9px] text-slate-400">{{ node.component }}</span>
    </button>

    <NodeOutline
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :selected-id="selectedId"
      :depth="depth + 1"
      @select="emit('select', $event)"
    />

    <template v-for="(slotChildren, slotName) in node.slots" :key="slotName">
      <div
        class="flex items-center gap-1.5 py-1 text-[9.5px] uppercase tracking-wide text-slate-300"
        :style="{ paddingLeft: `${16 + depth * 12}px` }"
      >
        <span class="h-px w-2 bg-slate-200" />
        {{ slotLabel(String(slotName)) }}
      </div>
      <NodeOutline
        v-for="child in slotChildren"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>