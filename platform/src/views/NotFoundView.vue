<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface px-6">
    <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <p class="text-5xl font-semibold tracking-tight text-slate-900">404</p>
      <p class="mt-3 text-sm text-slate-500">页面不存在，或已经被移动。</p>
      <el-button type="primary" class="mt-6" @click="router.push('/')">回到应用工作台</el-button>
    </div>
  </div>
</template>