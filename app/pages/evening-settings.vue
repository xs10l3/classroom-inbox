<script setup lang="ts">
import { CalendarDays, ArrowUpRight } from 'lucide-vue-next'
import {
  eveningWeekdays,
  weekdayLabels,
  adjustmentLabel,
  adjustmentStatuses,
} from '#shared/evening'
import type { EveningSettings, EveningAdjustment } from '../../shared/types'
import { apiError } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '晚自习设置 · 课代表' })
const {
  data,
  refresh,
  error: loadError,
} = await useFetch('/api/admin/evening', { key: 'evening-admin' })
const form = ref<EveningSettings>(
  data.value
    ? structuredClone(toRaw(data.value.settings))
    : {
        enabled: false,
        weekdays: [],
        startDate: '',
        endDate: '',
        startTime: '18:30',
        endTime: '20:30',
        originalNotice: '',
      },
)
const { notify } = useNotice()
const busy = ref(false),
  error = ref(''),
  notes = reactive<Record<string, string>>({}),
  revoke = ref<EveningAdjustment | null>(null)
const pending = computed(() => data.value?.adjustments.filter((a) => a.status === 'pending') || [])
async function save() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/evening', { method: 'PUT', body: form.value })
    await refresh()
    notify('晚自习安排已保存')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
async function review(a: EveningAdjustment, action: 'approve' | 'reject' | 'revoke') {
  busy.value = true
  try {
    await $fetch(`/api/admin/evening/adjustments/${a.id}`, {
      method: 'PATCH',
      body: { action, reviewNote: notes[a.id] || '' },
    })
    await refresh()
    revoke.value = null
    notify(
      action === 'approve' ? '调整已通过并生效' : action === 'reject' ? '申请已拒绝' : '调整已撤销',
    )
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">A PLAN FOR EVERY EVENING</span>
      <h1>晚自习设置<span class="title-dot">.</span></h1>
      <p>设置班级安排，审核同学申请，也可以直接设置个人调整。</p>
    </div>
    <NuxtLink to="/leaves" class="button secondary"
      >查看每日名单<ArrowUpRight :size="16"
    /></NuxtLink>
  </section>
  <p v-if="loadError" class="error-banner" role="alert">数据加载失败，请刷新页面重试。</p>
  <div class="leave-admin-grid">
    <section class="content-panel leave-panel">
      <h2><CalendarDays :size="22" />班级晚自习安排</h2>
      <form class="form-stack" @submit.prevent="save">
        <label class="leave-check"
          ><input v-model="form.enabled" type="checkbox" />启用晚自习安排</label
        >
        <fieldset class="leave-weekdays">
          <legend>每周晚自习日期</legend>
          <label v-for="d in eveningWeekdays" :key="d" class="leave-check"
            ><input v-model="form.weekdays" type="checkbox" :value="d" />{{
              weekdayLabels[d]
            }}</label
          >
        </fieldset>
        <div class="form-grid">
          <label>安排开始日期<input v-model="form.startDate" type="date" required /></label
          ><label
            >安排结束日期<input v-model="form.endDate" type="date" :min="form.startDate" required
          /></label>
        </div>
        <div class="form-grid">
          <label>每日开始时间<input v-model="form.startTime" type="time" required /></label
          ><label>每日结束时间<input v-model="form.endTime" type="time" required /></label>
        </div>
        <label
          >原始通知<textarea
            v-model="form.originalNotice"
            rows="5"
            maxlength="20000"
            placeholder="粘贴关于晚自习安排的原始通知，保留原文"
          />
        </label>
        <p class="leave-help">
          结束日期当天仍按安排执行，之后自动停止。永久调整也会随本次安排结束。更改安排前，请先处理冲突的个人调整。
        </p>
        <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
        <button class="button primary" :disabled="busy || !!loadError">保存班级安排</button>
      </form>
    </section>
    <section class="content-panel leave-panel">
      <h2>管理员直接设置</h2>
      <p class="leave-help">保存后立即生效。同学也可在学生页面自行申请，等待下方审核。</p>
      <EveningAdjustmentForm
        v-if="data"
        :settings="data.settings"
        :students="data.students"
        admin
        @saved="refresh()"
      />
    </section>
  </div>
  <section class="content-panel leave-panel">
    <h2>
      待审核申请 <span class="badge neutral">{{ pending.length }}</span>
    </h2>
    <p v-if="!pending.length" class="leave-help">当前没有待审核申请。</p>
    <article v-for="a in pending" :key="a.id" class="leave-record">
      <div class="leave-record-title">
        <strong>{{ a.studentName }} · {{ a.studentId }}</strong
        ><span class="badge neutral">待审核</span>
      </div>
      <p>{{ adjustmentLabel(a) }}</p>
      <p class="leave-reason">{{ a.reason }}</p>
      <label class="leave-review-note"
        >审核备注<input v-model="notes[a.id]" maxlength="1000" placeholder="可选，填写给同学的说明"
      /></label>
      <div class="inline-actions">
        <button class="button primary small" :disabled="busy" @click="review(a, 'approve')">
          通过并生效</button
        ><button class="button secondary small" :disabled="busy" @click="review(a, 'reject')">
          拒绝申请
        </button>
      </div>
    </article>
  </section>
  <section class="content-panel leave-panel">
    <h2>个人调整记录</h2>
    <div class="table-scroll">
      <table class="leave-table">
        <thead>
          <tr>
            <th>同学</th>
            <th>调整安排</th>
            <th>状态 / 来源</th>
            <th>原因与备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data?.adjustments.filter((a) => a.status !== 'pending')" :key="a.id">
            <td>
              {{ a.studentName }}<small>{{ a.studentId }}</small>
            </td>
            <td>
              {{ adjustmentLabel(a)
              }}<small v-if="a.inactiveFrom">{{ a.inactiveFrom }} 起撤销</small>
            </td>
            <td>
              {{ adjustmentStatuses[a.status]
              }}<small>{{ a.createdBy === 'admin' ? '管理员设置' : '同学申请' }}</small>
            </td>
            <td class="leave-reason">
              {{ a.reason }}<small>{{ a.reviewNote }}</small>
            </td>
            <td>
              <button
                v-if="a.status === 'approved'"
                class="text-link"
                :disabled="busy"
                @click="revoke = a"
              >
                撤销调整
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!data?.adjustments.some((a) => a.status !== 'pending')" class="leave-help">
      尚无已处理的调整。
    </p>
  </section>
  <AppModal
    v-if="revoke"
    title="撤销个人调整"
    subtitle="从今天起恢复原安排，过去的固定调整仍保留。已经开始的日期调整不能撤销。"
    @close="revoke = null"
    ><div class="share-content">
      <button class="button primary" :disabled="busy" @click="review(revoke, 'revoke')">
        确认撤销调整
      </button>
    </div></AppModal
  >
</template>
