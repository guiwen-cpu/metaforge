<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { authApi } from "@/api/identity";
import { errorMessage } from "@/lib/http";
import { useSessionStore } from "@/stores/session";
import type { IdentityUser } from "@/types/identity";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const form = reactive({
  tenant: "tenant_demo_school",
  username: "alice",
  password: "alice123"
});
const loading = ref(false);
const error = ref("");

const accounts = [
  { label: "Alice · 学生", username: "alice", password: "alice123" },
  { label: "Bob · 系主任", username: "bob", password: "bob123" },
  { label: "院长 · 院级管理员", username: "principal", password: "principal123" },
  { label: "人事 · 全校只读", username: "hr", password: "hr123" }
];

const canSubmit = computed(
  () => form.tenant.trim() && form.username.trim() && form.password.trim().length > 0
);

function useAccount(account: (typeof accounts)[number]) {
  form.username = account.username;
  form.password = account.password;
  error.value = "";
}

function profileOf(user: IdentityUser) {
  const keys = user.role_keys?.length
    ? user.role_keys
    : (user.roles ?? []).map((role) => role.role_key);
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    deptId: user.dept_id ?? null,
    deptName: user.dept_name ?? null,
    positionName: user.position_name ?? null,
    roleKeys: [...new Set(keys)]
  };
}

async function submit() {
  if (!canSubmit.value || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await authApi.login(
      form.tenant.trim(),
      form.username.trim(),
      form.password
    );
    sessionStore.applyLogin(
      result.token,
      result.expires_at,
      form.tenant.trim(),
      profileOf(result.user)
    );
    ElMessage.success(`欢迎，${result.user.display_name || result.user.username}`);
    const target = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    router.replace(target.startsWith("/") && !target.startsWith("//") ? target : "/");
  } catch (ex) {
    error.value = errorMessage(ex);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (sessionStore.isAuthenticated) {
    router.replace("/");
  }
});
</script>

<template>
  <div class="grid min-h-screen bg-surface lg:grid-cols-[1.1fr_1fr]">
    <section
      class="relative hidden flex-col justify-between overflow-hidden bg-ink px-14 py-12 text-white lg:flex"
    >
      <div
        class="pointer-events-none absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/25 blur-3xl"
      />
      <div
        class="pointer-events-none absolute -right-20 bottom-0 h-[360px] w-[360px] rounded-full bg-violet-500/20 blur-3xl"
      />

      <div class="relative flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-base font-bold shadow-lg shadow-indigo-900/40"
        >
          M
        </div>
        <div class="leading-tight">
          <p class="text-[17px] font-semibold tracking-wide">MetaForge</p>
          <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500">low-code studio</p>
        </div>
      </div>

      <div class="relative max-w-md">
        <p class="text-[11px] uppercase tracking-[0.24em] text-indigo-300">统一身份 · 组织 · 权限</p>
        <h1 class="mt-5 text-[34px] font-semibold leading-snug">
          元数据驱动的教务与办公平台
        </h1>
        <p class="mt-4 text-[13px] leading-7 text-slate-400">
          登录后由 JWT 携带租户与用户身份，角色、数据范围与字段白名单实时从发布件求值。
          组织架构、岗位与角色绑定统一在控制平面维护。
        </p>
        <div class="mt-8 grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p class="text-lg font-semibold">JWT</p>
            <p class="mt-1 text-[10px] text-slate-400">会话令牌</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p class="text-lg font-semibold">RLS</p>
            <p class="mt-1 text-[10px] text-slate-400">租户隔离</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p class="text-lg font-semibold">RBAC</p>
            <p class="mt-1 text-[10px] text-slate-400">行列级权限</p>
          </div>
        </div>
      </div>

      <p class="relative text-[10px] text-slate-600">控制平面 · protocol 0.1</p>
    </section>

    <section class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-[400px]">
        <div class="mb-8 lg:hidden">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-bold text-white"
          >
            M
          </div>
          <p class="mt-3 text-lg font-semibold text-slate-800">MetaForge</p>
        </div>

        <h2 class="text-[22px] font-semibold text-slate-800">登录控制平面</h2>
        <p class="mt-1.5 text-[13px] text-slate-500">
          使用租户内账号登录，登录态用于所有设计与运行时请求。
        </p>

        <el-form class="mt-7" label-position="top" @submit.prevent="submit">
          <el-form-item label="租户">
            <el-input v-model="form.tenant" placeholder="tenant_demo_school" autocomplete="organization" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="alice" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入密码"
              autocomplete="current-password"
              @keyup.enter="submit"
            />
          </el-form-item>

          <p v-if="error" class="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
            {{ error }}
          </p>

          <el-button
            class="w-full"
            type="primary"
            size="large"
            :loading="loading"
            :disabled="!canSubmit"
            @click="submit"
          >
            登录
          </el-button>
        </el-form>

        <div class="mt-7 border-t border-slate-200 pt-5">
          <p class="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            演示账号
          </p>
          <div class="mt-3 grid gap-2">
            <button
              v-for="account in accounts"
              :key="account.username"
              class="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[12px] text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-600"
              type="button"
              @click="useAccount(account)"
            >
              <span>{{ account.label }}</span>
              <span class="font-mono text-[11px] text-slate-400">{{ account.username }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>