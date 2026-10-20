<script setup lang="ts">
import { activityTitle, durationText } from "@/lib/runtime";
import { formatDateTime } from "@/lib/format";
import type { TimelineItem } from "@/types/runtime";

defineProps<{ items: TimelineItem[] }>();
</script>

<template>
  <div v-if="items.length === 0" class="py-8 text-center text-[12px] text-slate-400">
    暂无流转记录
  </div>
  <ol v-else class="relative ml-2 space-y-5 border-l border-slate-200 pl-5">
    <li v-for="item in items" :key="`${item.activity_id}-${item.start_time}`" class="relative">
      <span
        class="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4"
        :class="item.status === 'active'
          ? 'animate-pulse bg-indigo-500 ring-indigo-50'
          : 'bg-emerald-400 ring-emerald-50'"
      />
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-[13px] font-medium text-slate-700">{{ activityTitle(item) }}</p>
        <span
          v-if="item.status === 'active'"
          class="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600"
        >
          进行中
        </span>
      </div>
      <p v-if="item.assignee" class="mt-1 text-[11.5px] text-slate-500">
        办理人 {{ item.assignee }}
      </p>
      <p v-if="item.comment" class="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[11.5px] leading-relaxed text-slate-600">
        {{ item.comment }}
      </p>
      <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
        {{ formatDateTime(item.start_time) }}
        <template v-if="item.end_time">
          <span class="mx-1 text-slate-300">→</span>{{ formatDateTime(item.end_time) }}
          <span v-if="item.duration_ms !== null && item.duration_ms !== undefined" class="ml-2 text-slate-300">
            {{ durationText(item.duration_ms) }}
          </span>
        </template>
      </p>
    </li>
  </ol>
</template>
