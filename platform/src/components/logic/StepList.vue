<script setup lang="ts">
import { computed } from "vue";
import {
  nestedStepLists,
  stepDef,
  stepLabel,
  stepSummary
} from "@/lib/logicModel";
import type { LogicStep } from "@/types/logicModel";
import StepList from "./StepList.vue";

const props = withDefaults(
  defineProps<{
    steps: LogicStep[];
    selectedId?: string | null;
    depth?: number;
  }>(),
  { selectedId: null, depth: 0 }
);

const emit = defineEmits<{
  select: [id: string];
  add: [steps: LogicStep[]];
  move: [steps: LogicStep[], index: number, delta: number];
  remove: [steps: LogicStep[], id: string];
  duplicate: [steps: LogicStep[], id: string];
}>();

const lists = computed(() => props.steps.map((value) => nestedStepLists(value)));

function iconOf(type: string): string {
  return stepDef(type)?.icon ?? "•";
}

function colorOf(type: string): string {
  return stepDef(type)?.color ?? "bg-slate-100 text-slate-500";
}
</script>

<template>
  <div class="space-y-1.5">
    <div v-for="(step, index) in steps" :key="step.id || index">
      <div
        class="group cursor-pointer rounded-lg border px-2.5 py-2 transition"
        :class="selectedId === step.id ? 'border-indigo-300 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'"
        @click="emit('select', step.id)"
      >
        <div class="flex items-start gap-2">
          <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[11px]" :class="colorOf(step.type)">
            {{ iconOf(step.type) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-[11.5px] font-medium text-slate-700">{{ stepLabel(step) }}</span>
              <span class="shrink-0 font-mono text-[9px] text-slate-400">{{ step.type }}</span>
              <span v-if="step.when" class="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[8.5px] text-amber-600">条件</span>
              <span v-if="step.disabled" class="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[8.5px] text-slate-400">禁用</span>
            </div>
            <p class="mt-0.5 truncate text-[10.5px] text-slate-400">{{ stepSummary(step) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              class="grid h-5 w-5 place-items-center rounded text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="上移"
              @click.stop="emit('move', steps, index, -1)"
            >
              ↑
            </button>
            <button
              class="grid h-5 w-5 place-items-center rounded text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="下移"
              @click.stop="emit('move', steps, index, 1)"
            >
              ↓
            </button>
            <button
              class="grid h-5 w-5 place-items-center rounded text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="复制"
              @click.stop="emit('duplicate', steps, step.id)"
            >
              ⧉
            </button>
            <button
              class="grid h-5 w-5 place-items-center rounded text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="删除"
              @click.stop="emit('remove', steps, step.id)"
            >
              ×
            </button>
          </div>
        </div>
        <p v-if="step.note" class="mt-1 line-clamp-2 pl-7 text-[10px] leading-relaxed text-slate-400">
          {{ step.note }}
        </p>
      </div>

      <div v-if="lists[index].length" class="ml-3 mt-1 space-y-1.5 border-l border-dashed border-slate-200 pl-2.5">
        <div v-for="list in lists[index]" :key="list.key">
          <p class="py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-300">{{ list.label }}</p>
          <StepList
            :steps="list.steps"
            :selected-id="selectedId"
            :depth="depth + 1"
            @select="emit('select', $event)"
            @add="emit('add', $event)"
            @move="(target, at, delta) => emit('move', target, at, delta)"
            @remove="(target, id) => emit('remove', target, id)"
            @duplicate="(target, id) => emit('duplicate', target, id)"
          />
        </div>
      </div>
    </div>

    <button
      class="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-1.5 text-[10.5px] text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600"
      @click="emit('add', steps)"
    >
      <span class="text-[12px] leading-none">+</span>
      {{ steps.length ? "继续添加步骤" : "添加步骤" }}
    </button>
  </div>
</template>