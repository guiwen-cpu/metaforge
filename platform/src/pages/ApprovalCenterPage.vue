<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { platformApi } from "@/api/platform";
import { runtimeApi } from "@/api/runtime";
import { errorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import { workflowStatusClass, workflowStatusMeta } from "@/lib/runtime";
import type { AppView } from "@/types/platform";
import type { InstanceSummary, NotificationItem, TaskSummary } from "@/types/runtime";

type TabKey = "todo" | "done" | "initiated";

interface RuntimeRow {
  id: string;
  title: string;
  businessKey: string;
  flowName: string;
  node: string;
  applicant: string;
  status: string;
  time: string;
  kind: "task" | "instance";
}

const route = useRoute();
const router = useRouter();
const appId = computed(() => String(route.params.appId ?? ""));

const app = ref<AppView | null>(null);
const tab = ref<TabKey>("todo");
const todo = ref<TaskSummary[]>([]);
const done = ref<TaskSummary[]>([]);
const initiated = ref<InstanceSummary[]>([]);
const query = ref("");
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
const notifications = ref<NotificationItem[]>([]);
const unread = ref(0);
const notificationOpen = ref(false);

const counts = computed(() => ({
  todo: todo.value.length,
  done: done.value.length,
  initiated: initiated.value.length
}));

const unreadLabel = computed(() => (unread.value > 99 ? "99+" : String(unread.value)));

const tabs = computed(() => [
  { key: "todo" as TabKey, label: "待办", count: counts.value.todo, hint: "需要我处理" },
  { key: "done" as TabKey, label: "已办", count: counts.value.done, hint: "我处理过的任务" },
  { key: "initiated" as TabKey, label: "我发起", count: counts.value.initiated, hint: "我提交的流程" }
]);

const rows = computed<RuntimeRow[]>(() => {
  const keyword = query.value.trim().toLowerCase();
  const source: RuntimeRow[] = tab.value === "initiated"
    ? initiated.value.map((item) => ({
        id: item.process_instance_id,
        title: item.business_title,
        businessKey: item.business_key,
        flowName: item.flow_name,
        node: item.finished ? "流程已结束" : "审批进行中",
        applicant: item.applicant_id || "—",
        status: item.status || (item.finished ? "approved" : "pending"),
        time: item.started_at || "",
        kind: "instance" as const
      }))
    : (tab.value === "todo" ? todo.value : done.value).map((item) => ({
        id: item.task_id,
        title: item.business_title,
        businessKey: item.business_key,
        flowName: item.flow_name,
        node: item.task_name,
        applicant: item.applicant_id || "—",
        status: item.status || "pending",
        time: item.created_at || "",
        kind: "task" as const
      }));
  if (!keyword) return source;
  return source.filter((item) =>
    [item.title, item.businessKey, item.flowName, item.node, item.applicant]
      .some((value) => value.toLowerCase().includes(keyword))
  );
});

const emptyText = computed(() => {
  if (tab.value === "todo") return "当前没有待办任务";
  if (tab.value === "done") return "还没有办理过的任务";
  return "还没有发起过流程";
});

const emptyHint = computed(() => {
  if (tab.value === "todo") return "可切换右上角操作人，查看其他角色的待办。";
  if (tab.value === "done") return "办理完成后，任务会出现在这里。";
  return "通过流程启动接口或业务页面提交后，实例会汇总到这里。";
});

async function load() {
  if (!appId.value) return;
  loading.value = true;
  error.value = "";
  try {
    const [appInfo, todoList, doneList, initiatedList, feed] = await Promise.all([
      platformApi.getApp(appId.value).catch(() => null),
      runtimeApi.todo(appId.value),
      runtimeApi.done(appId.value),
      runtimeApi.initiated(appId.value),
      runtimeApi.notifications(appId.value, 8).catch(() => ({ items: [], unread: 0 }))
    ]);
    app.value = appInfo;
    todo.value = todoList;
    done.value = doneList;
    initiated.value = initiatedList;
    notifications.value = feed.items;
    unread.value = feed.unread;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function switchTab(key: TabKey) {
  tab.value = key;
}

function openRow(row: RuntimeRow) {
  if (row.kind === "task") {
    router.push({ name: "app-approval-detail", params: { appId: appId.value, taskId: row.id } });
    return;
  }
  router.push({ name: "app-instance-detail", params: { appId: appId.value, instanceId: row.id } });
}

function notificationLink(item: NotificationItem): string | null {
  if (item.link) return item.link;
  if (item.biz_type === "task" && item.biz_id) {
    return `/apps/${appId.value}/approvals/${item.biz_id}`;
  }
  if (item.biz_type === "instance" && item.biz_id) {
    return `/apps/${appId.value}/instances/${item.biz_id}`;
  }
  return null;
}

async function markNotificationRead(item: NotificationItem) {
  if (item.read) return;
  try {
    const updated = await runtimeApi.readNotification(appId.value, item.id);
    const index = notifications.value.findIndex((entry) => entry.id === item.id);
    if (index >= 0) notifications.value[index] = updated;
    unread.value = Math.max(0, unread.value - 1);
  } catch (err) {
    ElMessage.error(errorMessage(err));
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
    await runtimeApi.readAllNotifications(appId.value);
    notifications.value = notifications.value.map((item) => ({ ...item, read: true }));
    unread.value = 0;
  } catch (err) {
    ElMessage.error(errorMessage(err));
  }
}

function backToApp() {
  router.push({ name: "app-detail", params: { appId: appId.value } });
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[1280px]">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-[12px] text-slate-400">
          <button class="transition hover:text-indigo-600" @click="backToApp">← 应用详情</button>
          <span class="text-slate-300">/</span>
          <span>{{ app?.name || "当前应用" }}</span>
        </div>
        <h1 class="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">审批中心</h1>
        <p class="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          待办、已办与我发起的流程都来自发布态运行时。审批动作按流程节点声明渲染，不在页面里写死。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <el-popover
          v-model:visible="notificationOpen"
          placement="bottom-end"
          :width="380"
          trigger="click"
          popper-style="padding: 0"
        >
          <template #reference>
            <button
              class="relative grid h-8 w-8 place-items-center rounded-full border transition"
              :class="unread
                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:border-indigo-300'
                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'"
              title="通知"
            >
              <span class="text-[15px] leading-none">✉</span>
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
                <p class="text-[13px] font-semibold text-slate-800">通知</p>
                <p class="mt-0.5 text-[10.5px] text-slate-400">
                  {{ unread ? `${unread} 条未读` : "全部已读" }}
                </p>
              </div>
              <button
                v-if="unread"
                class="text-[11.5px] font-medium text-indigo-600 transition hover:text-indigo-700"
                @click="markAllRead"
              >
                全部已读
              </button>
            </div>

            <div v-if="notifications.length" class="max-h-[360px] overflow-y-auto">
              <button
                v-for="item in notifications"
                :key="item.id"
                class="flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50"
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

        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="app" @click="backToApp">返回应用</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="mt-5" />

    <div class="mt-6 grid gap-4 sm:grid-cols-3">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="group relative overflow-hidden rounded-2xl border bg-white p-5 text-left transition"
        :class="tab === item.key
          ? 'border-indigo-300 shadow-[0_8px_30px_rgba(79,70,229,0.08)] ring-1 ring-indigo-100'
          : 'border-slate-200/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'"
        @click="switchTab(item.key)"
      >
        <span
          class="absolute -right-6 -top-6 h-20 w-20 rounded-full transition"
          :class="tab === item.key ? 'bg-indigo-50' : 'bg-slate-50 group-hover:bg-indigo-50/60'"
        />
        <p class="relative text-[12px] font-medium text-slate-500">{{ item.label }}</p>
        <p class="relative mt-2 text-[30px] font-semibold leading-none tracking-tight text-slate-900">
          {{ item.count }}
        </p>
        <p class="relative mt-2 text-[11px] text-slate-400">{{ item.hint }}</p>
        <span class="absolute right-4 top-4 text-slate-300 transition group-hover:text-indigo-400">↗</span>
      </button>
    </div>

    <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <div class="flex rounded-lg bg-slate-100 p-0.5">
          <button
            v-for="item in tabs"
            :key="item.key"
            class="rounded-md px-3 py-1.5 text-[12px] font-medium transition"
            :class="tab === item.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="switchTab(item.key)"
          >
            {{ item.label }}
            <span :class="tab === item.key ? 'text-indigo-500' : 'text-slate-400'">{{ item.count }}</span>
          </button>
        </div>

        <el-input
          v-model="query"
          placeholder="搜索标题、流程、节点或申请人"
          clearable
          class="!w-[300px]"
        >
          <template #prefix><span class="text-slate-400">⌕</span></template>
        </el-input>

        <div class="ml-auto flex items-center gap-2 text-[11.5px] text-slate-400">
          <span>共 {{ rows.length }} 条</span>
          <button class="rounded p-1 transition hover:bg-slate-100 hover:text-slate-600" @click="load">↻</button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        :row-style="{ cursor: 'pointer' }"
        @row-click="openRow"
      >
        <el-table-column label="单据" min-width="250">
          <template #default="{ row }">
            <p class="truncate text-[13.5px] font-medium text-slate-800">{{ row.title }}</p>
            <p class="mt-0.5 truncate font-mono text-[10.5px] text-slate-400">{{ row.businessKey }}</p>
          </template>
        </el-table-column>

        <el-table-column label="流程" width="150">
          <template #default="{ row }">
            <span class="text-[12.5px] text-slate-600">{{ row.flowName }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="tab === 'initiated' ? '进度' : '当前节点'" width="160">
          <template #default="{ row }">
            <span class="text-[12.5px] text-slate-600">{{ row.node }}</span>
          </template>
        </el-table-column>

        <el-table-column label="申请人" width="120">
          <template #default="{ row }">
            <span class="text-[12.5px] text-slate-500">{{ row.applicant }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span :class="workflowStatusClass(row.status)">{{ workflowStatusMeta(row.status).label }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="tab === 'initiated' ? '发起时间' : '收到时间'" width="170">
          <template #default="{ row }">
            <span class="text-[11.5px] text-slate-400">{{ formatDateTime(row.time) }}</span>
          </template>
        </el-table-column>

        <el-table-column width="48" align="right">
          <template #default>
            <span class="text-slate-300">→</span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="py-14 text-center">
            <div class="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-lg text-slate-300">
              ◇
            </div>
            <p class="mt-3 text-[13px] font-medium text-slate-500">{{ loaded ? emptyText : "正在加载" }}</p>
            <p class="mt-1 text-[11.5px] text-slate-400">{{ emptyHint }}</p>
          </div>
        </template>
      </el-table>
    </div>
  </div>
</template>
