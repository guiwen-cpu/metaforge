<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { authApi, identityApi } from "@/api/identity";
import { platformApi } from "@/api/platform";
import { errorMessage } from "@/lib/http";
import type { AppView } from "@/types/platform";
import type {
  AuthAudit,
  DepartmentPayload,
  IdentityOverview,
  IdentityUser,
  PasswordPolicy,
  PositionPayload,
  UserPayload
} from "@/types/identity";

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const activeTab = ref("users");
const overview = ref<IdentityOverview | null>(null);
const apps = ref<AppView[]>([]);
const appId = ref(typeof route.query.appId === "string" ? route.query.appId : "");
const passwordPolicy = ref<PasswordPolicy | null>(null);
const audits = ref<AuthAudit[]>([]);
const auditLoading = ref(false);
const auditUsername = ref("");
const auditEvent = ref("");
const auditSuccess = ref("");

const departments = computed(() => overview.value?.departments ?? []);
const positions = computed(() => overview.value?.positions ?? []);
const users = computed(() => overview.value?.users ?? []);
const tenantRoles = computed(() => (overview.value?.roles ?? []).filter((role) => !role.app_id));
const appRoles = computed(() => (overview.value?.roles ?? []).filter((role) => !!role.app_id));

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

async function load() {
  loading.value = true;
  try {
    overview.value = await identityApi.overview(appId.value || undefined);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function loadApps() {
  try {
    const result = await platformApi.listApps({ page: 1, size: 100 });
    apps.value = result.items;
  } catch {
    apps.value = [];
  }
}

function changeApp() {
  router.replace({ name: "identity", query: appId.value ? { appId: appId.value } : {} });
  load();
}

async function loadPasswordPolicy() {
  try {
    passwordPolicy.value = await authApi.passwordPolicy();
  } catch {
    passwordPolicy.value = null;
  }
}

async function loadAudits() {
  auditLoading.value = true;
  try {
    audits.value = await identityApi.authAudits({
      username: auditUsername.value.trim() || undefined,
      eventType: auditEvent.value || undefined,
      success: auditSuccess.value === "" ? undefined : auditSuccess.value === "true",
      limit: 100
    });
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    auditLoading.value = false;
  }
}

function changeTab(name: string | number) {
  if (name === "audits") loadAudits();
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function auditEventLabel(value: string) {
  return value === "login_success"
    ? "登录成功"
    : value === "login_failure"
      ? "登录失败"
      : value === "password_change"
        ? "修改密码"
        : value;
}

function auditReasonLabel(value?: string | null) {
  if (!value) return "—";
  return (
    {
      user_not_found: "用户不存在",
      user_disabled: "账号已停用",
      account_locked: "账号已锁定",
      bad_password: "密码错误",
      profile_missing: "用户档案缺失",
      bad_current_password: "当前密码错误"
    }[value] ?? value
  );
}

// ------------------------------------------------------------ 部门

const deptOpen = ref(false);
const deptEditing = ref<string | null>(null);
const deptForm = reactive({
  id: "",
  key: "",
  name: "",
  parentId: "",
  leaderUserId: "",
  sort: 0,
  enabled: true
});

function openDept(row?: IdentityOverview["departments"][number]) {
  deptEditing.value = row?.id ?? null;
  deptForm.id = row?.id ?? "";
  deptForm.key = row?.key ?? "";
  deptForm.name = row?.name ?? "";
  deptForm.parentId = row?.parent_id ?? "";
  deptForm.leaderUserId = row?.leader_user_id ?? "";
  deptForm.sort = row?.sort ?? 0;
  deptForm.enabled = row?.enabled ?? true;
  deptOpen.value = true;
}

async function saveDept() {
  if (!deptForm.name.trim() || (!deptEditing.value && !deptForm.id.trim())) {
    ElMessage.warning("请填写部门 ID 与名称");
    return;
  }
  const payload: DepartmentPayload = {
    id: deptForm.id.trim() || undefined,
    key: deptForm.id.trim() || undefined,
    name: deptForm.name.trim(),
    parentId: deptForm.parentId || null,
    leaderUserId: deptForm.leaderUserId || null,
    sort: deptForm.sort,
    enabled: deptForm.enabled
  };
  saving.value = true;
  try {
    if (deptEditing.value) {
      await identityApi.updateDepartment(deptEditing.value, payload);
    } else {
      await identityApi.createDepartment(payload);
    }
    deptOpen.value = false;
    ElMessage.success("部门已保存");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function removeDept(row: IdentityOverview["departments"][number]) {
  try {
    await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, "删除部门", { type: "warning" });
    await identityApi.deleteDepartment(row.id);
    ElMessage.success("部门已删除");
    await load();
  } catch (error) {
    if (error !== "cancel") ElMessage.error(errorMessage(error));
  }
}

// ------------------------------------------------------------ 岗位

const posOpen = ref(false);
const posEditing = ref<string | null>(null);
const posForm = reactive({
  id: "",
  key: "",
  name: "",
  deptId: "",
  sort: 0,
  enabled: true
});

function openPos(row?: IdentityOverview["positions"][number]) {
  posEditing.value = row?.id ?? null;
  posForm.id = row?.id ?? "";
  posForm.key = row?.key ?? "";
  posForm.name = row?.name ?? "";
  posForm.deptId = row?.dept_id ?? "";
  posForm.sort = row?.sort ?? 0;
  posForm.enabled = row?.enabled ?? true;
  posOpen.value = true;
}

async function savePos() {
  if (!posForm.name.trim() || (!posEditing.value && !posForm.id.trim())) {
    ElMessage.warning("请填写岗位 ID 与名称");
    return;
  }
  const payload: PositionPayload = {
    id: posForm.id.trim() || undefined,
    key: posForm.id.trim() || undefined,
    name: posForm.name.trim(),
    deptId: posForm.deptId || null,
    sort: posForm.sort,
    enabled: posForm.enabled
  };
  saving.value = true;
  try {
    if (posEditing.value) {
      await identityApi.updatePosition(posEditing.value, payload);
    } else {
      await identityApi.createPosition(payload);
    }
    posOpen.value = false;
    ElMessage.success("岗位已保存");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function removePos(row: IdentityOverview["positions"][number]) {
  try {
    await ElMessageBox.confirm(`确认删除岗位「${row.name}」？`, "删除岗位", { type: "warning" });
    await identityApi.deletePosition(row.id);
    ElMessage.success("岗位已删除");
    await load();
  } catch (error) {
    if (error !== "cancel") ElMessage.error(errorMessage(error));
  }
}

// ------------------------------------------------------------ 用户

const userOpen = ref(false);
const userEditing = ref<string | null>(null);
const userForm = reactive({
  id: "",
  username: "",
  displayName: "",
  password: "",
  email: "",
  phone: "",
  deptId: "",
  positionId: "",
  status: "active"
});

function openUser(row?: IdentityUser) {
  userEditing.value = row?.id ?? null;
  userForm.id = row?.id ?? "";
  userForm.username = row?.username ?? "";
  userForm.displayName = row?.display_name ?? "";
  userForm.password = "";
  userForm.email = row?.email ?? "";
  userForm.phone = row?.phone ?? "";
  userForm.deptId = row?.dept_id ?? "";
  userForm.positionId = row?.position_id ?? "";
  userForm.status = row?.status ?? "active";
  userOpen.value = true;
}

async function saveUser() {
  if (!userForm.displayName.trim()) {
    ElMessage.warning("请填写显示名");
    return;
  }
  const minPasswordLength = passwordPolicy.value?.min_length ?? 8;
  if (!userEditing.value && (!userForm.username.trim() || userForm.password.length < minPasswordLength)) {
    ElMessage.warning(`新建用户需要登录名与至少 ${minPasswordLength} 位密码`);
    return;
  }
  if (userEditing.value && userForm.password && userForm.password.length < minPasswordLength) {
    ElMessage.warning(`重置密码至少 ${minPasswordLength} 位`);
    return;
  }
  const payload: UserPayload = {
    id: userForm.id.trim() || undefined,
    username: userForm.username.trim() || undefined,
    displayName: userForm.displayName.trim(),
    password: userForm.password || undefined,
    email: userForm.email || null,
    phone: userForm.phone || null,
    deptId: userForm.deptId || null,
    positionId: userForm.positionId || null,
    status: userForm.status
  };
  saving.value = true;
  try {
    if (userEditing.value) {
      await identityApi.updateUser(userEditing.value, payload);
    } else {
      await identityApi.createUser(payload);
    }
    userOpen.value = false;
    ElMessage.success("用户已保存");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function removeUser(row: IdentityUser) {
  try {
    await ElMessageBox.confirm(`确认删除用户「${row.display_name}」？`, "删除用户", {
      type: "warning"
    });
    await identityApi.deleteUser(row.id);
    ElMessage.success("用户已删除");
    await load();
  } catch (error) {
    if (error !== "cancel") ElMessage.error(errorMessage(error));
  }
}

// ------------------------------------------------------------ 角色绑定

const roleOpen = ref(false);
const roleUser = ref<IdentityUser | null>(null);
const tenantSelection = ref<string[]>([]);
const appSelection = ref<string[]>([]);

function openRoles(row: IdentityUser) {
  roleUser.value = row;
  const bindings = row.roles ?? [];
  tenantSelection.value = bindings.filter((role) => !role.app_id).map((role) => role.role_key);
  appSelection.value = appId.value
    ? bindings.filter((role) => role.app_id === appId.value).map((role) => role.role_key)
    : [];
  roleOpen.value = true;
}

async function saveRoles() {
  if (!roleUser.value) return;
  saving.value = true;
  try {
    await identityApi.setUserRoles(roleUser.value.id, null, tenantSelection.value);
    if (appId.value) {
      await identityApi.setUserRoles(roleUser.value.id, appId.value, appSelection.value);
    }
    roleOpen.value = false;
    ElMessage.success("角色已更新");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

function roleSummary(row: IdentityUser) {
  const bindings = row.roles ?? [];
  if (!bindings.length) return "未分配";
  return bindings.map((role) => role.role_name || role.role_key).join(" / ");
}

onMounted(async () => {
  await Promise.all([loadApps(), load(), loadPasswordPolicy()]);
});
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-[20px] font-semibold text-slate-800">组织与权限</h2>
        <p class="mt-1 text-[12px] text-slate-500">
          部门、岗位与用户授权。应用角色来自发布件，用户绑定按租户 / 应用两个层级维护。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-slate-400">应用角色范围</span>
        <el-select v-model="appId" class="w-[220px]" placeholder="仅租户角色" @change="changeApp">
          <el-option label="仅租户角色" value="" />
          <el-option v-for="app in apps" :key="app.id" :label="app.name" :value="app.id" />
        </el-select>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="rounded-xl border border-slate-200 bg-white px-5 py-4" @tab-change="changeTab">
      <el-tab-pane label="用户" name="users">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[12px] text-slate-500">共 {{ users.length }} 个用户</p>
          <el-button type="primary" size="small" @click="openUser()">新增用户</el-button>
        </div>
        <el-table v-loading="loading" :data="users" size="small">
          <el-table-column prop="username" label="登录名" width="120" />
          <el-table-column prop="display_name" label="显示名" width="150" />
          <el-table-column prop="dept_name" label="部门" width="130" />
          <el-table-column prop="position_name" label="岗位" width="120" />
          <el-table-column label="角色" min-width="200">
            <template #default="{ row }">
              <span class="text-[12px] text-slate-600">{{ roleSummary(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <span :class="row.status === 'active' ? 'text-emerald-600' : 'text-slate-400'">
                {{ row.status === "active" ? "启用" : "停用" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="190" align="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRoles(row)">角色</el-button>
              <el-button link type="primary" @click="openUser(row)">编辑</el-button>
              <el-button link type="danger" @click="removeUser(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="部门" name="departments">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[12px] text-slate-500">共 {{ departments.length }} 个部门</p>
          <el-button type="primary" size="small" @click="openDept()">新增部门</el-button>
        </div>
        <el-table v-loading="loading" :data="departments" size="small">
          <el-table-column prop="id" label="ID" width="130" />
          <el-table-column prop="name" label="名称" width="160" />
          <el-table-column prop="path" label="层级路径" min-width="200" />
          <el-table-column prop="leader_name" label="负责人" width="130" />
          <el-table-column prop="sort" label="排序" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <span :class="row.enabled ? 'text-emerald-600' : 'text-slate-400'">
                {{ row.enabled ? "启用" : "停用" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDept(row)">编辑</el-button>
              <el-button link type="danger" @click="removeDept(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="岗位" name="positions">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[12px] text-slate-500">共 {{ positions.length }} 个岗位</p>
          <el-button type="primary" size="small" @click="openPos()">新增岗位</el-button>
        </div>
        <el-table v-loading="loading" :data="positions" size="small">
          <el-table-column prop="id" label="ID" width="130" />
          <el-table-column prop="name" label="名称" width="160" />
          <el-table-column prop="dept_name" label="所属部门" width="150" />
          <el-table-column prop="sort" label="排序" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <span :class="row.enabled ? 'text-emerald-600' : 'text-slate-400'">
                {{ row.enabled ? "启用" : "停用" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openPos(row)">编辑</el-button>
              <el-button link type="danger" @click="removePos(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="认证审计" name="audits">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <el-input v-model="auditUsername" class="w-[180px]" clearable placeholder="登录名" />
          <el-select v-model="auditEvent" class="w-[150px]" clearable placeholder="全部事件">
            <el-option label="登录成功" value="login_success" />
            <el-option label="登录失败" value="login_failure" />
            <el-option label="修改密码" value="password_change" />
          </el-select>
          <el-select v-model="auditSuccess" class="w-[120px]" placeholder="全部结果">
            <el-option label="全部结果" value="" />
            <el-option label="成功" value="true" />
            <el-option label="失败" value="false" />
          </el-select>
          <el-button type="primary" size="small" @click="loadAudits">查询</el-button>
          <span class="text-[11px] text-slate-400">最近 100 条</span>
        </div>
        <el-table v-loading="auditLoading" :data="audits" size="small">
          <el-table-column label="时间" width="175">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column prop="username" label="登录名" width="130" />
          <el-table-column label="事件" width="105">
            <template #default="{ row }">{{ auditEventLabel(row.event_type) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="80">
            <template #default="{ row }">
              <span :class="row.success ? 'text-emerald-600' : 'text-rose-500'">
                {{ row.success ? "成功" : "失败" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="130">
            <template #default="{ row }">{{ auditReasonLabel(row.reason) }}</template>
          </el-table-column>
          <el-table-column label="IP" width="145">
            <template #default="{ row }">{{ row.ip || "—" }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="deptOpen" :title="deptEditing ? '编辑部门' : '新增部门'" width="480px">
      <el-form label-position="top">
        <el-form-item label="部门 ID">
          <el-input v-model="deptForm.id" :disabled="!!deptEditing" placeholder="dept_cs" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="deptForm.name" placeholder="计算机系" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="deptForm.parentId" class="w-full" clearable placeholder="无（根部门）">
            <el-option
              v-for="dept in departments.filter((item) => item.id !== deptEditing)"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="deptForm.leaderUserId" class="w-full" clearable placeholder="未指定">
            <el-option
              v-for="user in users"
              :key="user.id"
              :label="`${user.display_name}（${user.username}）`"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="排序">
            <el-input-number v-model="deptForm.sort" :min="0" class="w-full" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="deptForm.enabled" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="deptOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDept">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="posOpen" :title="posEditing ? '编辑岗位' : '新增岗位'" width="460px">
      <el-form label-position="top">
        <el-form-item label="岗位 ID">
          <el-input v-model="posForm.id" :disabled="!!posEditing" placeholder="pos_teacher" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="posForm.name" placeholder="教师" />
        </el-form-item>
        <el-form-item label="所属部门">
          <el-select v-model="posForm.deptId" class="w-full" clearable placeholder="未指定">
            <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
          </el-select>
        </el-form-item>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="排序">
            <el-input-number v-model="posForm.sort" :min="0" class="w-full" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="posForm.enabled" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="posOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePos">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="userOpen" :title="userEditing ? '编辑用户' : '新增用户'" width="520px">
      <el-form label-position="top">
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="登录名">
            <el-input v-model="userForm.username" :disabled="!!userEditing" placeholder="alice" />
          </el-form-item>
          <el-form-item label="显示名">
            <el-input v-model="userForm.displayName" placeholder="Alice" />
          </el-form-item>
        </div>
        <el-form-item :label="userEditing ? '重置密码（留空不变）' : '初始密码'">
          <el-input v-model="userForm.password" type="password" show-password />
          <p class="mt-1 text-[11px] leading-5 text-slate-400">{{ passwordRule }}</p>
        </el-form-item>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="部门">
            <el-select v-model="userForm.deptId" class="w-full" clearable>
              <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="岗位">
            <el-select v-model="userForm.positionId" class="w-full" clearable>
              <el-option v-for="pos in positions" :key="pos.id" :label="pos.name" :value="pos.id" />
            </el-select>
          </el-form-item>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="邮箱">
            <el-input v-model="userForm.email" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="userForm.status" class="w-full">
              <el-option label="启用" value="active" />
              <el-option label="停用" value="disabled" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="userOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleOpen" title="分配角色" width="520px">
      <p class="mb-4 text-[12px] text-slate-500">
        用户：<span class="font-medium text-slate-700">{{ roleUser?.display_name }}</span>
      </p>
      <div class="space-y-4">
        <div>
          <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            租户级角色
          </p>
          <el-checkbox-group v-model="tenantSelection" class="flex flex-wrap gap-2">
            <el-checkbox v-for="role in tenantRoles" :key="role.id" :value="role.key" border>
              {{ role.name }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <div v-if="appId">
          <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            应用角色
          </p>
          <el-checkbox-group v-model="appSelection" class="flex flex-wrap gap-2">
            <el-checkbox v-for="role in appRoles" :key="role.id" :value="role.key" border>
              {{ role.name }} · {{ role.data_scope }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <p v-else class="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          选择上方应用后可同时维护应用级角色。
        </p>
      </div>
      <template #footer>
        <el-button @click="roleOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRoles">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>