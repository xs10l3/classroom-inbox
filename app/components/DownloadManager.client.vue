<script setup lang="ts">
import {
  Check,
  Circle,
  Download,
  File,
  FileArchive,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-vue-next'
import { apiError, formatDate, formatSize } from '~/utils/format'
import type { PreparedDownload } from '../../shared/downloads'
const open = ref(false),
  busy = ref(false),
  error = ref(''),
  job = ref<PreparedDownload>(),
  visibleFiles = ref(50),
  source = ref('')
const completed = computed(
  () => job.value?.files.filter((file) => file.status === 'ready').length || 0,
)
const preparedBytes = computed(
  () => job.value?.files.reduce((total, file) => total + file.preparedBytes, 0) || 0,
)
const progress = computed(() => {
  const files = job.value?.files || []
  if (!files.length) return 0
  return Math.round(
    (files.reduce(
      (total, file) =>
        total +
        (file.status === 'ready' ? 1 : file.size ? Math.min(file.preparedBytes / file.size, 1) : 0),
      0,
    ) /
      files.length) *
      100,
  )
})
const phaseLabel = computed(
  () =>
    ({
      queued: '排队等待',
      preparing: '准备文件',
      packing: '生成压缩包',
      ready: '准备完成',
      failed: '准备失败',
    })[job.value?.phase || 'queued'],
)
const statusLabel = { pending: '等待中', preparing: '准备中', ready: '已就绪', failed: '失败' }
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
const supported = new RegExp(
  '^/api/(?:files/[^/]+|leave/proofs/[^/]+|tasks/[^/]+/(?:archive|export)|affairs/[^/]+/export|roster/(?:export|template)|admin/evening/export|admin/backups/[^/]+)$',
)
async function poll(id: string, version: number) {
  try {
    const result = await $fetch<PreparedDownload>(`/api/downloads/${id}`, { retry: 0 })
    if (version !== generation) return
    job.value = result
    if (result.status === 'preparing') timer = setTimeout(() => poll(id, version), 1000)
    else {
      busy.value = false
      if (result.status === 'failed') error.value = result.error || '文件准备失败，请重试'
    }
  } catch (e) {
    if (version === generation) {
      busy.value = false
      error.value = apiError(e)
    }
  }
}
async function prepare() {
  const version = ++generation
  clearTimeout(timer)
  open.value = true
  busy.value = true
  error.value = ''
  job.value = undefined
  visibleFiles.value = 50
  try {
    const result = await $fetch<PreparedDownload>('/api/downloads', {
      method: 'POST',
      body: { source: source.value },
      retry: 0,
    })
    if (version !== generation) return
    job.value = result
    timer = setTimeout(() => poll(result.id, version), 500)
  } catch (e) {
    if (version === generation) {
      busy.value = false
      error.value = apiError(e)
    }
  }
}
function intercept(event: MouseEvent) {
  const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]')
  if (!anchor || anchor.dataset.preparedDownload !== undefined) return
  const url = new URL(anchor.href, location.origin)
  if (
    url.origin !== location.origin ||
    !supported.test(url.pathname) ||
    url.searchParams.get('preview') === '1'
  )
    return
  event.preventDefault()
  event.stopPropagation()
  if (busy.value) {
    open.value = true
    return
  }
  source.value = url.pathname + url.search
  void prepare()
}
function close() {
  open.value = false
  generation++
  clearTimeout(timer)
  busy.value = false
}
onMounted(() => document.addEventListener('click', intercept, true))
onBeforeUnmount(() => {
  document.removeEventListener('click', intercept, true)
  clearTimeout(timer)
  generation++
})
</script>
<template>
  <section
    v-if="open"
    class="download-manager"
    role="region"
    aria-label="下载准备"
    aria-live="polite"
  >
    <div class="download-manager-title">
      <strong>{{ busy ? '正在服务器准备文件' : error ? '文件准备失败' : '文件已准备完成' }}</strong
      ><button class="icon-button" aria-label="关闭下载提示" @click="close">
        <X :size="17" />
      </button>
    </div>
    <p v-if="busy && !job"><LoaderCircle class="spin" :size="17" />正在获取文件清单…</p>
    <template v-if="job">
      <p class="download-ready-name">
        <FileArchive v-if="job.name.endsWith('.zip')" :size="18" /><File
          v-else
          :size="18"
        /><span>{{ job.name }}</span>
      </p>
      <div class="download-progress-heading">
        <span
          ><LoaderCircle v-if="busy" class="spin" :size="14" />{{
            error ? '准备中断' : phaseLabel
          }}</span
        >
        <span>{{ completed }} / {{ job.files.length }} 个文件</span>
      </div>
      <div
        class="download-progress-track"
        role="progressbar"
        aria-label="文件准备进度"
        :aria-valuenow="progress"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuetext="`已准备 ${completed} 个，共 ${job.files.length} 个文件；${phaseLabel}`"
      >
        <div :style="{ width: `${progress}%` }" />
      </div>
      <p class="download-progress-caption">
        文件准备 {{ progress }}% · 已整理 {{ formatSize(preparedBytes)
        }}<span v-if="job.phase === 'packing'">，正在压缩，请稍候</span>
      </p>
      <ul class="download-file-list" aria-label="打包文件清单">
        <li
          v-for="(file, index) in job.files.slice(0, visibleFiles)"
          :key="index"
          :class="`download-file-${file.status}`"
        >
          <Check v-if="file.status === 'ready'" :size="16" />
          <LoaderCircle v-else-if="file.status === 'preparing'" class="spin" :size="16" />
          <TriangleAlert v-else-if="file.status === 'failed'" :size="16" />
          <Circle v-else :size="14" />
          <div>
            <span class="download-file-name" :title="file.name">{{ file.name }}</span
            ><span class="download-file-meta"
              >{{ file.size === null ? '大小待生成' : formatSize(file.size)
              }}<template v-if="file.status === 'preparing' && file.preparedBytes">
                · 已准备 {{ formatSize(file.preparedBytes) }}</template
              ></span
            >
          </div>
          <span class="download-file-state">{{ statusLabel[file.status] }}</span>
        </li>
      </ul>
      <button
        v-if="job.files.length > visibleFiles"
        class="download-more"
        @click="visibleFiles += 50"
      >
        再显示 {{ Math.min(50, job.files.length - visibleFiles) }} 个文件（还有
        {{ job.files.length - visibleFiles }} 个）
      </button>
    </template>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <template v-if="job?.status === 'ready' && !error"
      ><p class="download-expiry">
        下载大小 {{ formatSize(job.size) }} · {{ formatDate(job.expiresAt, true) }} 后过期
      </p>
      <a :href="job.url!" data-prepared-download download class="button primary"
        ><Download :size="16" />下载已准备文件</a
      >
      <p class="field-hint">
        临时副本会自动删除，原始文件仍保留。支持在有效期内继续下载。
      </p></template
    >
    <button v-if="error" class="button secondary small" @click="prepare">重新准备</button>
  </section>
</template>
