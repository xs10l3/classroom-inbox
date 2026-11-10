<script setup lang="ts">
import {
  UploadCloud,
  FileText,
  X,
  Clock3,
  Check,
  ArrowRight,
  LoaderCircle,
  CheckCircle2,
  ArrowLeft,
  CircleAlert,
  Link2,
} from 'lucide-vue-next'
import { apiError, formatDate, formatSize } from '~/utils/format'
const route = useRoute()
const { data, error: loadError } = await useFetch(`/api/submit/${route.params.token}`)
useHead({ title: computed(() => `${data.value?.task.title || '提交作业'} · 课代表`) })
const name = ref(''),
  studentId = ref(''),
  error = ref(''),
  busy = ref(false),
  progress = ref(0),
  dragging = ref(false)
const files = ref<File[]>([]),
  input = ref<HTMLInputElement>()
const receipt = ref<{
  name: string
  fileCount: number
  submittedAt: string
  receipt: string
} | null>(null)
let xhr: XMLHttpRequest | undefined
const closed = computed(
  () =>
    !!data.value?.task.closed || (!!data.value && Date.parse(data.value.task.dueAt) <= Date.now()),
)
function addFiles(list?: FileList | null) {
  if (!list || !data.value) return
  error.value = ''
  const next = [...files.value]
  for (const file of [...list]) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!data.value.task.extensions.includes(ext)) {
      error.value = `不支持 ${ext || '无后缀'} 格式`
      continue
    }
    if (!file.size || file.size > data.value.task.maxSizeMb * 1024 * 1024) {
      error.value = `文件须大于 0 字节且不超过 ${data.value.task.maxSizeMb} MB`
      continue
    }
    if (
      !next.some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
      )
    )
      next.push(file)
  }
  if (next.length > 5) {
    error.value = '每次最多提交 5 个文件'
    return
  }
  if (next.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) {
    error.value = '文件总大小不能超过 100 MB'
    return
  }
  files.value = next
  if (input.value) input.value.value = ''
}
function onFiles(event: Event) {
  addFiles((event.target as HTMLInputElement).files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  if (!busy.value) addFiles(event.dataTransfer?.files)
}
async function submit() {
  if (!files.value.length) {
    error.value = '请先选择要提交的文件'
    return
  }
  busy.value = true
  error.value = ''
  progress.value = 0
  const body = new FormData()
  body.append('name', name.value.trim())
  body.append('studentId', studentId.value.trim())
  files.value.forEach((file) => body.append('files', file))
  try {
    receipt.value = await new Promise((resolve, reject) => {
      xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/submit/${route.params.token}`)
      xhr.timeout = 10 * 60_000
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          progress.value = Math.min(95, Math.round((event.loaded / event.total) * 95))
      }
      xhr.onload = () => {
        let result
        try {
          result = JSON.parse(xhr!.responseText)
        } catch {
          reject(new Error('服务器响应异常，请稍后重试'))
          return
        }
        if (xhr!.status >= 200 && xhr!.status < 300) resolve(result)
        else reject({ data: result })
      }
      xhr.onerror = () => reject(new Error('网络连接中断，请重试；如已收到回执，请勿重复操作'))
      xhr.ontimeout = () => reject(new Error('上传超时，请稍后重试'))
      xhr.onabort = () => reject(new Error('上传已取消'))
      xhr.send(body)
    })
    progress.value = 100
    files.value = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : apiError(e)
  } finally {
    busy.value = false
    xhr = undefined
  }
}
onBeforeUnmount(() => xhr?.abort())
</script>
<template>
  <div class="submit-page">
    <header class="submit-header">
      <AppLogo small /><span>{{ data?.className || '班级作业收集' }}</span
      ><span class="submit-header-label">把每一份认真，好好收下。</span>
    </header>
    <main class="submit-main">
      <div v-if="loadError" class="submit-card invalid-link">
        <span class="empty-icon"><Link2 :size="30" /></span>
        <h1>这个收集链接暂时无法打开</h1>
        <p>请向课代表确认链接是否完整，或稍后重新尝试。</p>
        <button class="button secondary" @click="reloadNuxtApp()">重新加载</button>
      </div>
      <template v-else-if="data"
        ><div class="submit-intro">
          <span class="eyebrow">A LITTLE EFFORT, WELL RECEIVED</span
          ><span class="subject-pill">{{ data.task.subject }}</span>
          <h1>{{ data.task.title }}</h1>
          <p><Clock3 :size="15" />{{ formatDate(data.task.dueAt, true) }} 截止 · 北京时间</p>
        </div>
        <section v-if="receipt" class="submit-card receipt-card" role="status">
          <span class="receipt-check"><Check :size="35" :stroke-width="1.7" /></span
          ><span class="eyebrow">ALL RECEIVED. WELL DONE.</span>
          <h2>作业收到啦，{{ receipt.name }}！</h2>
          <p>你的认真，已经好好收下。</p>
          <div class="receipt-info">
            <div>
              <span>提交文件</span><strong>{{ receipt.fileCount }} 个</strong>
            </div>
            <div>
              <span>提交时间</span><strong>{{ formatDate(receipt.submittedAt, true) }}</strong>
            </div>
            <div>
              <span>提交回执</span
              ><strong class="mono">{{ receipt.receipt.slice(0, 8).toUpperCase() }}</strong>
            </div>
          </div>
          <button v-if="!closed" class="button secondary" @click="receipt = null">
            <ArrowLeft :size="15" />返回重新提交
          </button>
          <p class="small muted">可截图保存这份回执。</p>
        </section>
        <section v-else class="submit-card">
          <div v-if="closed" class="submit-closed">
            <Clock3 :size="30" :stroke-width="1.3" />
            <h2>这次作业已经停止收集</h2>
            <p>如需补交，请联系课代表调整截止时间。</p>
          </div>
          <template v-else
            ><div v-if="!data.storageReady" class="form-error storage-unavailable">
              <CircleAlert :size="18" />文件收集暂未开放，请联系课代表完成存储配置。
            </div>
            <div v-if="data.task.description" class="submit-description">
              <span class="label-small">作业要求</span>
              <p class="preserve-lines">{{ data.task.description }}</p>
            </div>
            <OriginalNotice :text="data.task.originalNotice" />
            <form class="form-stack" @submit.prevent="submit">
              <div class="submit-step">
                <span>01</span>
                <h2>先确认一下，你是谁</h2>
              </div>
              <div class="form-grid">
                <label
                  >你的姓名<input
                    v-model="name"
                    required
                    maxlength="40"
                    placeholder="请输入完整姓名"
                    autocomplete="name"
                    :disabled="busy" /></label
                ><label
                  >你的学号<input
                    v-model="studentId"
                    required
                    maxlength="32"
                    placeholder="请输入完整学号"
                    inputmode="numeric"
                    :disabled="busy"
                /></label>
              </div>
              <div class="submit-step">
                <span>02</span>
                <h2>放上你的作业</h2>
              </div>
              <input
                ref="input"
                type="file"
                multiple
                class="sr-only"
                :accept="data.task.extensions.map((e) => `.${e}`).join(',')"
                aria-label="选择作业文件"
                :disabled="busy"
                @change="onFiles"
              /><button
                type="button"
                class="dropzone homework-dropzone"
                :class="{ dragging }"
                :disabled="busy || !data.storageReady"
                @click="input?.click()"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="onDrop"
              >
                <span class="upload-circle"><UploadCloud :size="29" :stroke-width="1.4" /></span
                ><strong>点击选择文件，或拖放到这里</strong
                ><span
                  >{{ data.task.extensions.map((e) => e.toUpperCase()).join(' / ') }} · 单文件 ≤
                  {{ data.task.maxSizeMb }} MB</span
                ><small>最多 5 个文件，合计不超过 100 MB；无需手动重命名</small>
              </button>
              <ul v-if="files.length" class="selected-files">
                <li v-for="(file, index) in files" :key="`${file.name}-${index}`">
                  <span class="selected-file-icon"><FileText :size="20" /></span>
                  <div>
                    <strong>{{ file.name }}</strong
                    ><small>{{ formatSize(file.size) }}</small>
                  </div>
                  <button
                    type="button"
                    class="icon-button"
                    :disabled="busy"
                    :aria-label="`移除 ${file.name}`"
                    @click="files.splice(index, 1)"
                  >
                    <X :size="17" />
                  </button>
                </li>
              </ul>
              <p v-if="error" class="form-error" role="alert">{{ error }}</p>
              <div v-if="busy" class="upload-progress">
                <div>
                  <span>{{
                    progress >= 95 ? '正在保存到云端，请稍候…' : '正在上传，请保持页面打开…'
                  }}</span
                  ><strong>{{ progress }}%</strong>
                </div>
                <div class="progress-track"><span :style="{ width: `${progress}%` }" /></div>
              </div>
              <button class="button primary submit-homework" :disabled="busy || !data.storageReady">
                <LoaderCircle v-if="busy" :size="18" class="spin" /><template v-else
                  >确认提交作业<ArrowRight :size="18"
                /></template>
              </button>
              <p class="submit-disclaimer">
                <CheckCircle2 :size="13" />提交成功后会显示回执；重新提交将更新本次作业的有效记录。
              </p>
            </form></template
          >
        </section></template
      >
      <footer class="submit-footer"><span>课代表</span>让收作业，也成为一件轻松的小事。</footer>
    </main>
  </div>
</template>
