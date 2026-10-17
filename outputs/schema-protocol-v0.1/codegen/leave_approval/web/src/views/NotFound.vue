<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div class="flex h-full items-center justify-center p-10">
    <el-result icon="warning" title="页面不存在" sub-title="生成器没有为这个地址产出页面。">
      <template #extra>
        <el-button type="primary" @click="router.push('/')">回到首页</el-button>
      </template>
    </el-result>
  </div>
</template>
