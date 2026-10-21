<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { platformApi } from "@/api/platform";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import {
  buildRoutePath,
  collectFirstPath,
  hasUnresolvedParams,
  matchRoute,
  resolvePageLink
} from "@/lib/runtimeNavigation";
import { registerCustomComponents } from "@/lib/uiModel";
import RuntimePageRenderer from "@/components/runtime/RuntimePageRenderer.vue";
import type { RuntimeNavigatePayload, RuntimePageRendererHandle } from "@/lib/runtimeContext";
import type { AppView } from "@/types/platform";
import type {
  RuntimeMenuItem,
  RuntimeNavigation,
  RuntimePageView
} from "@/types/runtime";

const route = useRoute();
const router = useRouter();
const appId = computed(() => String(route.params.appId ?? ""));

const app = ref<AppView | null>(null);
const navigation = ref<RuntimeNavigation | null>(null);
const page = ref<RuntimePageView | null>(null);
const renderer = ref<RuntimePageRendererHandle | null>(null);
const loading = ref(true);
const pageLoading = ref(false);
const error = ref("");
const pageError = ref("");
let pageSeq = 0;

const selectedPath = computed(() => {
  const value = route.query.path;
  return typeof value === "string" ? value : "";
});

const roleKeys = computed(() => navigation.value?.role_keys ?? []);
const pageLinks = computed(() => navigation.value?.pages ?? []);
const menus = computed(() => navigation.value?.menus ?? []);
const selectedTitle = computed(() => page.value?.title ?? selectedPath.value);
const routeQuery = computed<Record<string, unknown>>(() => ({ ...route.query }));
const routeParams = computed<Record<string, string>>(() => {
  const link = resolvePageLink(navigation.value, selectedPath.value);
  return matchRoute(link?.path, selectedPath.value) ?? {};
});

async function loadPage(path: string) {
  const seq = ++pageSeq;
  const link = resolvePageLink(navigation.value, path);
  if (!link) {
    page.value = null;
    const fallback = navigation.value?.default_route ?? "";
    if (fallback && fallback !== path) {
      await router.replace({ query: { ...route.query, path: fallback } });
      return;
    }
    pageError.value = path ? `路由 ${path} 未绑定可访问页面` : "";
    return;
  }
  pageLoading.value = true;
  pageError.value = "";
  try {
    const next = await runtimeApi.page(appId.value, link.key);
    if (seq !== pageSeq) return;
    registerCustomComponents(next.components ?? []);
    page.value = next;
  } catch (cause) {
    if (seq !== pageSeq) return;
    page.value = null;
    pageError.value = errorMessage(cause);
  } finally {
    if (seq === pageSeq) pageLoading.value = false;
  }
}

async function loadNavigation() {
  loading.value = true;
  error.value = "";
  try {
    const [appData, nav] = await Promise.all([
      platformApi.getApp(appId.value),
      runtimeApi.navigation(appId.value)
    ]);
    app.value = appData;
    navigation.value = nav;
    const target = selectedPath.value || nav.default_route || collectFirstPath(nav.menus);
    if (target && target !== selectedPath.value) {
      await router.replace({ query: { ...route.query, path: target } });
    } else if (target) {
      await loadPage(target);
    } else {
      page.value = null;
    }
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function openMenu(item: RuntimeMenuItem) {
  if (item.url) {
    window.open(item.url, item.target || "_blank", "noopener");
    return;
  }
  if (!item.path) return;
  await renderer.value?.runBeforeLeave("internal", item.path);
  await router.push({ query: { ...route.query, path: item.path } });
}

function isActive(item: RuntimeMenuItem): boolean {
  return !!item.path && item.path === selectedPath.value;
}

async function navigateRuntime(payload: RuntimeNavigatePayload): Promise<void> {
  let target = String(payload.path ?? "");
  if (!target && payload.pageRef) {
    const key = String(payload.pageRef.key ?? "");
    const refPath = String(payload.pageRef.path ?? "");
    const link = pageLinks.value.find((item) => item.key === key)
      ?? pageLinks.value.find((item) => item.path === refPath);
    if (link) {
      target = buildRoutePath(link, payload.params ?? {});
    } else {
      target = refPath;
    }
  }
  if (!target) return;
  if (hasUnresolvedParams(target)) {
    ElMessage.warning("目标路由缺少必要参数，已取消跳转");
    return;
  }
  await renderer.value?.runBeforeLeave("internal", target);
  await router.push({ query: { ...route.query, path: target } });
}

function openMobile(): void {
  void router.push(`/m/apps/${appId.value}${selectedPath.value}`);
}

watch(selectedPath, (path) => {
  if (path && navigation.value) void loadPage(path);
});

watch(appId, () => {
  void loadNavigation();
});

onMounted(loadNavigation);
</script>
<template>
  <div class="flex min-h-screen flex-col bg-slate-50">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <el-button text @click="router.push(`/apps/${appId}`)">← 返回应用</el-button>
        <div class="h-5 w-px bg-slate-200" />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-[15px] font-semibold text-slate-800">
              {{ app?.name || appId }}
            </h1>
            <el-tag v-if="navigation" size="small" type="success" effect="plain">
              运行态 v{{ navigation.version_no }}
            </el-tag>
          </div>
          <p class="mt-0.5 truncate text-[11px] text-slate-400">
            发布件导航 · {{ selectedTitle || "未选择页面" }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <el-tag v-for="role in roleKeys" :key="role" size="small" effect="plain">
          {{ role }}
        </el-tag>
        <el-button size="small" @click="openMobile">H5 预览</el-button>
        <el-button size="small" @click="router.push(`/apps/${appId}/approvals`)">审批中心</el-button>
        <el-button size="small" @click="router.push(`/apps/${appId}/pages`)">页面设计器</el-button>
      </div>
    </header>

    <div v-if="loading" class="flex flex-1 items-center justify-center text-[13px] text-slate-400">
      正在加载发布件导航…
    </div>

    <div v-else-if="error" class="flex flex-1 items-center justify-center p-6">
      <el-alert :title="error" type="error" show-icon :closable="false" class="max-w-xl" />
    </div>

    <div v-else class="flex flex-1">
      <aside class="w-60 shrink-0 border-r border-slate-200 bg-white px-3 py-4">
        <p class="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
          运行菜单
        </p>
        <p v-if="!menus.length" class="px-2 py-6 text-[12px] leading-relaxed text-slate-400">
          当前角色没有可见菜单。请检查发布件的 navigation.menus 与 roles 配置。
        </p>
        <div v-for="menu in menus" :key="menu.id" class="mb-3">
          <template v-if="menu.children.length === 0 && (menu.path || menu.url)">
            <button
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition"
              :class="isActive(menu) ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'"
              @click="openMenu(menu)"
            >
              <span class="grid h-5 w-5 place-items-center rounded bg-slate-100 text-[10px] text-slate-500">
                {{ menu.title.slice(0, 1) }}
              </span>
              <span class="truncate">{{ menu.title }}</span>
            </button>
          </template>
          <template v-else>
            <p class="flex items-center gap-2 px-2.5 py-1 text-[11px] font-medium text-slate-400">
              <span class="grid h-4 w-4 place-items-center rounded bg-slate-100 text-[9px]">
                {{ menu.title.slice(0, 1) }}
              </span>
              {{ menu.title }}
            </p>
            <button
              v-for="child in menu.children"
              :key="child.id"
              class="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pl-7 text-left text-[13px] transition"
              :class="isActive(child) ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'"
              @click="openMenu(child)"
            >
              <span class="truncate">{{ child.title }}</span>
              <span v-if="child.page_key" class="ml-auto text-[9px] text-slate-300">页面</span>
            </button>
          </template>
        </div>
      </aside>

      <main class="min-w-0 flex-1 px-6 py-5">
        <div v-if="pageLoading" class="flex h-40 items-center justify-center text-[13px] text-slate-400">
          正在加载页面…
        </div>
        <el-alert
          v-else-if="pageError"
          :title="pageError"
          type="error"
          show-icon
          :closable="false"
          class="max-w-2xl"
        />
        <template v-else-if="page">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-[18px] font-semibold text-slate-800">{{ page.title }}</h2>
              <p class="mt-1 font-mono text-[11px] text-slate-400">
                {{ page.path || "未声明路由" }} · {{ page.kind }} · {{ page.key }}
              </p>
            </div>
            <el-tag type="success" effect="plain">运行态</el-tag>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <RuntimePageRenderer
              ref="renderer"
              :key="page.key + ':' + selectedPath"
              :app-id="appId"
              :view="page"
              :route-params="routeParams"
              :route-query="routeQuery"
              :navigate="navigateRuntime"
            />
          </div>
        </template>
        <el-empty v-else description="请从左侧选择一个运行菜单" />
      </main>
    </div>
  </div>
</template>
