<script setup lang="ts">
import {
  ArrowLeft,
  Link2,
  Download,
  Search,
  CheckCircle2,
  Clock3,
  FileDown,
  ClipboardCopy,
  Pause,
  Play,
  RefreshCw,
  CalendarClock,
  Save,
  LoaderCircle,
  CircleAlert,
} from 'lucide-vue-next'
import type { Task, Student, Submission } from '../../../shared/types'
import { formatDate, formatSize, apiError, localDateInput, inputToIso } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const { data, refresh, error } = await useFetch<{
  task: Task
  students: Student[]
  submissions: Submission[]
}>(`/api/tasks/${route.params.id}`)
const { data: dashboard, refresh: refreshDashboard } = await useClassroom()
const { notify } = useNotice()
useHead({ title: computed(() => `${data.value?.task.title || '作业详情'} · 课代表`) })
const search = ref(''),
  filter = ref('all'),
  shareOpen = ref(false),
  confirmClose = ref(false),
  busy = ref(false),
  dueInput = ref('')
const editingDue = ref(false)
const isEnded = computed(
  () => !!data.value && (data.value.task.closed || Date.parse(data.value.task.dueAt) <= Date.now()),
)
const missing = computed(
  () =>
    data.value?.students.filter(
      (s) => !data.value?.submissions.some((f) => f.studentId === s.studentId),
    ) || [],
)
const students = computed(
  () =>
    data.value?.students.filter((s) => {
      const submitted = data.value!.submissions.some((f) => f.studentId === s.studentId)
      return (
        `${s.studentId}${s.name}`.includes(search.value) &&
        (filter.value === 'all' ||
          (filter.value === 'submitted' && submitted) ||
          (filter.value === 'missing' && !submitted))
      )
    }) || [],
)
function files(id: string) {
  return data.value?.submissions.filter((s) => s.studentId === id) || []
}
async function change(body: { closed?: boolean; dueAt?: string }) {
  busy.value = true
  try {
    await $fetch(`/api/tasks/${route.params.id}`, { method: 'PATCH', body })
    await Promise.all([refresh(), refreshDashboard()])
    confirmClose.value = false
    editingDue.value = false
    notify('作业设置已更新')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
  }
}
async function copyReminder() {
  if (!data.value) return
  const link = `${dashboard.value?.appUrl || window.location.origin}/submit/${data.value.task.shareToken}`
  const message = `【作业提醒】${data.value.task.subject}：${data.value.task.title}\n截止时间：${formatDate(data.value.task.dueAt, true)}（北京时间）\n目前还有 ${missing.value.length} 位同学未提交，请记得按时完成。\n提交链接：${link}`
  try {
    await navigator.clipboard.writeText(message)
    notify('催交通知已复制，可以粘贴到班群')
  } catch {
    notify('浏览器未允许复制，请先复制收集链接', true)
    shareOpen.value = true
  }
}
function editDue() {
  dueInput.value = localDateInput(new Date(data.value!.task.dueAt))
  editingDue.value = true
}
</script>
<template>
  <NuxtLink to="/admin" class="back-link"><ArrowLeft :size="16" />返回作业总览</NuxtLink>
  <div v-if="error" class="error-banner">
    {{ apiError(error) }}<NuxtLink to="/admin" class="text-link">返回总览</NuxtLink>
  </div>
  <template v-if="data"
    ><section class="page-title-row task-detail-heading">
      <div>
        <span class="eyebrow">{{ data.task.subject }}</span>
        <h1>{{ data.task.title }}</h1>
        <p>
          <span class="badge" :class="{ neutral: isEnded }"
            ><span />{{ isEnded ? '已截止' : '收集中' }}</span
          ><span class="detail-due"
            ><Clock3 :size="14" />{{ formatDate(data.task.dueAt, true) }} 截止</span
          >
        </p>
      </div>
      <div class="toolbar-actions">
        <button class="button secondary" @click="shareOpen = true">
          <Link2 :size="16" />收集链接</button
        ><a
          v-if="data.submissions.length"
          :href="`/api/tasks/${data.task.id}/archive`"
          class="button primary"
          ><Download :size="16" />下载全部作业</a
        >
      </div>
    </section>
    <OriginalNotice :text="data.task.originalNotice" />
    <section class="task-detail-summary">
      <div class="detail-description">
        <span class="label-small">作业说明</span>
        <p class="preserve-lines">{{ data.task.description || '本次作业未填写额外说明。' }}</p>
        <div class="file-requirements">
          <span>{{ data.task.extensions.map((s) => s.toUpperCase()).join(' / ') }}</span
          ><span>单文件 ≤ {{ data.task.maxSizeMb }} MB</span>
        </div>
      </div>
      <div class="detail-progress">
        <div
          class="progress-ring"
          :style="{
            '--progress': `${data.task.totalStudents ? (data.task.submittedCount / data.task.totalStudents) * 100 : 0}%`,
          }"
        >
          <div>
            <strong
              >{{ data.task.submittedCount }}<small>/ {{ data.task.totalStudents }}</small></strong
            ><span>已提交</span>
          </div>
        </div>
        <div>
          <h3>{{ missing.length ? `还有 ${missing.length} 份期待` : '全班作业已收齐！' }}</h3>
          <p>
            {{ missing.length ? '每次提醒，都让收齐更近一步。' : '每一份认真，都已经被好好收下。' }}
          </p>
          <button v-if="missing.length" class="text-link" @click="copyReminder">
            <ClipboardCopy :size="14" />复制催交通知</button
          ><span v-else class="text-link"><CheckCircle2 :size="16" />收集完成</span>
        </div>
      </div>
    </section>
    <section class="content-panel">
      <div class="panel-toolbar">
        <div class="filter-tabs">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
            全部同学<span>{{ data.students.length }}</span></button
          ><button :class="{ active: filter === 'submitted' }" @click="filter = 'submitted'">
            已提交<span>{{ data.task.submittedCount }}</span></button
          ><button :class="{ active: filter === 'missing' }" @click="filter = 'missing'">
            未提交<span>{{ missing.length }}</span>
          </button>
        </div>
        <div class="toolbar-actions">
          <label class="search-box"
            ><Search :size="15" /><input
              v-model="search"
              placeholder="搜索姓名或学号"
              aria-label="搜索姓名或学号" /></label
          ><button class="icon-button" aria-label="刷新提交情况" @click="refresh()">
            <RefreshCw :size="16" /></button
          ><a :href="`/api/tasks/${data.task.id}/export`" class="button secondary small-button"
            ><Download :size="14" />导出统计</a
          >
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>学号</th>
              <th>提交状态</th>
              <th>提交文件</th>
              <th>最近提交时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in students" :key="s.studentId">
              <td>
                <span class="student-cell"
                  ><span class="student-avatar">{{ s.name.slice(-2) }}</span
                  ><strong>{{ s.name }}</strong></span
                >
              </td>
              <td class="mono">{{ s.studentId }}</td>
              <td>
                <span v-if="files(s.studentId).length" class="submission-status submitted"
                  ><CheckCircle2 :size="14" />已提交</span
                ><span v-else class="submission-status missing"><Clock3 :size="14" />待提交</span>
              </td>
              <td>
                <div v-if="files(s.studentId).length" class="file-links">
                  <a
                    v-for="file in files(s.studentId)"
                    :key="file.id"
                    :href="`/api/files/${file.id}`"
                    :title="file.originalName"
                    ><FileDown :size="14" /><span>{{ file.originalName }}</span
                    ><small>{{ formatSize(file.size) }}</small></a
                  >
                </div>
                <span v-else class="muted">—</span>
              </td>
              <td class="muted small">
                {{
                  files(s.studentId)[0] ? formatDate(files(s.studentId)[0]!.submittedAt, true) : '—'
                }}
              </td>
            </tr>
            <tr v-if="!students.length">
              <td colspan="5" class="table-empty">没有符合条件的同学</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div class="detail-bottom">
      <p class="page-note">
        <CheckCircle2 :size="15" />统计以发布时的
        {{ data.task.totalStudents }} 人名单为准；重新提交会更新有效记录。
      </p>
      <div class="toolbar-actions">
        <button class="text-link" @click="editDue"><CalendarClock :size="15" />调整截止时间</button
        ><button
          class="text-link"
          :disabled="busy"
          @click="data.task.closed ? change({ closed: false }) : (confirmClose = true)"
        >
          <Play v-if="data.task.closed" :size="14" /><Pause v-else :size="14" />{{
            data.task.closed ? '恢复收集' : '停止收集'
          }}
        </button>
      </div>
    </div>
    <ShareModal
      v-if="shareOpen"
      :title="data.task.title"
      :token="data.task.shareToken"
      :app-url="dashboard?.appUrl"
      @close="shareOpen = false"
    />
    <AppModal
      v-if="confirmClose"
      title="停止收集这份作业？"
      subtitle="停止后，同学将无法继续提交；已有文件和统计会保留。"
      @close="!busy && (confirmClose = false)"
      ><div class="modal-footer padded-footer">
        <button class="button secondary" @click="confirmClose = false">继续收集</button
        ><button class="button primary" :disabled="busy" @click="change({ closed: true })">
          <LoaderCircle v-if="busy" :size="16" class="spin" />确认停止
        </button>
      </div></AppModal
    >
    <AppModal
      v-if="editingDue"
      title="调整截止时间"
      subtitle="时间按北京时间保存；延长截止时间后，同学可以继续提交。"
      @close="!busy && (editingDue = false)"
      ><form class="form-stack" @submit.prevent="change({ dueAt: inputToIso(dueInput) })">
        <label>新的截止时间<input v-model="dueInput" type="datetime-local" required /></label>
        <p v-if="data.task.closed" class="muted small">
          这份作业已手动停止收集，调整时间后还需要点击“恢复收集”。
        </p>
        <div class="modal-footer">
          <button class="button secondary" type="button" @click="editingDue = false">取消</button
          ><button class="button primary" :disabled="busy"><Save :size="16" />保存时间</button>
        </div>
      </form></AppModal
    >
  </template>
</template>
