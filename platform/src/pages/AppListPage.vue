<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformApi, type CreateAppPayload } from "@/api/platform";
import { ApiError, errorMessage } from "@/lib/http";
import { appTypeLabel, formatDateTime, statusMeta } from "@/lib/format";
import type { AppView } from "@/types/platform";

const router = useRouter();

const apps = ref<AppView[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const loading = ref(false);
const query = ref("");
const status = ref("");
const appliedQuery = ref("");

const createOpen = ref(false);
const creating = ref(false);
const form = reactive<CreateAppPayload>({
  key: "",
  name: "",
  description: "",
  type: "business",
  category: ""
});

const keyPattern = /^[a-z][a-z0-9_]{0,62}$/;
const canCreate = computed(
  () => form.name.trim().length > 0 && keyPattern.test(form.key.trim())
);

async function load() {
  loading.value = true;
  try {
    const result = await platformApi.listApps({
      page: page.value,
      size: size.value,
      q: appliedQuery.value || undefined,
      status: status.value || undefined
    });
    apps.value = result.items;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function search() {
  appliedQuery.value = query.value.trim();
  page.value = 1;
  load();
}

function resetFilters() {
  query.value = "";
  appliedQuery.value = "";
  status.value = "";
  page.value = 1;
  load();
}

function openCreate() {
  form.key = "";
  form.name = "";
  form.description = "";
  form.type = "business";
  form.category = "";
  createOpen.value = true;
}

async function submitCreate() {
  if (!canCreate.value) return;
  creating.value = true;
  try {
    const created = await platformApi.createApp({
      key: form.key.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      type: form.type,
      category: form.category?.trim() || undefined
    });
    createOpen.value = false;
    ElMessage.success("应用已创建");
    router.push({ name: "app-detail", params: { appId: created.id } });
  } catch (error) {
    if (error instanceof ApiError && error.code === "app_key_exists") {
      ElMessage.error("应用 key 已存在，请换一个");
    } else {
      ElMessage.error(errorMessage(error));
    }
  } finally {
    creating.value = false;
  }
}

function openApp(row: AppView) {
  router.push({ name: "app-detail", params: { appId: row.id } });
}

async function removeApp(row: AppView) {
  try {
    await ElMessageBox.confirm(
      `将归档「${row.name}」。历史版本会保留，但工作台不再展示该应用。`,
      "归档应用",
      { type: "warning", confirmButtonText: "归档", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    await platformApi.deleteApp(row.id);
    ElMessage.success("应用已归档");
    if (apps.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

function onPageChange(next: number) {
  page.value = next;
  load();
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[1240px]">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight text-slate-900">应用工作台</h1>
        <p class="mt-1.5 text-[13px] text-slate-500">
          管理应用草稿与发布版本。页面设计器、数据模型设计器都会写入同一份 AppBundle。
        </p>
      </div>
      <el-button type="primary" size="large" @click="openCreate">
        <span class="mr-1 text-base leading-none">＋</span> 新建应用
      </el-button>
    </div>

    <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <el-input
          v-model="query"
          placeholder="搜索名称、key 或描述"
          clearable
          class="!w-[280px]"
          @keyup.enter="search"
          @clear="search"
        >
          <template #prefix>
            <span class="text-slate-400">⌕</span>
          </template>
        </el-input>
        <el-select v-model="status" placeholder="全部状态" clearable class="!w-[140px]" @change="search">
          <el-option label="草稿" value="draft" />
          <el-option label="已发布" value="published" />
        </el-select>
        <el-button @click="search">查询</el-button>
        <el-button text class="!text-slate-500" @click="resetFilters">重置</el-button>
        <div class="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span>共 {{ total }} 个应用</span>
          <button class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" @click="load">
            ↻
          </button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="apps"
        class="w-full"
        row-key="id"
        :row-style="{ cursor: 'pointer' }"
        @row-click="openApp"
      >
        <el-table-column label="应用" min-width="260">
          <template #default="{ row }">
            <div class="flex items-center gap-3 py-1">
              <div
                class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 text-sm font-semibold text-indigo-600"
              >
                {{ row.name.slice(0, 1).toUpperCase() }}
              </div>
              <div class="min-w-0">
                <p class="truncate text-[13.5px] font-medium text-slate-800">{{ row.name }}</p>
                <p class="mt-0.5 truncate font-mono text-[11px] text-slate-400">{{ row.key }}</p>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <span class="text-[12.5px] text-slate-600">{{ appTypeLabel(row.type) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
              :class="{
                'bg-amber-50 text-amber-700': statusMeta(row.status).tone === 'draft',
                'bg-emerald-50 text-emerald-700': statusMeta(row.status).tone === 'published',
                'bg-slate-100 text-slate-500': statusMeta(row.status).tone === 'archived'
              }"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="{
                  'bg-amber-500': statusMeta(row.status).tone === 'draft',
                  'bg-emerald-500': statusMeta(row.status).tone === 'published',
                  'bg-slate-400': statusMeta(row.status).tone === 'archived'
                }"
              />
              {{ statusMeta(row.status).label }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="当前版本" width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.current_version" class="font-mono text-[12.5px] text-slate-700">
              v{{ row.current_version }}
            </span>
            <span v-else class="text-[12px] text-slate-300">—</span>
          </template>
        </el-table-column>

        <el-table-column label="草稿修订" width="110" align="center">
          <template #default="{ row }">
            <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11.5px] text-slate-500">
              r{{ row.draft_revision }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="最近更新" width="170">
          <template #default="{ row }">
            <span class="text-[12px] text-slate-500">{{ formatDateTime(row.updated_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="" width="130" align="right">
          <template #default="{ row }">
            <div class="flex items-center justify-end gap-1" @click.stop>
              <el-button text size="small" @click="openApp(row)">打开</el-button>
              <el-button text size="small" class="!text-rose-500" @click="removeApp(row)">归档</el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <div class="py-14">
            <el-empty description="还没有应用">
              <el-button type="primary" @click="openCreate">创建第一个应用</el-button>
            </el-empty>
          </div>
        </template>
      </el-table>

      <div v-if="total > size" class="flex justify-end border-t border-slate-100 px-5 py-3">
        <el-pagination
          layout="prev, pager, next"
          :current-page="page"
          :page-size="size"
          :total="total"
          background
          @current-change="onPageChange"
        />
      </div>
    </div>

    <el-dialog v-model="createOpen" title="新建应用" width="520px">
      <el-form label-position="top">
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="应用名称" required>
            <el-input v-model="form.name" placeholder="例如：请假审批" maxlength="64" />
          </el-form-item>
          <el-form-item label="应用 key" required>
            <el-input v-model="form.key" placeholder="leave_approval" maxlength="63" />
            <p class="mt-1 text-[11px] text-slate-400">小写字母开头，仅含小写字母、数字、下划线</p>
          </el-form-item>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="应用类型">
            <el-select v-model="form.type" class="w-full">
              <el-option label="业务系统" value="business" />
              <el-option label="教育" value="education" />
              <el-option label="办公" value="office" />
              <el-option label="模板" value="template" />
            </el-select>
          </el-form-item>
          <el-form-item label="分类">
            <el-input v-model="form.category" placeholder="例如：学生事务" />
          </el-form-item>
        </div>

        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="简要说明这个应用解决什么问题"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canCreate" @click="submitCreate">
          创建并打开
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>