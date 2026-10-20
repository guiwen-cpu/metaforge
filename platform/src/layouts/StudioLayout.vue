<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/identity";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const inApps = computed(() => route.name === "apps" || route.name === "app-detail");
const appId = computed(() => (typeof route.params.appId === "string" ? route.params.appId : ""));
const inModel = computed(() => route.name === "app-model");
const inPages = computed(() => route.name === "app-pages");
const inLogic = computed(() => route.name === "app-logic");
const inComponents = computed(() => route.name === "app-components");
const inIdentity = computed(() => route.name === "identity");
const inApprovals = computed(
  () =>
    route.name === "app-approvals" ||
    route.name === "app-approval-detail" ||
    route.name === "app-instance-detail"
);

function openDesigner(kind: "model" | "pages" | "logic" | "components") {
  if (!appId.value) {
    ElMessage.info("请先进入一个应用");
    return;
  }
  const suffix =
    kind === "model" ? "model" : kind === "pages" ? "pages" : kind === "logic" ? "logic" : "components";
  router.push(`/apps/${appId.value}/${suffix}`);
}
const pageTitle = computed(() => (route.meta.title as string) || "应用工作台");

function openApprovals() {
  if (!appId.value) {
    ElMessage.info("请先进入一个应用");
    return;
  }
  router.push(`/apps/${appId.value}/approvals`);
}

async function logout() {
  try {
    await authApi.logout();
  } catch {
    // 退出接口失败也要清理本地会话。
  }
  sessionStore.logout();
  router.replace("/login");
}
</script>

<template>
  <div class="flex min-h-screen bg-surface">
    <aside
      class="fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col bg-ink text-slate-300"
    >
      <div class="flex h-[60px] items-center gap-2.5 px-5">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 text-sm font-bold text-white shadow-lg shadow-indigo-900/40"
        >
          M
        </div>
        <div class="leading-tight">
          <p class="text-[15px] font-semibold tracking-wide text-white">MetaForge</p>
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">low-code studio</p>
        </div>
      </div>

      <nav class="mt-4 flex-1 space-y-1 px-3">
        <button
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition"
          :class="inApps ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'"
          @click="router.push('/')"
        >
          <span class="grid h-5 w-5 place-items-center rounded bg-white/10 text-[11px]">▦</span>
          应用工作台
        </button>

        <div class="px-3 pb-1 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
          设计器
        </div>
        <button
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
          :class="inModel ? 'bg-white/10 text-white' : appId ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600'"
          @click="openDesigner('model')"
        >
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">◧</span>
            数据模型
          </span>
          <span v-if="!appId" class="text-[9px] text-slate-600">选应用</span>
          <span v-else-if="inModel" class="text-[9px] text-indigo-300">当前</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
          :class="inPages ? 'bg-white/10 text-white' : appId ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600'"
          @click="openDesigner('pages')"
        >
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">◇</span>
            页面设计器
          </span>
          <span v-if="!appId" class="text-[9px] text-slate-600">选应用</span>
          <span v-else-if="inPages" class="text-[9px] text-indigo-300">当前</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
          :class="inLogic ? 'bg-white/10 text-white' : appId ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600'"
          @click="openDesigner('logic')"
        >
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">⇄</span>
            逻辑编排
          </span>
          <span v-if="!appId" class="text-[9px] text-slate-600">选应用</span>
          <span v-else-if="inLogic" class="text-[9px] text-indigo-300">当前</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
          :class="inComponents ? 'bg-white/10 text-white' : appId ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600'"
          @click="openDesigner('components')"
        >
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">◫</span>
            自定义组件
          </span>
          <span v-if="!appId" class="text-[9px] text-slate-600">选应用</span>
          <span v-else-if="inComponents" class="text-[9px] text-indigo-300">当前</span>
        </button>

        <div class="px-3 pb-1 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
          运行时
        </div>
        <button
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
          :class="inApprovals ? 'bg-white/10 text-white' : appId ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600'"
          @click="openApprovals"
        >
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">◉</span>
            审批中心
          </span>
          <span v-if="!appId" class="text-[9px] text-slate-600">选应用</span>
          <span v-else-if="inApprovals" class="text-[9px] text-indigo-300">当前</span>
        </button>

        <template v-if="sessionStore.canManageIdentity">
          <div class="px-3 pb-1 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
            租户
          </div>
          <button
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
            :class="inIdentity ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'"
            @click="router.push('/identity')"
          >
            <span class="flex items-center gap-2.5">
              <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">◍</span>
              组织与权限
            </span>
            <span v-if="inIdentity" class="text-[9px] text-indigo-300">当前</span>
          </button>
        </template>
      </nav>

      <div class="border-t border-white/5 px-5 py-4 text-[10px] text-slate-600">
        控制平面 · protocol 0.1
      </div>
    </aside>

    <div class="flex min-h-screen flex-1 flex-col pl-[232px]">
      <header
        class="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-slate-200/80 bg-white/85 px-8 backdrop-blur"
      >
        <div class="flex items-center gap-2 text-[13px] text-slate-400">
          <span>控制平面</span>
          <span class="text-slate-300">/</span>
          <span class="font-medium text-slate-700">{{ pageTitle }}</span>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3"
          >
            <span
              class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-semibold text-white"
            >
              {{ sessionStore.initials }}
            </span>
            <span class="leading-tight">
              <span class="block text-[12px] font-medium text-slate-700">
                {{ sessionStore.displayName || sessionStore.userId }}
              </span>
              <span class="block text-[10px] text-slate-400">
                {{ sessionStore.tenantId }}
                <template v-if="sessionStore.roles.length">
                  · {{ sessionStore.roles.join(" / ") }}
                </template>
              </span>
            </span>
          </div>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:border-rose-200 hover:text-rose-500"
            type="button"
            @click="logout"
          >
            退出
          </button>
        </div>
      </header>

      <main class="flex-1 px-8 py-7">
        <router-view />
      </main>
    </div>

  </div>
</template>
