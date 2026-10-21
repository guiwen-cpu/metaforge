<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { registerCustomComponents } from "@/lib/uiModel";
import { session } from "@/lib/session";
import {
  buildRoutePath,
  collectFirstPath,
  flattenMenu,
  hasUnresolvedParams,
  matchRoute,
  resolvePageLink,
  runtimePathFromParts
} from "@/lib/runtimeNavigation";
import RuntimePageRenderer from "@/components/runtime/RuntimePageRenderer.vue";
import type { RuntimeNavigatePayload, RuntimePageRendererHandle } from "@/lib/runtimeContext";
import type {
  RuntimeMenuItem,
  RuntimeNavigation,
  RuntimePageView
} from "@/types/runtime";

const route = useRoute();
const router = useRouter();
const appId = computed(() => String(route.params.appId ?? ""));

const navigation = ref<RuntimeNavigation | null>(null);
const page = ref<RuntimePageView | null>(null);
const renderer = ref<RuntimePageRendererHandle | null>(null);
const loading = ref(true);
const pageLoading = ref(false);
const error = ref("");
const pageError = ref("");
const moreOpen = ref(false);
let pageSeq = 0;

const runtimePath = computed(() =>
  runtimePathFromParts(route.params.pathMatch as string | string[] | undefined)
);
const menus = computed(() => navigation.value?.menus ?? []);
const flatMenus = computed(() =>
  flattenMenu(menus.value).filter((item) => Boolean(item.path || item.url))
);
const primaryMenus = computed(() => flatMenus.value.slice(0, 4));
const hasMore = computed(() => flatMenus.value.length > primaryMenus.value.length);
const selectedTitle = computed(
  () => page.value?.title || page.value?.key || runtimePath.value || "运行态"
);
const routeParams = computed<Record<string, string>>(() => {
  const link = resolvePageLink(navigation.value, runtimePath.value);
  return matchRoute(link?.path, runtimePath.value) ?? {};
});
const routeQuery = computed<Record<string, unknown>>(() => ({ ...route.query }));
const user = computed(() => session.state.profile);
const userInitial = computed(
  () => (user.value?.displayName || user.value?.username || session.state.userId || "U").slice(0, 1)
);
const userName = computed(
  () => user.value?.displayName || user.value?.username || session.state.displayName || "当前用户"
);

function appRoute(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/m/apps/${appId.value}${normalized}`;
}

function isActive(item: RuntimeMenuItem): boolean {
  if (!item.path || !runtimePath.value) return false;
  return item.path === runtimePath.value;
}

async function loadPage(path: string): Promise<void> {
  const seq = ++pageSeq;
  const link = resolvePageLink(navigation.value, path);
  if (!link) {
    page.value = null;
    const fallback = navigation.value?.default_route || collectFirstPath(menus.value);
    if (fallback && fallback !== path) {
      await router.replace({ path: appRoute(fallback), query: route.query });
      return;
    }
    pageError.value = path ? `路由 ${path} 未绑定可访问页面` : "当前角色没有可访问页面";
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

async function loadNavigation(): Promise<void> {
  loading.value = true;
  error.value = "";
  page.value = null;
  try {
    const nav = await runtimeApi.navigation(appId.value);
    navigation.value = nav;
    const current = runtimePath.value;
    const target = current && resolvePageLink(nav, current)
      ? current
      : nav.default_route || collectFirstPath(nav.menus);
    if (!target) {
      pageError.value = "当前角色没有可访问页面";
      return;
    }
    if (target !== current) {
      await router.replace({ path: appRoute(target), query: route.query });
      return;
    }
    await loadPage(target);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function openItem(item: RuntimeMenuItem): Promise<void> {
  if (item.url) {
    window.open(item.url, item.target || "_blank", "noopener");
    return;
  }
  if (!item.path) return;
  moreOpen.value = false;
  await renderer.value?.runBeforeLeave("internal", item.path);
  await router.push({ path: appRoute(item.path), query: route.query });
}

async function navigateRuntime(payload: RuntimeNavigatePayload): Promise<void> {
  let target = String(payload.path ?? "");
  if (!target && payload.pageRef) {
    const pages = navigation.value?.pages ?? [];
    const key = String(payload.pageRef.key ?? "");
    const refPath = String(payload.pageRef.path ?? "");
    const link = pages.find((item) => item.key === key)
      ?? pages.find((item) => item.path === refPath);
    target = link ? buildRoutePath(link, payload.params ?? {}) : refPath;
  }
  if (!target) return;
  if (hasUnresolvedParams(target)) {
    ElMessage.warning("目标路由缺少必要参数，已取消跳转");
    return;
  }
  await renderer.value?.runBeforeLeave("internal", target);
  await router.push({ path: appRoute(target), query: route.query });
}

function openDesktop(): void {
  void router.push({
    path: `/apps/${appId.value}/runtime`,
    query: runtimePath.value ? { path: runtimePath.value } : undefined
  });
}

function logout(): void {
  session.clear();
  void router.replace({ name: "login", query: { redirect: route.fullPath } });
}

watch(runtimePath, (path) => {
  if (path && navigation.value) void loadPage(path);
});

watch(appId, () => {
  navigation.value = null;
  void loadNavigation();
});

onMounted(loadNavigation);
</script>

<template>
  <div class="min-h-[100dvh] bg-[#f5f7fb] text-slate-800">
    <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div class="mx-auto max-w-3xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div class="flex items-center gap-2.5">
          <button
            class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[18px] text-slate-500 transition active:bg-slate-100"
            aria-label="返回应用"
            @click="router.push(`/apps/${appId}`)"
          >
            ←
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h1 class="truncate text-[15px] font-semibold text-slate-900">
                {{ navigation?.app_name || "MetaForge" }}
              </h1>
              <span
                v-if="navigation"
                class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
              >
                v{{ navigation.version_no }}
              </span>
            </div>
            <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ selectedTitle }}</p>
          </div>
          <el-dropdown trigger="click" @command="(command: string) => command === 'desktop' ? openDesktop() : logout()">
            <button
              class="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-[13px] font-semibold text-white shadow-sm"
              :aria-label="`${userName} 的账号菜单`"
            >
              {{ userInitial }}
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ userName }}</el-dropdown-item>
                <el-dropdown-item command="desktop">切换到桌面版</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3">
      <div v-if="loading" class="flex min-h-[55vh] items-center justify-center text-[13px] text-slate-400">
        正在加载发布件…
      </div>
      <el-alert
        v-else-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mt-3"
      />
      <template v-else>
        <div v-if="pageLoading" class="flex min-h-[50vh] items-center justify-center text-[13px] text-slate-400">
          正在加载页面…
        </div>
        <el-alert
          v-else-if="pageError"
          :title="pageError"
          type="error"
          show-icon
          :closable="false"
        />
        <template v-else-if="page">
          <div class="mb-2 flex items-end justify-between gap-3 px-1">
            <div class="min-w-0">
              <h2 class="truncate text-[17px] font-semibold text-slate-900">{{ page.title }}</h2>
              <p class="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                {{ page.path || runtimePath }} · {{ page.kind }}
              </p>
            </div>
            <span class="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] text-indigo-600">运行态</span>
          </div>
          <div class="runtime-mobile overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <RuntimePageRenderer
              ref="renderer"
              :key="page.key + ':' + runtimePath"
              :app-id="appId"
              :view="page"
              :route-params="routeParams"
              :route-query="routeQuery"
              :navigate="navigateRuntime"
            />
          </div>
        </template>
      </template>
    </main>

    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div class="mx-auto flex max-w-3xl items-stretch px-2">
        <button
          v-for="item in primaryMenus"
          :key="item.id"
          class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] transition"
          :class="isActive(item) ? 'text-indigo-600' : 'text-slate-400'"
          @click="openItem(item)"
        >
          <span
            class="grid h-6 w-6 place-items-center rounded-full text-[11px]"
            :class="isActive(item) ? 'bg-indigo-50 font-semibold' : 'bg-slate-100'"
          >
            {{ item.title.slice(0, 1) }}
          </span>
          <span class="w-full truncate text-center">{{ item.title }}</span>
        </button>
        <button
          v-if="hasMore"
          class="flex w-16 shrink-0 flex-col items-center gap-0.5 px-1 py-2 text-[10px] text-slate-400"
          @click="moreOpen = true"
        >
          <span class="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[15px]">⋯</span>
          <span>更多</span>
        </button>
      </div>
    </nav>

    <el-drawer v-model="moreOpen" direction="btt" size="62%" :with-header="false">
      <div class="px-1 pb-3">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[15px] font-semibold text-slate-900">全部功能</h3>
          <el-button text @click="moreOpen = false">关闭</el-button>
        </div>
        <div class="space-y-1">
          <button
            v-for="item in flatMenus"
            :key="item.id"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition active:bg-slate-100"
            :class="isActive(item) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'"
            @click="openItem(item)"
          >
            <span class="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-[11px] text-slate-500">
              {{ item.title.slice(0, 1) }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
            <span class="text-[10px] text-slate-300">{{ item.url ? "外部" : "页面" }}</span>
          </button>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <el-button @click="openDesktop">桌面版</el-button>
          <el-button @click="logout">退出登录</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.runtime-mobile :deep(.el-table) {
  font-size: 12px;
}

.runtime-mobile :deep(.el-table .cell) {
  padding: 0 8px;
}

.runtime-mobile :deep(.el-form-item) {
  margin-bottom: 12px;
}

.runtime-mobile :deep(.el-card__body) {
  padding: 12px;
}
</style>
