<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/identity";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import type { PasswordPolicy } from "@/types/identity";
import type { NotificationItem } from "@/types/runtime";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const passwordOpen = ref(false);
const passwordSaving = ref(false);
const passwordPolicy = ref<PasswordPolicy | null>(null);
const passwordForm = reactive({ current: "", next: "", confirm: "" });
const notifications = ref<NotificationItem[]>([]);
const unread = ref(0);
const notificationOpen = ref(false);
const notificationLoading = ref(false);
let unreadTimer: number | undefined;

const inApps = computed(() => route.name === "apps" || route.name === "app-detail");
const appId = computed(() => (typeof route.params.appId === "string" ? route.params.appId : ""));
const inModel = computed(() => route.name === "app-model");
const inPages = computed(() => route.name === "app-pages");
const inLogic = computed(() => route.name === "app-logic");
const inComponents = computed(() => route.name === "app-components");
const inIdentity = computed(() => route.name === "identity");
const inConnections = computed(() => route.name === "connections");
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
const unreadLabel = computed(() => (unread.value > 99 ? "99+" : String(unread.value)));

const passwordRule = computed(() => {
  const policy = passwordPolicy.value;
  const min = policy?.min_length ?? 8;
  const max = policy?.max_length ?? 128;
  const requirements = [
    policy?.require_lowercase ? "小写字母" : "",
    policy?.require_uppercase ? "大写字母" : "",
    policy?.require_digit ? "数字" : "",
    policy?.require_symbol ? "符号" : ""
  ].filter(Boolean);
  const content = requirements.length ? `，需包含${requirements.join("、")}` : "";
  return `密码 ${min}-${max} 位${content}；不能包含空白字符、登录名或显示名`;
});

function openApprovals() {
  if (!appId.value) {
    ElMessage.info("请先进入一个应用");
    return;
  }
  router.push(`/apps/${appId.value}/approvals`);
}

function notificationLink(item: NotificationItem): string | null {
  if (item.link) return item.link;
  if (item.app_id && item.biz_type === "task" && item.biz_id) {
    return `/apps/${item.app_id}/approvals/${item.biz_id}`;
  }
  if (item.app_id && item.biz_type === "instance" && item.biz_id) {
    return `/apps/${item.app_id}/instances/${item.biz_id}`;
  }
  return null;
}

async function refreshUnread() {
  try {
    unread.value = await runtimeApi.globalUnreadCount();
  } catch {
    // 后台轮询失败不打断当前操作，下一次轮询或打开面板时再同步。
  }
}

async function loadGlobalNotifications() {
  notificationLoading.value = true;
  try {
    const feed = await runtimeApi.globalNotifications(20);
    notifications.value = feed.items;
    unread.value = feed.unread;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    notificationLoading.value = false;
  }
}

async function markNotificationRead(item: NotificationItem) {
  if (item.read) return;
  try {
    const updated = await runtimeApi.readGlobalNotification(item.id);
    const index = notifications.value.findIndex((entry) => entry.id === item.id);
    if (index >= 0) notifications.value[index] = updated;
    unread.value = Math.max(0, unread.value - 1);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

async function openNotification(item: NotificationItem) {
  notificationOpen.value = false;
  await markNotificationRead(item);
  const link = notificationLink(item);
  if (link) router.push(link);
}

async function markAllRead() {
  if (!unread.value) return;
  try {
    const result = await runtimeApi.readAllGlobalNotifications();
    notifications.value = notifications.value.map((item) => ({ ...item, read: true }));
    unread.value = result.unread;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

onMounted(() => {
  refreshUnread();
  unreadTimer = window.setInterval(refreshUnread, 30000);
});

onBeforeUnmount(() => {
  if (unreadTimer !== undefined) window.clearInterval(unreadTimer);
});

watch(notificationOpen, (open) => {
  if (open) loadGlobalNotifications();
});

watch(() => route.fullPath, refreshUnread);

async function logout() {
  try {
    await authApi.logout();
  } catch {
    // 退出接口失败也要清理本地会话。
  }
  sessionStore.logout();
  router.replace("/login");
}

function resetPasswordForm() {
  passwordForm.current = "";
  passwordForm.next = "";
  passwordForm.confirm = "";
}

async function openPassword() {
  resetPasswordForm();
  passwordOpen.value = true;
  try {
    passwordPolicy.value = await authApi.passwordPolicy();
  } catch {
    passwordPolicy.value = null;
  }
}

async function submitPassword() {
  if (!passwordForm.current || !passwordForm.next) {
    ElMessage.warning("请填写当前密码与新密码");
    return;
  }
  if (passwordForm.next !== passwordForm.confirm) {
    ElMessage.warning("两次输入的新密码不一致");
    return;
  }
  const minLength = passwordPolicy.value?.min_length ?? 8;
  if (passwordForm.next.length < minLength) {
    ElMessage.warning(`新密码至少 ${minLength} 位`);
    return;
  }
  passwordSaving.value = true;
  try {
    await authApi.changePassword(passwordForm.current, passwordForm.next);
    passwordOpen.value = false;
    sessionStore.logout();
    ElMessage.success("密码已修改，请重新登录");
    router.replace("/login");
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    passwordSaving.value = false;
  }
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
          <button
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition"
            :class="inConnections ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'"
            @click="router.push('/connections')"
          >
            <span class="flex items-center gap-2.5">
              <span class="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px]">⇄</span>
              集成连接
            </span>
            <span v-if="inConnections" class="text-[9px] text-indigo-300">当前</span>
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
          <el-popover
            v-model:visible="notificationOpen"
            placement="bottom-end"
            :width="390"
            trigger="click"
            popper-style="padding: 0"
          >
            <template #reference>
              <button
                class="relative grid h-9 w-9 place-items-center rounded-full border transition"
                :class="unread
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:border-indigo-300'
                  : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'"
                type="button"
                title="全局通知"
                aria-label="全局通知"
              >
                <span class="text-[16px] leading-none">✉</span>
                <span
                  v-if="unread"
                  class="absolute -right-1.5 -top-1.5 min-w-[17px] rounded-full bg-rose-500 px-1 text-center text-[9px] font-semibold leading-[17px] text-white"
                >
                  {{ unreadLabel }}
                </span>
              </button>
            </template>

            <div class="overflow-hidden rounded-xl">
              <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p class="text-[13px] font-semibold text-slate-800">全局通知</p>
                  <p class="mt-0.5 text-[10.5px] text-slate-400">
                    {{ unread ? `${unread} 条未读` : "全部已读" }} · 跨应用汇总
                  </p>
                </div>
                <button
                  v-if="unread"
                  class="text-[11.5px] font-medium text-indigo-600 transition hover:text-indigo-700"
                  type="button"
                  @click="markAllRead"
                >
                  全部已读
                </button>
              </div>

              <div
                v-if="notificationLoading && !notifications.length"
                class="px-4 py-10 text-center text-[11.5px] text-slate-400"
              >
                加载中…
              </div>
              <div v-else-if="notifications.length" class="max-h-[420px] overflow-y-auto">
                <button
                  v-for="item in notifications"
                  :key="item.id"
                  class="flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50"
                  type="button"
                  @click="openNotification(item)"
                >
                  <span
                    class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    :class="item.read ? 'bg-slate-200' : 'bg-indigo-500'"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-start justify-between gap-2">
                      <span
                        class="truncate text-[12.5px] font-medium"
                        :class="item.read ? 'text-slate-500' : 'text-slate-800'"
                      >
                        {{ item.title }}
                      </span>
                      <span class="shrink-0 text-[10px] text-slate-400">
                        {{ formatDateTime(item.created_at) }}
                      </span>
                    </span>
                    <span v-if="item.body" class="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                      {{ item.body }}
                    </span>
                  </span>
                </button>
              </div>
              <div v-else class="px-4 py-10 text-center text-[11.5px] text-slate-400">
                暂无通知
              </div>
            </div>
          </el-popover>

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
            class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600"
            type="button"
            @click="openPassword"
          >
            修改密码
          </button>
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

    <el-dialog v-model="passwordOpen" title="修改密码" width="460px" @closed="resetPasswordForm">
      <el-form label-position="top">
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.current" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.next" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirm" type="password" show-password />
        </el-form-item>
        <p class="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
          {{ passwordRule }}
        </p>
      </el-form>
      <template #footer>
        <el-button @click="passwordOpen = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPassword">确认修改</el-button>
      </template>
    </el-dialog>

  </div>
</template>
