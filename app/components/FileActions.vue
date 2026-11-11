<script setup lang="ts">
import { Download, Eye } from 'lucide-vue-next'
import { filePreviewKind } from '#shared/file-preview'
import { formatSize } from '~/utils/format'
const props = defineProps<{ name: string; url: string; size?: number }>()
const preview = ref(false),
  previewKey = ref(0)
const supported = computed(() => filePreviewKind(props.name))
</script>
<template>
  <div class="file-actions">
    <a :href="url" class="file-download" :title="name" :aria-label="`下载：${name}`"
      ><Download :size="14" /><span>{{ name }}</span
      ><small v-if="size !== undefined">{{ formatSize(size) }}</small></a
    >
    <button
      v-if="supported"
      type="button"
      class="file-preview-button"
      :aria-label="`预览：${name}`"
      @click="preview = true"
    >
      <Eye :size="14" />预览
    </button>
    <LazyFilePreviewModal
      v-if="preview"
      :key="previewKey"
      :name="name"
      :url="url"
      @close="preview = false"
      @retry="previewKey++"
    />
  </div>
</template>
