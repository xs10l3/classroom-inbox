<script setup lang="ts">
import {
  Upload,
  Download,
  UsersRound,
  Search,
  FileSpreadsheet,
  ArrowRight,
  Check,
  X,
  LoaderCircle,
  Braces,
} from 'lucide-vue-next'
import type { Student } from '../../shared/types'
import { apiError } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '班级名单 · 课代表' })
const { data, refresh } = await useClassroom()
const { notify } = useNotice()
const importOpen = ref(false),
  busy = ref(false),
  dragging = ref(false),
  pasteMode = ref(false)
const json = ref(''),
  error = ref(''),
  filename = ref(''),
  search = ref('')
const preview = ref<Student[]>([])
const fileInput = ref<HTMLInputElement>()
const jsonPlaceholder = '[{"name": "姓名", "student_id": "学号", "gender": "F"}]'
const students = computed(() =>
  (data.value?.students || []).filter((s) => `${s.name}${s.studentId}`.includes(search.value)),
)
const female = computed(() => data.value?.students.filter((s) => s.gender === 'F').length || 0)
const male = computed(() => data.value?.students.filter((s) => s.gender === 'M').length || 0)
function open() {
  preview.value = []
  error.value = ''
  filename.value = ''
  json.value = ''
  importOpen.value = true
}
async function parseFile(file?: File) {
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    const result = await $fetch<{ students: Student[] }>('/api/roster/preview', {
      method: 'POST',
      body: form,
    })
    preview.value = result.students
    filename.value = file.name
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
function inputFile(event: Event) {
  parseFile((event.target as HTMLInputElement).files?.[0])
}
function parsePastedJson() {
  return parseFile(new File([json.value], '粘贴的名单.json', { type: 'application/json' }))
}
function dropFile(event: DragEvent) {
  dragging.value = false
  if (!busy.value) parseFile(event.dataTransfer?.files[0])
}
async function confirm() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/roster', { method: 'POST', body: { students: preview.value } })
    await refresh()
    importOpen.value = false
    notify(`已保存 ${preview.value.length} 位同学的名单`)
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">EVERYONE COUNTS</span>
      <h1>班级名单<span class="title-dot">.</span></h1>
      <p>一份准确的名单，是每次有序收集的开始。</p>
    </div>
    <button class="button primary" @click="open">
      <Upload :size="17" />{{ data?.students.length ? '更新班级名单' : '导入班级名单' }}
    </button>
  </section>
  <section class="roster-summary">
    <div class="roster-summary-icon"><UsersRound :size="31" :stroke-width="1.4" /></div>
    <div>
      <h2>{{ data?.className }}</h2>
      <p>名单由管理员导入，可随时更新。</p>
    </div>
    <div class="roster-numbers">
      <strong>{{ data?.students.length || 0 }}<small>位同学</small></strong
      ><span class="vertical-divider" /><span
        >女生 <b>{{ female }}</b></span
      ><span
        >男生 <b>{{ male }}</b></span
      ><span v-if="(data?.students.length || 0) - female - male"
        >未标注 <b>{{ (data?.students.length || 0) - female - male }}</b></span
      >
    </div>
  </section>
  <section class="content-panel">
    <div class="panel-toolbar">
      <div class="section-heading">
        <h2>
          全班同学<span>{{ data?.students.length || 0 }}</span>
        </h2>
      </div>
      <div class="toolbar-actions">
        <label class="search-box"
          ><Search :size="16" /><input
            v-model="search"
            placeholder="搜索姓名或学号"
            aria-label="搜索姓名或学号" /></label
        ><a
          v-if="data?.students.length"
          href="/api/roster/export"
          class="button secondary small-button"
          ><Download :size="15" />导出名单</a
        >
      </div>
    </div>
    <div v-if="students.length" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="number-cell">序号</th>
            <th>姓名</th>
            <th>学号</th>
            <th>性别</th>
            <th>名单状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(student, index) in students" :key="student.studentId">
            <td class="muted number-cell">{{ String(index + 1).padStart(2, '0') }}</td>
            <td>
              <span class="student-cell"
                ><span class="student-avatar" :class="{ purple: student.gender === 'F' }">{{
                  student.name.slice(-2)
                }}</span
                ><strong>{{ student.name }}</strong></span
              >
            </td>
            <td class="mono">{{ student.studentId }}</td>
            <td class="muted">
              {{ student.gender === 'F' ? '女' : student.gender === 'M' ? '男' : '—' }}
            </td>
            <td>
              <span class="soft-status"><span class="status-dot" />在当前名单中</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="large-empty">
      <span class="empty-icon"><UsersRound :size="31" :stroke-width="1.3" /></span>
      <h3>{{ search ? '没有找到这位同学' : '把同学们加入这个空间' }}</h3>
      <p>
        {{
          search
            ? '试试其他姓名或学号。'
            : '上传 Excel、CSV 或 JSON 名单，系统会自动检查学号和重复记录。'
        }}
      </p>
      <button v-if="!search" class="button primary" @click="open">
        导入第一份名单<ArrowRight :size="16" /></button
      ><a href="/api/roster/template" class="text-link"><Download :size="14" />下载 CSV 模板</a>
    </div>
  </section>
  <p class="page-note">
    <Check :size="15" />更新名单仅影响之后发布的作业。已有作业会保留发布时的名单与提交统计。
  </p>
  <AppModal
    v-if="importOpen"
    :title="preview.length ? '确认这份班级名单' : '导入班级名单'"
    :subtitle="
      preview.length
        ? `${filename} · 共 ${preview.length} 位同学，学号校验已通过`
        : '支持 Excel（.xlsx）、CSV、JSON，最大 5 MB'
    "
    @close="!busy && (importOpen = false)"
  >
    <div class="import-content">
      <template v-if="!preview.length"
        ><div class="import-methods">
          <button :class="{ active: !pasteMode }" @click="pasteMode = false">
            <FileSpreadsheet :size="16" />上传文件</button
          ><button :class="{ active: pasteMode }" @click="pasteMode = true">
            <Braces :size="16" />粘贴 JSON
          </button>
        </div>
        <template v-if="!pasteMode"
          ><input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept=".xlsx,.csv,.json"
            aria-label="选择班级名单文件"
            :disabled="busy"
            @change="inputFile"
          /><button
            class="dropzone"
            :class="{ dragging }"
            :disabled="busy"
            @click="fileInput?.click()"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="dropFile"
          >
            <LoaderCircle v-if="busy" :size="32" class="spin" /><Upload
              v-else
              :size="32"
              :stroke-width="1.4"
            /><strong>{{ busy ? '正在读取并校验名单…' : '点击选择，或将名单文件拖到这里' }}</strong
            ><span>XLSX / CSV / JSON · 最多 1000 位同学</span>
          </button></template
        ><template v-else
          ><label class="json-label"
            >JSON 数组<textarea
              v-model="json"
              rows="7"
              class="mono"
              :placeholder="jsonPlaceholder"
            /></label
          ><button
            class="button secondary"
            :disabled="busy || !json.trim()"
            @click="parsePastedJson"
          >
            <LoaderCircle v-if="busy" :size="16" class="spin" />解析并预览<ArrowRight
              v-if="!busy"
              :size="16"
            /></button
        ></template>
        <div class="import-help">
          <strong>名单需要包含哪些内容？</strong>
          <p>
            必填：姓名、学号；选填：性别（男 / 女，或 M / F）。<br />兼容字段名 name、student_id /
            studentId、gender。Excel 请使用首行表头，并将学号列设为文本。
          </p>
          <a href="/api/roster/template" class="text-link"><Download :size="14" />下载 CSV 模板</a>
        </div></template
      >
      <template v-else
        ><div class="import-success">
          <Check :size="18" /><span>共 {{ preview.length }} 人，学号完整且无重复。</span>
        </div>
        <div class="preview-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>学号</th>
                <th>性别</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in preview" :key="student.studentId">
                <td>{{ student.name }}</td>
                <td class="mono">{{ student.studentId }}</td>
                <td>{{ student.gender === 'F' ? '女' : student.gender === 'M' ? '男' : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small">确认后将替换当前班级名单，已发布作业保留原有名单。</p></template
      >
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div v-if="preview.length" class="modal-footer">
        <button class="button secondary" :disabled="busy" @click="preview = []">重新选择</button
        ><button class="button primary" :disabled="busy" @click="confirm">
          <LoaderCircle v-if="busy" :size="17" class="spin" /><Check
            v-else
            :size="17"
          />确认保存名单
        </button>
      </div>
    </div>
  </AppModal>
</template>
