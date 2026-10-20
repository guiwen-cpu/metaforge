<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/api/request";
import { DEFAULT_APP_ID } from "@/lib/config";
import {
  buildRoutePath,
  collectFirstPath,
  flattenMenu,
  matchRoute,
  resolvePageLink
} from "@/lib/runtimeNavigation";
import {
  clearSession,
  getSession,
  redirectToLogin,
  updateSessionAppId
} from "@/lib/session";
import RuntimePageRenderer from "@/components/runtime/RuntimePageRenderer.vue";
import type { RuntimeNavigatePayload } from "@/lib/runtimeContext";
import type {
  RuntimeMenuItem,
  RuntimeNavigation,
  RuntimePageView
} from "@/types/runtime";

const appId = ref(DEFAULT_APP_ID);
const navigation = ref<RuntimeNavigation | null>(null);
const page = ref<RuntimePageView | null>(null);
const currentPath = ref("");
const loading = ref(true);
const pageLoading = ref(false);
const error = ref("");
const pageError = ref("");
const moreOpen = ref(false);
const accountOpen = ref(false);
let pageSeq = 0;

const menus = computed(() => navigation.value?.menus ?? []);
const flatMenus = computed(() =>
  flattenMenu(menus.value).filter((item) => Boolean(item.path || item.url))
);
const primaryMenus = computed(() => flatMenus.value.slice(0, 4));
const hasMore = computed(() => flatMenus.value.length > primaryMenus.value.length);
const pageLink = computed(() => resolvePageLink(navigation.value, currentPath.value));
const pageParams = computed<Record<string, string>>(() => {
  const matched = matchRoute(pageLink.value?.path, currentPath.value) ?? {};
  if (currentPath.value === "/leave/requests/new" || matched.id === "new") {
    return { ...matched, id: "" };
  }
  return matched;
});
const routeQuery = computed<Record<string, unknown>>(() => ({}));
const pageTitle = computed(() => page.value?.title || pageLink.value?.title || "移动运行时");
const sessionUser = computed(() => getSession()?.user);
const userName = computed(() => sessionUser.value?.displayName || sessionUser.value?.username || "当前用户");
const userInitial = computed(() => userName.value.slice(0, 1));
const appName = computed(() => navigation.value?.app_name || "MetaForge");

function isActive(item: RuntimeMenuItem): boolean {
  if (!item.path) return false;
  if (item.path === currentPath.value) return true;
  if (item.page_key && pageLink.value?.key === item.page_key) return true;
  return false;
}

async function loadPage(path: string): Promise<void> {
  const seq = ++pageSeq;
  const link = resolvePageLink(navigation.value, path);
  if (!link) {
    const fallback = navigation.value?.default_route || collectFirstPath(menus.value);
    if (fallback && fallback !== path) {
      currentPath.value = fallback;
      await loadPage(fallback);
      return;
    }
    page.value = null;
    pageError.value = path ? "路由 " + path + " 未绑定可访问页面" : "当前角色没有可访问页面";
    return;
  }
  pageLoading.value = true;
  pageError.value = "";
  try {
    const next = await runtimeApi.page(appId.value, link.key);
    if (seq !== pageSeq) return;
    page.value = next;
  } catch (cause) {
    if (seq !== pageSeq) return;
    page.value = null;
    pageError.value = errorMessage(cause);
  } finally {
    if (seq === pageSeq) pageLoading.value = false;
  }
}

async function loadNavigation(preferredPath?: string): Promise<void> {
  loading.value = true;
  error.value = "";
  pageError.value = "";
  try {
    const nav = await runtimeApi.navigation(appId.value);
    navigation.value = nav;
    const current = preferredPath || currentPath.value;
    const target = current && resolvePageLink(nav, current)
      ? current
      : nav.default_route || collectFirstPath(nav.menus);
    if (!target) {
      pageError.value = "当前角色没有可访问页面";
      return;
    }
    currentPath.value = target;
    await loadPage(target);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function openItem(item: RuntimeMenuItem): Promise<void> {
  if (!item.path) return;
  moreOpen.value = false;
  accountOpen.value = false;
  currentPath.value = item.path;
  await loadPage(item.path);
}

async function navigateRuntime(payload: RuntimeNavigatePayload): Promise<void> {
  let target = String(payload.path ?? "");
  if (!target && payload.pageRef?.key) {
    const key = String(payload.pageRef.key);
    const link = (navigation.value?.pages ?? []).find((item) => item.key === key);
    if (link) target = buildRoutePath(link, payload.params ?? {});
  }
  if (!target) return;
  moreOpen.value = false;
  accountOpen.value = false;
  currentPath.value = target;
  await loadPage(target);
  uni.pageScrollTo({ scrollTop: 0, duration: 120 });
}

function goBack(): void {
  const fallback = navigation.value?.default_route || collectFirstPath(menus.value);
  if (fallback) {
    currentPath.value = fallback;
    void loadPage(fallback);
  }
}

function retry(): void {
  void loadNavigation(currentPath.value);
}

function logout(): void {
  accountOpen.value = false;
  clearSession();
  uni.reLaunch({ url: "/pages/login/index" });
}

onPullDownRefresh(async () => {
  try {
    if (currentPath.value) await loadPage(currentPath.value);
  } finally {
    uni.stopPullDownRefresh();
  }
});

onLoad((options?: Record<string, string>) => {
  const session = getSession();
  if (!session) {
    redirectToLogin();
    return;
  }
  if (options?.appId) appId.value = options.appId;
  else if (session.appId) appId.value = session.appId;
  updateSessionAppId(appId.value);
  void loadNavigation(options?.path);
});
</script>

<template>
  <view class="shell mf-shell">
    <view class="shell-top">
      <view class="shell-top__glow"></view>
      <view class="shell-header">
        <view class="shell-brand">
          <view class="shell-logo">MF</view>
          <view class="shell-brand__text">
            <view class="shell-brand__line">
              <text class="shell-brand__name">{{ appName }}</text>
              <text v-if="navigation" class="shell-version">v{{ navigation.version_no }}</text>
            </view>
            <text class="shell-brand__page">{{ pageTitle }}</text>
          </view>
        </view>
        <button class="shell-avatar" @click="accountOpen = !accountOpen">{{ userInitial }}</button>
      </view>
      <view class="shell-meta">
        <text class="shell-meta__item">{{ userName }}</text>
        <text class="shell-meta__dot">·</text>
        <text class="shell-meta__item">{{ appId.slice(0, 8) }}</text>
      </view>
    </view>

    <view class="shell-content">
      <view v-if="loading" class="shell-state">正在加载发布件…</view>
      <view v-else-if="error" class="shell-state shell-state--error">
        <text class="shell-state__text">{{ error }}</text>
        <button class="mf-btn mf-btn--sm mf-btn--primary" @click="retry">重试</button>
      </view>
      <view v-else-if="pageLoading" class="shell-state">正在加载页面…</view>
      <view v-else-if="pageError" class="shell-state shell-state--error">{{ pageError }}</view>
      <template v-else-if="page">
        <RuntimePageRenderer
          :key="page.key + ':' + currentPath"
          :app-id="appId"
          :view="page"
          :route-params="pageParams"
          :route-query="routeQuery"
          :navigate="navigateRuntime"
          :go-back="goBack"
        />
      </template>
      <view v-else class="shell-state">当前没有可展示的页面</view>
    </view>

    <view class="shell-nav">
      <button
        v-for="item in primaryMenus"
        :key="item.key"
        :class="['shell-nav__item', isActive(item) ? 'shell-nav__item--active' : '']"
        @click="openItem(item)"
      >
        <text class="shell-nav__dot"></text>
        <text class="shell-nav__label">{{ item.title }}</text>
      </button>
      <button
        v-if="hasMore"
        class="shell-nav__item"
        :class="{ 'shell-nav__item--active': moreOpen }"
        @click="moreOpen = true"
      >
        <text class="shell-nav__dot"></text>
        <text class="shell-nav__label">更多</text>
      </button>
    </view>

    <view v-if="moreOpen" class="mf-overlay" @click="moreOpen = false">
      <view class="shell-sheet" @click.stop>
        <view class="shell-sheet__handle"></view>
        <view class="shell-sheet__head">
          <text class="shell-sheet__title">应用菜单</text>
          <text class="shell-sheet__close" @click="moreOpen = false">×</text>
        </view>
        <scroll-view scroll-y class="shell-sheet__body">
          <button
            v-for="item in flatMenus"
            :key="item.key"
            :class="['shell-menu', isActive(item) ? 'shell-menu--active' : '']"
            @click="openItem(item)"
          >
            <text class="shell-menu__title">{{ item.title }}</text>
            <text class="shell-menu__path">{{ item.path }}</text>
          </button>
        </scroll-view>
      </view>
    </view>

    <view v-if="accountOpen" class="mf-overlay" @click="accountOpen = false">
      <view class="shell-sheet shell-sheet--account" @click.stop>
        <view class="shell-sheet__handle"></view>
        <view class="account">
          <view class="account__avatar">{{ userInitial }}</view>
          <view class="account__info">
            <text class="account__name">{{ userName }}</text>
            <text class="account__meta">{{ sessionUser?.username }} · {{ sessionUser?.deptName || "未分配部门" }}</text>
            <text class="account__roles">{{ (sessionUser?.roleKeys || []).join(" / ") || "无角色" }}</text>
          </view>
        </view>
        <view class="account__actions">
          <button class="mf-btn" @click="accountOpen = false">继续使用</button>
          <button class="mf-btn mf-btn--danger" @click="logout">退出登录</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  background: #f4f6fb;
}
.shell-top {
  position: relative;
  overflow: hidden;
  padding: calc(24rpx + env(safe-area-inset-top)) 28rpx 26rpx;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 48%, #4338ca 100%);
  color: #ffffff;
}
.shell-top__glow {
  position: absolute;
  top: -100rpx;
  right: -90rpx;
  width: 330rpx;
  height: 330rpx;
  border-radius: 50%;
  background: rgba(129, 140, 248, 0.4);
  filter: blur(18rpx);
}
.shell-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.shell-brand {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}
.shell-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68rpx;
  height: 68rpx;
  flex-shrink: 0;
  border: 1rpx solid rgba(255, 255, 255, 0.24);
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.16);
  font-size: 24rpx;
  font-weight: 800;
}
.shell-brand__text {
  min-width: 0;
}
.shell-brand__line {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.shell-brand__name {
  overflow: hidden;
  color: #ffffff;
  font-size: 31rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell-version {
  flex-shrink: 0;
  padding: 4rpx 10rpx;
  border: 1rpx solid rgba(167, 243, 208, 0.4);
  border-radius: 999rpx;
  background: rgba(16, 185, 129, 0.18);
  color: #a7f3d0;
  font-size: 18rpx;
}
.shell-brand__page {
  display: block;
  margin-top: 4rpx;
  overflow: hidden;
  color: #c7d2fe;
  font-size: 22rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  border: 1rpx solid rgba(255, 255, 255, 0.32);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  font-size: 25rpx;
  font-weight: 700;
}
.shell-meta {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 20rpx;
  padding-left: 86rpx;
}
.shell-meta__item,
.shell-meta__dot {
  color: #a5b4fc;
  font-size: 20rpx;
}
.shell-content {
  padding: 24rpx 20rpx 12rpx;
}
.shell-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  min-height: 520rpx;
  color: #64748b;
  font-size: 25rpx;
  text-align: center;
}
.shell-state--error {
  color: #be123c;
}
.shell-state__text {
  max-width: 560rpx;
  line-height: 1.6;
}
.shell-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  max-width: 750px;
  margin: 0 auto;
  padding: 12rpx 10rpx calc(10rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid rgba(226, 232, 240, 0.92);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18rpx);
}
.shell-nav__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5rpx;
  min-height: 88rpx;
  padding: 0 6rpx;
  color: #94a3b8;
}
.shell-nav__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #cbd5e1;
}
.shell-nav__label {
  max-width: 140rpx;
  overflow: hidden;
  font-size: 20rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell-nav__item--active {
  color: #4338ca;
}
.shell-nav__item--active .shell-nav__dot {
  width: 30rpx;
  border-radius: 999rpx;
  background: #4f46e5;
}
.shell-sheet {
  width: 100%;
  max-width: 750px;
  max-height: 78vh;
  border-radius: 28rpx 28rpx 0 0;
  background: #ffffff;
  overflow: hidden;
}
.shell-sheet__handle {
  width: 76rpx;
  height: 7rpx;
  margin: 14rpx auto 4rpx;
  border-radius: 999rpx;
  background: #e2e8f0;
}
.shell-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 28rpx;
  border-bottom: 1rpx solid #f1f5f9;
}
.shell-sheet__title {
  color: #0f172a;
  font-size: 29rpx;
  font-weight: 600;
}
.shell-sheet__close {
  padding: 2rpx 10rpx;
  color: #94a3b8;
  font-size: 38rpx;
  line-height: 1;
}
.shell-sheet__body {
  max-height: 56vh;
  padding: 16rpx 20rpx calc(24rpx + env(safe-area-inset-bottom));
}
.shell-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3rpx;
  width: 100%;
  padding: 20rpx 18rpx;
  border-radius: 14rpx;
  text-align: left;
}
.shell-menu--active {
  background: #eef2ff;
}
.shell-menu__title {
  color: #334155;
  font-size: 26rpx;
  font-weight: 500;
}
.shell-menu__path {
  color: #94a3b8;
  font-size: 20rpx;
}
.shell-sheet--account {
  max-height: none;
}
.account {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 30rpx 30rpx 20rpx;
}
.account__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 92rpx;
  height: 92rpx;
  flex-shrink: 0;
  border-radius: 50%;
  background: #eef2ff;
  color: #4338ca;
  font-size: 34rpx;
  font-weight: 700;
}
.account__info {
  min-width: 0;
}
.account__name {
  display: block;
  color: #0f172a;
  font-size: 31rpx;
  font-weight: 700;
}
.account__meta,
.account__roles {
  display: block;
  margin-top: 4rpx;
  color: #64748b;
  font-size: 22rpx;
}
.account__roles {
  color: #94a3b8;
  font-size: 20rpx;
}
.account__actions {
  display: flex;
  gap: 14rpx;
  padding: 14rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
}
.account__actions .mf-btn {
  flex: 1;
}
</style>
