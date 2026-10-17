<script setup lang="ts">
import ResourcePage from "@/components/ResourcePage.vue";
import { resources } from "@/generated/schema";

const resource = resources["leave_request"];
</script>

<template>
  <ResourcePage :resource="resource" />
</template>
