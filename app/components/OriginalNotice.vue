<script setup lang="ts">
import { FileText, ChevronDown } from 'lucide-vue-next'
defineProps<{ text?: string }>()
</script>
<template>
  <details v-if="text" class="original-notice">
    <summary><FileText :size="15" /><span>查看原始通知</span><ChevronDown :size="15" /></summary>
    <pre>{{ text }}</pre>
  </details>
</template>
