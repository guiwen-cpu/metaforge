<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ApiError } from "@/lib/http";
import { useSession } from "@/stores/session";

const APP_NAME = "请假审批";
const session = useSession();
const route = useRoute();
const router = useRouter();

const form = reactive({
  tenant: session.tenantId,
  username: "",
  password: ""
});
const submitting = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  if (!form.tenant.trim() || !form.username.trim() || !form.password) {
    error.value = "请填写租户、用户名与密码";
    return;
  }
  submitting.value = true;
  try {
    await session.login(form.tenant.trim(), form.username.trim(), form.password);
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
      ? route.query.redirect
      : "/";
    await router.replace(redirect);
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "登录失败，请稍后重试";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
    <div class="w-full max-w-[420px]">
      <div class="mb-6 flex items-center gap-3 text-white">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-900">MF</div>
        <div class="leading-tight">
          <div class="text-base font-semibold">{{ APP_NAME }}</div>
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-400">MetaForge</div>
        </div>
      </div>
      <div class="rounded-2xl bg-white p-7 shadow-2xl shadow-slate-950/40">
        <h1 class="text-xl font-semibold text-slate-900">登录</h1>
        <p class="mt-1 text-[12px] leading-relaxed text-slate-500">使用平台身份中心账号登录；角色与部门权限由服务端下发。</p>
        <el-alert v-if="error" type="error" :closable="false" show-icon class="mt-4" :title="error" />
        <el-form label-position="top" class="mt-5" @submit.prevent="submit">
          <el-form-item label="租户">
            <el-input v-model="form.tenant" autocomplete="organization" placeholder="tenant_demo_school" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.username" autocomplete="username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password autocomplete="current-password" placeholder="请输入密码" />
          </el-form-item>
          <el-button type="primary" native-type="submit" :loading="submitting" class="mt-1 !w-full">登录</el-button>
        </el-form>
        <p class="mt-4 text-[11px] leading-relaxed text-slate-400">没有账号或忘记密码，请联系租户管理员。连续失败会触发临时锁定。</p>
      </div>
    </div>
  </div>
</template>
