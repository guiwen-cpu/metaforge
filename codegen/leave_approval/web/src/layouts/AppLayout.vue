<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { APP_KEY, resourceRoutes } from "@/generated/schema";
import { useSession } from "@/stores/session";

const session = useSession();
const route = useRoute();
const router = useRouter();

const activePath = computed(() => "/" + String(route.path).split("/").filter(Boolean)[0]);
const tenantLabel = computed(() => session.tenantId || "未设置租户");

onMounted(() => {
  session.ensureDemoSession();
});

function signOut() {
  session.signOut();
  void router.push("/");
}
</script>

<template>
  <el-container class="min-h-screen">
    <el-aside width="232px" class="border-r border-slate-200 bg-white">
      <div class="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">MF</div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-slate-900">MetaForge</div>
          <div class="text-[11px] uppercase tracking-wide text-slate-400">leave_approval</div>
        </div>
      </div>
      <el-menu :default-active="activePath" router class="border-none px-2 py-3">
        <el-menu-item v-for="item in resourceRoutes" :key="item.path" :index="'/' + item.path">
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="mx-3 mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        页面由 DataSchema 生成。列、筛选、表单字段与 BFF 的查询 / 写入契约同源。
      </div>
    </el-aside>

    <el-container>
      <el-header height="64px" class="flex items-center justify-between border-b border-slate-200 bg-white">
        <div class="flex items-center gap-3">
          <span class="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{{ APP_KEY }}</span>
          <el-tag size="small" type="info">租户 {{ tenantLabel }}</el-tag>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-right leading-tight">
            <div class="text-sm font-medium text-slate-800">{{ session.user?.name ?? "未登录" }}</div>
            <div class="text-[11px] text-slate-400">{{ session.roles.join(" / ") || "无角色" }}</div>
          </div>
          <el-button size="small" plain @click="signOut">退出</el-button>
        </div>
      </el-header>

      <el-main class="p-6">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="mb-4"
          title="前端权限只做按钮显隐"
          description="服务端 api/permissions.json 才是授权事实来源；前端拿不到权限时不会替代服务端校验。"
        />
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
