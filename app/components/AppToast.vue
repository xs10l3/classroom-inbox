<script setup lang="ts">
import { CheckCircle2, CircleAlert, X } from 'lucide-vue-next'
const { notice } = useNotice()
</script>
<template>
  <Transition name="toast">
    <div v-if="notice" class="toast-message" :class="{ danger: notice.error }" role="status">
      <component :is="notice.error ? CircleAlert : CheckCircle2" :size="19" />
      <span>{{ notice.text }}</span
      ><button class="icon-button" aria-label="关闭提示" @click="notice = null">
        <X :size="16" />
      </button>
    </div>
  </Transition>
</template>
