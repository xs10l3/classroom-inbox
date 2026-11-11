<script setup lang="ts">
import { ArrowLeft, CalendarDays, ClipboardCheck, RefreshCw } from 'lucide-vue-next'
import type { LeaveRecord, Student } from '../../shared/types'
import {
  shanghaiDate,
  weekdayLabels,
  weekdayOf,
  adjustmentLabel,
  adjustmentStatuses,
} from '#shared/evening'
import { apiError } from '~/utils/format'
useHead({ title: '请假与个人安排 · 课代表' })
const { data: config, refresh: refreshConfig } = await useFetch('/api/leave/config')
const { data: session } = await useFetch('/api/leave/session')
const {
  data: mine,
  refresh,
  error: loadError,
} = await useFetch('/api/leave/me', { immediate: !!session.value?.student, watch: false })
const { notify } = useNotice()
const identity = reactive({ name: '', studentId: '' })
const busy = ref(false),
  error = ref(''),
  proof = ref<File | null>(null),
  proofInput = ref<HTMLInputElement>(),
  proofFor = ref<LeaveRecord | null>(null),
  cancel = ref<LeaveRecord | null>(null)
const form = reactive({
  kind: 'evening' as 'evening' | 'course',
  date: shanghaiDate(),
  courseName: '',
  startTime: '08:00',
  endTime: '09:40',
  reason: '',
  deferProof: false,
})
const tab = ref('records')
async function login() {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<{ student: Student }>('/api/leave/session', {
      method: 'POST',
      body: identity,
    })
    session.value = result
    await refresh()
    identity.name = ''
    identity.studentId = ''
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
async function logout() {
  try {
    await $fetch('/api/leave/session', { method: 'DELETE' })
    session.value = { student: null }
    mine.value = undefined
    proof.value = null
    form.reason = ''
    form.courseName = ''
    error.value = ''
    tab.value = 'records'
  } catch (e) {
    notify(apiError(e), true)
  }
}
async function submit() {
  busy.value = true
  error.value = ''
  try {
    const body = new FormData()
    for (const [k, v] of Object.entries(form)) body.append(k, String(v))
    if (proof.value) body.append('proof', proof.value)
    await $fetch('/api/leave/requests', { method: 'POST', body })
    proof.value = null
    if (proofInput.value) proofInput.value.value = ''
    form.reason = ''
    form.deferProof = false
    await refresh()
    tab.value = 'records'
    notify('请假已生效，请按要求补齐假条')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
async function cancelLeave() {
  if (!cancel.value) return
  busy.value = true
  try {
    await $fetch(`/api/leave/requests/${cancel.value.id}`, { method: 'DELETE' })
    cancel.value = null
    await refresh()
    notify('请假已取消')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
  }
}
async function uploadProof(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file || !proofFor.value) return
  busy.value = true
  try {
    const body = new FormData()
    body.append('proof', file)
    await $fetch(`/api/leave/requests/${proofFor.value.id}/proof`, { method: 'POST', body })
    proofFor.value = null
    await refresh()
    notify('假条已保存')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
    input.value = ''
  }
}
async function withdraw(id: string) {
  busy.value = true
  try {
    await $fetch(`/api/leave/adjustments/${id}`, { method: 'DELETE' })
    await refresh()
    notify('调整申请已撤回')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
  }
}
function chooseProof(event: Event) {
  proof.value = (event.target as HTMLInputElement).files?.[0] || null
  if (proof.value) form.deferProof = false
}
function deferProofChanged() {
  proof.value = null
  if (proofInput.value) proofInput.value.value = ''
}
async function reload() {
  await Promise.all([refreshConfig(), refresh()])
}
</script>
<template>
  <div class="leave-public">
    <header class="submit-header">
      <AppLogo small /><span>{{ config?.className || '我们的班级' }}</span
      ><NuxtLink to="/" class="text-link"><ArrowLeft :size="16" />班级待办</NuxtLink>
    </header>
    <main class="leave-workspace">
      <section class="leave-heading">
        <span class="eyebrow">YOUR PLANS, IN ONE PLACE</span>
        <h1>请假与个人安排<span class="title-dot">.</span></h1>
        <p>普通课程与晚自习请假、补交假条，查询自己的每一次安排。</p>
      </section>
      <section v-if="!session?.student" class="content-panel leave-panel">
        <h2><ClipboardCheck :size="22" />先核对本人信息</h2>
        <p class="leave-help">
          填写当前班级名单中的姓名与学号，查看或办理本人的请假。共用设备使用后请点击“切换同学”。
        </p>
        <form class="form-stack" @submit.prevent="login">
          <div class="form-grid">
            <label
              >你的姓名<input
                v-model="identity.name"
                required
                maxlength="40"
                autocomplete="name" /></label
            ><label
              >你的学号<input
                v-model="identity.studentId"
                required
                maxlength="32"
                autocomplete="username"
            /></label>
          </div>
          <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
          <button class="button primary" :disabled="busy">
            {{ busy ? '正在核对…' : '查看我的请假' }}
          </button>
        </form>
      </section>
      <template v-else>
        <div class="leave-identity">
          <div>
            <strong>{{ session.student.name }}</strong
            ><span>{{ session.student.studentId }}</span>
          </div>
          <div class="inline-actions">
            <button class="icon-button" aria-label="刷新我的请假" @click="reload">
              <RefreshCw :size="18" /></button
            ><button class="button secondary small" :disabled="busy" @click="logout">
              切换同学
            </button>
          </div>
        </div>
        <p v-if="loadError" class="error-banner" role="alert">
          记录加载失败，请刷新或重新核对本人信息。
        </p>
        <section v-if="config?.settings.enabled" class="content-panel leave-panel leave-schedule">
          <h2><CalendarDays :size="22" />我的晚自习</h2>
          <p>
            {{ config.settings.startDate }} 至 {{ config.settings.endDate }} ·
            {{ config.settings.startTime }}–{{ config.settings.endTime }}
          </p>
          <p class="leave-help">
            本班：{{ config.settings.weekdays.map((d) => weekdayLabels[d]).join('、') }}。以下为未来
            42 天内按已通过调整计算的日期，请假状态见下方记录。
          </p>
          <div class="leave-date-chips">
            <span v-for="day in mine?.upcoming" :key="day"
              >{{ day }} {{ weekdayLabels[weekdayOf(day)] }}</span
            ><span v-if="!mine?.upcoming.length">近期没有晚自习安排</span>
          </div>
          <OriginalNotice :text="config.settings.originalNotice" />
        </section>
        <div class="filter-tabs leave-tabs">
          <button :class="{ active: tab === 'records' }" @click="tab = 'records'">我的请假</button
          ><button :class="{ active: tab === 'new' }" @click="tab = 'new'">新增请假</button
          ><button :class="{ active: tab === 'adjust' }" @click="tab = 'adjust'">个人调整</button>
        </div>
        <section v-if="tab === 'records'" class="content-panel leave-panel">
          <h2>我的请假记录</h2>
          <p v-if="!mine?.leaves.length" class="leave-help">
            还没有请假记录。需要请假时，点击“新增请假”。
          </p>
          <article v-for="l in mine?.leaves" :key="l.id" class="leave-record">
            <div class="leave-record-title">
              <strong>{{ l.date }} · {{ l.courseName }}</strong
              ><span class="badge" :class="{ neutral: !!l.cancelledAt }">{{
                l.cancelledAt ? '已取消' : '已生效'
              }}</span>
            </div>
            <p>
              {{ l.startAt.slice(11, 16) }}–{{ l.endAt.slice(11, 16) }} ·
              {{ l.kind === 'evening' ? '晚自习' : '普通课程' }}
            </p>
            <p class="leave-reason">{{ l.reason }}</p>
            <div class="leave-record-actions">
              <FileActions
                v-if="l.proof"
                :url="`/api/leave/proofs/${l.proof.id}`"
                :name="l.proof.name"
              />
              <span v-else class="leave-proof-due">假条待补</span
              ><template v-if="!l.cancelledAt"
                ><button class="button secondary small" :disabled="busy" @click="proofFor = l">
                  {{ l.proof ? '更新假条' : '补交假条' }}</button
                ><button class="text-link" :disabled="busy" @click="cancel = l">
                  取消请假
                </button></template
              >
            </div>
          </article>
        </section>
        <section v-else-if="tab === 'new'" class="content-panel leave-panel">
          <h2>提交请假</h2>
          <p class="leave-help">提交后立即生效。假条必须上传；暂时没有时，请勾选“以后补交”。</p>
          <form class="form-stack" @submit.prevent="submit">
            <div class="form-grid">
              <label
                >请假类型<select v-model="form.kind">
                  <option value="evening">晚自习</option>
                  <option value="course">普通课程</option>
                </select></label
              ><label
                >请假日期<input
                  v-model="form.date"
                  type="date"
                  :min="shanghaiDate()"
                  :max="form.kind === 'evening' ? config?.settings.endDate : undefined"
                  required
              /></label>
            </div>
            <p v-if="form.kind === 'evening'" class="leave-help">
              {{
                config?.settings.enabled
                  ? `按当日晚自习时段 ${config.settings.startTime}–${config.settings.endTime} 请假；须为本人已生效安排中的日期。`
                  : '晚自习尚未启用，普通课程请假仍可使用。'
              }}
            </p>
            <template v-else
              ><label>课程名称<input v-model="form.courseName" maxlength="100" required /></label>
              <div class="form-grid">
                <label>开始时间<input v-model="form.startTime" type="time" required /></label
                ><label>结束时间<input v-model="form.endTime" type="time" required /></label></div
            ></template>
            <label
              >请假原因<textarea v-model="form.reason" rows="3" maxlength="2000" required />
            </label>
            <label
              >上传假条（PDF / JPG / PNG / WebP，最多 {{ config?.proofLimitMb }} MB）<input
                ref="proofInput"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                :disabled="!config?.storageReady"
                @change="chooseProof" /></label
            ><label class="leave-check"
              ><input
                v-model="form.deferProof"
                type="checkbox"
                @change="deferProofChanged"
              />暂时没有假条，以后补交</label
            >
            <p v-if="!config?.storageReady" class="leave-help">
              假条存储尚未配置，可先选择以后补交。
            </p>
            <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
            <button
              class="button primary"
              :disabled="busy || (form.kind === 'evening' && !config?.settings.enabled)"
            >
              {{ busy ? '正在提交…' : '提交请假并生效' }}
            </button>
          </form>
        </section>
        <section v-else class="content-panel leave-panel">
          <h2>申请调整晚自习</h2>
          <p class="leave-help">
            申请需要管理员审核；审核通过后才会改变个人安排。已通过的调整需要变更时，请联系管理员。
          </p>
          <EveningAdjustmentForm v-if="config" :settings="config.settings" @saved="refresh()" />
          <h3 class="leave-subheading">我的调整记录</h3>
          <p v-if="!mine?.adjustments.length" class="leave-help">还没有调整记录。</p>
          <article v-for="a in mine?.adjustments" :key="a.id" class="leave-record">
            <div class="leave-record-title">
              <strong>{{ adjustmentLabel(a) }}</strong
              ><span class="badge" :class="{ neutral: a.status !== 'approved' }">{{
                adjustmentStatuses[a.status]
              }}</span>
            </div>
            <p class="leave-reason">{{ a.reason }}</p>
            <p v-if="a.reviewNote" class="leave-help">管理员备注：{{ a.reviewNote }}</p>
            <p v-if="a.inactiveFrom" class="leave-help">{{ a.inactiveFrom }} 起撤销</p>
            <button
              v-if="a.status === 'pending'"
              class="text-link"
              :disabled="busy"
              @click="withdraw(a.id)"
            >
              撤回申请
            </button>
          </article>
        </section>
      </template>
    </main>
    <AppModal
      v-if="cancel"
      title="确认取消请假"
      :subtitle="`${cancel.date} · ${cancel.courseName}，取消后恢复正常安排。`"
      @close="cancel = null"
      ><div class="share-content">
        <button class="button primary" :disabled="busy" @click="cancelLeave">确认取消请假</button>
      </div></AppModal
    >
    <AppModal
      v-if="proofFor"
      title="补交或更新假条"
      subtitle="仅支持 PDF、JPG、PNG 或 WebP，保存后替换当前假条。"
      @close="proofFor = null"
      ><label class="form-stack"
        >选择假条文件<input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          :disabled="busy"
          @change="uploadProof"
      /></label>
      <p v-if="busy">正在上传，请稍候…</p></AppModal
    >
  </div>
</template>
