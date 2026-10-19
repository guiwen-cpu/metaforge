<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const sessionOpen = ref(false);
const tenantDraft = ref(sessionStore.tenantId);
const userDraft = ref(sessionStore.userId);

const inApps = computed(() => route.path.startsWith("/apps") || route.path === "/");
const appId = computed(() => (typeof route.params.appId === "string" ? route.params.appId : ""));
const inModel = computed(() => route.name === "app-model");
const inPages = computed(() => route.name === "app-pages");

function openDesigner(kind: "model" | "pages") {
  if (!appId.value) {
    ElMessage.info("请先进入一个应用");
    return;
  }
  router.push(kind === "model" ? `/apps/${appId.value}/model` : `/apps/${appId.value}/pages`);
}
const pageTitle = computed(() => (route.meta.title as string) || "应用工作台");

function openSession() {
  tenantDraft.value = sessionStore.tenantId;
  userDraft.value = sessionStore.userId;
  sessionOpen.value = true;
}

function saveSession() {
  if (!tenantDraft.value.trim()) {
    ElMessage.warning("租户 ID 不能为空");
    return;
  }
  sessionStore.update(tenantDraft.value, userDraft.value);
  sessionOpen.value = false;
  ElMessage.success("已切换租户上下文");
  window.location.reload();
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
        <div class="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-slate-500">
          <span class="flex items-center gap-2.5">
            <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">⇄</span>
            逻辑编排
          </span>
          <span class="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">即将上线</span>
        </div>
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

        <button
          class="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-left transition hover:border-indigo-200 hover:shadow-sm"
          @click="openSession"
        >
          <span
            class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-semibold text-white"
          >
            {{ sessionStore.userId.slice(0, 1).toUpperCase() }}
          </span>
          <span class="leading-tight">
            <span class="block text-[12px] font-medium text-slate-700">{{ sessionStore.userId }}</span>
            <span class="block text-[10px] text-slate-400">{{ sessionStore.tenantId }}</span>
          </span>
        </button>
      </header>

      <main class="flex-1 px-8 py-7">
        <router-view />
      </main>
    </div>

    <el-dialog v-model="sessionOpen" title="租户与操作人" width="420px">
      <p class="mb-4 text-xs leading-relaxed text-slate-500">
        控制平面通过请求头识别租户与操作人。切换后会重新加载数据；生产环境将由网关或 SSO 注入。
      </p>
      <el-form label-position="top">
        <el-form-item label="租户 ID（X-Tenant-Id）">
          <el-input v-model="tenantDraft" placeholder="tenant_demo_school" />
        </el-form-item>
        <el-form-item label="操作人（X-User-Id）">
          <el-input v-model="userDraft" placeholder="alice" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sessionOpen = false">取消</el-button>
        <el-button type="primary" @click="saveSession">应用并刷新</el-button>
      </template>
    </el-dialog>
  </div>
</template>