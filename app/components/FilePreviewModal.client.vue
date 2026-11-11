<script setup lang="ts">
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from 'lucide-vue-next'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { filePreviewKind } from '#shared/file-preview'
const props = defineProps<{ name: string; url: string }>()
const emit = defineEmits<{ close: []; retry: [] }>()
const kind = filePreviewKind(props.name)
const surface = ref<HTMLElement>(),
  canvas = ref<HTMLCanvasElement>()
const loading = ref(true),
  rendering = ref(false),
  error = ref('')
const page = ref(1),
  pages = ref(0),
  zoom = ref(1),
  width = ref(0)
const imageUrl = ref(''),
  imageWidth = ref(0)
const controller = new AbortController()
let disposed = false,
  observer: ResizeObserver | undefined
let document: PDFDocumentProxy | undefined,
  task: PDFDocumentLoadingTask | undefined,
  renderTask: RenderTask | undefined
let renderVersion = 0,
  renderQueue = Promise.resolve()
const previewUrl = `${props.url}${props.url.includes('?') ? '&' : '?'}preview=1`
const imageStyle = computed(() => ({
  width: `${Math.max(1, Math.min(imageWidth.value, Math.max(1, width.value - 32))) * zoom.value}px`,
}))

function requestRender() {
  const version = ++renderVersion
  renderTask?.cancel()
  renderQueue = renderQueue
    .catch(() => {})
    .then(async () => {
      if (disposed || version !== renderVersion || !document || !canvas.value) return
      rendering.value = true
      try {
        const pdfPage = await document.getPage(page.value)
        if (disposed || version !== renderVersion || !canvas.value) return
        const base = pdfPage.getViewport({ scale: 1 })
        const scale = Math.min(1.5, Math.max(1, width.value - 32) / base.width) * zoom.value
        const viewport = pdfPage.getViewport({ scale })
        // Bound the backing canvas for phones and unusually large PDF pages.
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(12_000_000 / (viewport.width * viewport.height)),
        )
        const element = canvas.value
        element.width = Math.max(1, Math.floor(viewport.width * ratio))
        element.height = Math.max(1, Math.floor(viewport.height * ratio))
        element.style.width = `${Math.floor(viewport.width)}px`
        element.style.height = `${Math.floor(viewport.height)}px`
        renderTask = pdfPage.render({
          canvas: element,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        await renderTask.promise
        if (!disposed && version === renderVersion)
          element.dataset.renderedPage = String(page.value)
      } catch (e) {
        if (
          !disposed &&
          version === renderVersion &&
          !(e instanceof Error && e.name === 'RenderingCancelledException')
        )
          error.value = '这一页暂时无法显示，可以重试或下载文件查看。'
      } finally {
        if (!disposed && version === renderVersion) rendering.value = false
      }
    })
}
function movePage(value: number) {
  page.value = Math.min(pages.value, Math.max(1, value))
  surface.value?.scrollTo(0, 0)
}
function imageLoaded(event: Event) {
  imageWidth.value = (event.target as HTMLImageElement).naturalWidth
  loading.value = false
}
function imageFailed() {
  error.value = '图片无法显示，请重试或下载原文件。'
  loading.value = false
}
watch([page, zoom, width], () => {
  if (document) requestRender()
})
onMounted(async () => {
  if (surface.value) {
    width.value = surface.value.clientWidth
    observer = new ResizeObserver((entries) => {
      width.value = entries[0]?.contentRect.width || width.value
    })
    observer.observe(surface.value)
  }
  try {
    const response = await fetch(previewUrl, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: '登录已过期，请关闭预览并重新核对身份或登录。',
        404: '文件已更新或不存在，请刷新列表后再试。',
        415: '文件格式或内容不支持预览，请下载查看。',
      }
      throw new Error(messages[response.status] || '文件加载失败，请稍后重试或下载查看。')
    }
    const blob = await response.blob()
    if (disposed) return
    if (kind === 'image') {
      imageUrl.value = URL.createObjectURL(blob)
      return
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(await blob.arrayBuffer())
    if (disposed) return
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const assets = `${window.location.origin}/pdfjs/${pdfjs.version}`
    task = pdfjs.getDocument({
      data,
      cMapUrl: `${assets}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}/standard_fonts/`,
      wasmUrl: `${assets}/wasm/`,
      enableXfa: false,
      disableWorkerRendering: true,
    })
    task.onPassword = () => {
      error.value = '此 PDF 需要密码，请下载后使用 PDF 阅读器打开。'
      void task?.destroy().catch(() => {})
    }
    document = await task.promise
    if (disposed) return
    pages.value = document.numPages
    loading.value = false
    await nextTick()
    requestRender()
  } catch (e) {
    if (!disposed) {
      error.value ||= e instanceof Error ? e.message : '预览失败，请下载查看。'
      loading.value = false
    }
  }
})
onBeforeUnmount(() => {
  disposed = true
  controller.abort()
  observer?.disconnect()
  renderTask?.cancel()
  void task?.destroy().catch(() => {})
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>
<template>
  <AppModal title="文件预览" :subtitle="name" wide @close="emit('close')">
    <div class="file-preview-toolbar">
      <div v-if="kind === 'pdf'" class="file-preview-pagination">
        <button
          class="icon-button"
          aria-label="上一页"
          :disabled="loading || !!error || page <= 1"
          @click="movePage(page - 1)"
        >
          <ChevronLeft :size="19" /></button
        ><span aria-live="polite">第 {{ page }} / {{ pages || '—' }} 页</span
        ><button
          class="icon-button"
          aria-label="下一页"
          :disabled="loading || !!error || page >= pages"
          @click="movePage(page + 1)"
        >
          <ChevronRight :size="19" />
        </button>
      </div>
      <div class="file-preview-zoom">
        <button
          class="icon-button"
          aria-label="缩小"
          :disabled="loading || !!error || zoom <= 0.5"
          @click="zoom = Math.max(0.5, zoom - 0.25)"
        >
          <ZoomOut :size="18" /></button
        ><span>{{ Math.round(zoom * 100) }}%</span
        ><button
          class="icon-button"
          aria-label="放大"
          :disabled="loading || !!error || zoom >= 3"
          @click="zoom = Math.min(3, zoom + 0.25)"
        >
          <ZoomIn :size="18" /></button
        ><button
          class="icon-button"
          aria-label="适应宽度"
          :disabled="loading || !!error"
          @click="zoom = 1"
        >
          <Maximize2 :size="18" />
        </button>
      </div>
      <a :href="url" class="button secondary small"><Download :size="15" />下载原文件</a>
    </div>
    <div ref="surface" class="file-preview-surface" :aria-busy="loading || rendering">
      <div v-if="error" class="file-preview-message" role="alert">
        <p>{{ error }}</p>
        <button class="button secondary small" @click="emit('retry')">重新加载</button
        ><a :href="url" class="text-link">下载原文件</a>
      </div>
      <p v-else-if="loading || rendering" class="file-preview-loading" role="status">
        <LoaderCircle :size="19" class="spin" />{{ loading ? '正在加载文件…' : '正在显示页面…' }}
      </p>
      <div v-show="!error" class="file-preview-content">
        <canvas
          v-if="kind === 'pdf'"
          ref="canvas"
          v-show="!loading"
          role="img"
          :aria-label="`PDF 第 ${page} 页`"
        />
        <img
          v-else-if="imageUrl"
          :src="imageUrl"
          :alt="name"
          :style="imageStyle"
          @load="imageLoaded"
          @error="imageFailed"
        />
      </div>
    </div>
  </AppModal>
</template>
