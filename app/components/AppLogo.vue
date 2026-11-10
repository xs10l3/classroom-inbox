<script setup lang="ts">
import { NotebookPen } from 'lucide-vue-next'
defineProps<{ small?: boolean }>()
</script>
<template>
  <NuxtLink to="/" class="brand" aria-label="课代表首页">
    <span class="brand-icon"><NotebookPen :size="small ? 21 : 24" :stroke-width="1.7" /></span>
    <span>课代表<small v-if="!small">CLASSROOM INBOX</small></span>
  </NuxtLink>
</template>
