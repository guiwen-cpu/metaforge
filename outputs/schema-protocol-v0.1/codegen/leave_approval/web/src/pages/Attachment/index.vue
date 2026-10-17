<script setup lang="ts">
import ResourcePage from "@/components/ResourcePage.vue";
import { resources } from "@/generated/schema";

const resource = resources["attachment"];
</script>

<template>
  <ResourcePage :resource="resource" />
</template>
