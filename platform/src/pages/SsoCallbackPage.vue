<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { authApi } from "@/api/identity";
import { profileFromUser, safeStudioRedirect } from "@/lib/identityProfile";
import { errorMessage } from "@/lib/http";
import { useSessionStore } from "@/stores/session";

const router = useRouter();
const sessionStore = useSessionStore();
const error = ref("");
const redirect = ref("/");

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const ticket = params.get("ticket") ?? "";
  redirect.value = safeStudioRedirect(params.get("redirect"));

  // 票据只放 fragment；兑换前先从地址栏和浏览历史移除。
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  if (!ticket) {
    error.value = "缺少统一身份登录凭证，请重新发起登录。";
    return;
  }
  try {
    const result = await authApi.ssoExchange(ticket);
    sessionStore.applyLogin(
      result.token,
      result.expires_at,
      result.tenant,
      profileFromUser(result.user)
    );
    ElMessage.success(`欢迎，${result.user.display_name || result.user.username}`);
    router.replace(safeStudioRedirect(result.redirect || redirect.value));
  } catch (ex) {
    error.value = errorMessage(ex);
  }
});

function backToLogin() {
  router.replace({ name: "login", query: { redirect: redirect.value } });
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface px-6">
    <div
      class="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm"
    >
      <template v-if="!error">
        <div
          class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-500"
        />
        <h1 class="mt-6 text-[18px] font-semibold text-slate-800">正在完成统一身份登录</h1>
        <p class="mt-2 text-[12px] text-slate-500">正在校验一次性凭证并建立本地会话……</p>
      </template>
      <template v-else>
        <div
          class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-lg font-semibold text-rose-500"
        >
          !
        </div>
        <h1 class="mt-5 text-[18px] font-semibold text-slate-800">统一身份登录失败</h1>
        <p class="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-600">
          {{ error }}
        </p>
        <el-button class="mt-6 w-full" type="primary" @click="backToLogin">
          返回登录
        </el-button>
      </template>
    </div>
  </div>
</template>
