<script setup lang="ts">
import { ArrowLeft, Download, Link2, RefreshCw, Clock3, CheckCheck } from 'lucide-vue-next'
import type { Affair, Student, FormResponse } from '../../../shared/types'
import { apiError, formatDate, inputToIso, localDateInput } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const endpoint: string = `/api/affairs/${String(route.params.id)}`
const { data, refresh, error } = await useFetch<{
  affair: Affair
  students: Student[]
  responses: FormResponse[]
}>(endpoint)
const { data: classroom } = await useClassroom()
const { notify } = useNotice()
const share = ref(false),
  filter = ref('all'),
  busy = ref(false),
  deadlineOpen = ref(false),
  deadline = ref('')
const affair = computed(() => data.value?.affair)
const rows = computed(() =>
  (data.value?.students || [])
    .map((s) => ({
      ...s,
      response: data.value?.responses.find((r) => r.studentId === s.studentId),
    }))
    .filter(
      (s) => filter.value === 'all' || (filter.value === 'missing' ? !s.response : !!s.response),
    ),
)
const closed = computed(
  () => affair.value?.closed || (affair.value && Date.parse(affair.value.dueAt) <= Date.now()),
)
async function patch(body: { closed?: boolean; dueAt?: string }) {
  busy.value = true
  try {
    await $fetch(endpoint, { method: 'PATCH', body })
    await refresh()
    await refreshNuxtData('classroom-affairs')
    deadlineOpen.value = false
    notify('事务已更新')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
  }
}
function editDeadline() {
  deadline.value = localDateInput(new Date(affair.value!.dueAt))
  deadlineOpen.value = true
}
</script>
<template>
  <NuxtLink to="/affairs" class="back-link"><ArrowLeft :size="15" />返回班级事务</NuxtLink>
  <div v-if="error" class="error-banner">事务加载失败，请返回后重试。</div>
  <template v-else-if="affair">
    <section class="page-title-row">
      <div>
        <span class="eyebrow">{{ affair.category }}</span>
        <h1>{{ affair.title }}</h1>
        <p>{{ affair.description || '查看每一位同学的填写情况。' }}</p>
      </div>
      <div class="inline-actions">
        <button v-if="affair.mode === 'form'" class="button secondary" @click="share = true">
          <Link2 :size="16" />填写链接</button
        ><a
          v-if="affair.mode === 'form'"
          :href="`/api/affairs/${affair.id}/export`"
          class="button primary"
          ><Download :size="16" />导出填写结果</a
        >
      </div>
    </section>
    <OriginalNotice :text="affair.originalNotice" />
    <template v-if="affair.mode === 'form'">
      <section class="affair-summary">
        <div>
          <span class="stat-icon sage"><CheckCheck :size="21" /></span>
          <div>
            <strong
              >{{ affair.responseCount }}<small> / {{ affair.totalStudents }}</small></strong
            ><span>已填写人数</span>
          </div>
        </div>
        <div>
          <span class="stat-icon peach"><Clock3 :size="21" /></span>
          <div>
            <strong class="deadline-value">{{ formatDate(affair.dueAt, true) }}</strong
            ><span>截止时间 · 北京时间</span>
          </div>
          <button class="text-link" @click="editDeadline">修改</button>
        </div>
        <div>
          <span class="badge" :class="{ neutral: closed }">{{ closed ? '已截止' : '填写中' }}</span
          ><button class="text-link" :disabled="busy" @click="patch({ closed: !affair.closed })">
            {{ affair.closed ? '重新开放' : '停止填写' }}
          </button>
        </div>
      </section>
      <section class="content-panel affairs-panel">
        <div class="section-heading">
          <div class="filter-tabs">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部同学</button
            ><button :class="{ active: filter === 'submitted' }" @click="filter = 'submitted'">
              已填写 {{ affair.responseCount }}</button
            ><button :class="{ active: filter === 'missing' }" @click="filter = 'missing'">
              未填写 {{ affair.totalStudents - affair.responseCount }}
            </button>
          </div>
          <button class="icon-button" aria-label="刷新填写情况" @click="refresh()">
            <RefreshCw :size="17" />
          </button>
        </div>
        <div class="table-scroll">
          <table class="affairs-table response-table">
            <thead>
              <tr>
                <th>学号 / 姓名</th>
                <th>状态</th>
                <th v-for="f in affair.fields" :key="f.key">{{ f.label }}</th>
                <th>提交时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in rows" :key="student.studentId">
                <td>
                  <strong>{{ student.name }}</strong
                  ><small class="muted block mono">{{ student.studentId }}</small>
                </td>
                <td>
                  <span class="badge" :class="{ neutral: !student.response }">{{
                    student.response ? '已填写' : '未填写'
                  }}</span>
                </td>
                <td v-for="f in affair.fields" :key="f.key" class="answer-cell">
                  {{ student.response?.answers[f.key] || '—' }}
                </td>
                <td class="nowrap">
                  {{ student.response ? formatDate(student.response.submittedAt, true) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!rows.length" class="empty-assignments">当前筛选下没有记录。</p>
      </section>
    </template>
    <p v-else class="content-panel">
      {{
        affair.mode === 'files'
          ? '这项事务通过作业收集流程办理。'
          : '这项事务使用外部表格，请在概览表标记完成情况。'
      }}
      <NuxtLink :to="affair.taskId ? `/tasks/${affair.taskId}` : '/affairs'" class="text-link">{{
        affair.taskId ? '查看收集结果' : '返回概览表'
      }}</NuxtLink>
    </p>
    <ShareModal
      v-if="share"
      :title="affair.title"
      :token="affair.shareToken"
      kind="fill"
      :app-url="classroom?.appUrl"
      @close="share = false"
    />
    <AppModal v-if="deadlineOpen" title="修改截止时间" @close="deadlineOpen = false"
      ><form class="form-stack" @submit.prevent="patch({ dueAt: inputToIso(deadline) })">
        <label
          >截止时间 · 北京时间<input v-model="deadline" type="datetime-local" required
        /></label>
        <p class="field-hint">到期后自动停止填写；如已手动停止，请另行重新开放。</p>
        <div class="modal-footer">
          <button class="button primary" :disabled="busy">保存</button>
        </div>
      </form></AppModal
    >
  </template>
</template>
