<script setup lang="ts">
import { Copy, ExternalLink, Check } from 'lucide-vue-next'
const props = defineProps<{
  title: string
  token: string
  appUrl?: string
  kind?: 'fill' | 'submit'
}>()
const emit = defineEmits<{ close: [] }>()
const link = computed(
  () =>
    `${props.appUrl || (import.meta.client ? window.location.origin : '')}/${props.kind || 'submit'}/${props.token}`,
)
const copied = ref(false)
const input = ref<HTMLInputElement>()
async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
  } catch {
    input.value?.select()
  }
}
</script>
<template>
  <AppModal
    :title="kind === 'fill' ? '把填写链接发给同学' : '把收集链接发给同学'"
    :subtitle="title"
    @close="emit('close')"
  >
    <div class="share-content">
      <span class="label-small">学生提交链接</span>
      <div class="share-input">
        <input
          ref="input"
          :value="link"
          readonly
          aria-label="学生提交链接"
          @click="input?.select()"
        /><button class="button primary" @click="copy">
          <Check v-if="copied" :size="16" /><Copy v-else :size="16" />{{
            copied ? '已复制' : '复制'
          }}
        </button>
      </div>
      <p class="muted small">同学填写姓名和学号即可提交，无需注册账号。</p>
      <NuxtLink :to="`/${kind || 'submit'}/${token}`" target="_blank" class="text-link"
        >预览学生提交页<ExternalLink :size="14"
      /></NuxtLink>
    </div>
  </AppModal>
</template>
