<script setup lang="ts">
import { Download, Settings2, RefreshCw } from 'lucide-vue-next'
import { shanghaiDate } from '#shared/evening'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '请假管理 · 课代表' })
const day = ref(shanghaiDate())
const { data, refresh, error, status } = await useFetch('/api/admin/leaves', {
  query: { date: day },
  key: 'daily-leaves',
})
const filter = ref('all')
const shown = computed(
  () =>
    data.value?.leaves.filter(
      (l) =>
        filter.value === 'all' ||
        (filter.value === 'cancelled'
          ? !!l.cancelledAt
          : !l.cancelledAt && l.kind === filter.value),
    ) || [],
)
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">EVERY STUDENT, ACCOUNTED FOR</span>
      <h1>请假管理<span class="title-dot">.</span></h1>
      <p>按个人调整计算每日晚自习名单，请假提交后立即生效。</p>
    </div>
    <div class="inline-actions">
      <NuxtLink to="/evening-settings" class="button secondary"
        ><Settings2 :size="16" />晚自习设置</NuxtLink
      ><NuxtLink to="/leave" target="_blank" class="button secondary">学生请假页</NuxtLink>
    </div>
  </section>
  <section class="content-panel leave-panel">
    <div class="leave-daily-toolbar">
      <label>名单日期<input v-model="day" type="date" required /></label
      ><button
        class="icon-button"
        aria-label="刷新每日名单"
        :disabled="status === 'pending'"
        @click="refresh()"
      >
        <RefreshCw :size="18" /></button
      ><a :href="`/api/admin/evening/export?date=${day}`" class="button primary"
        ><Download :size="16" />导出当日名单</a
      >
    </div>
    <p class="leave-help">
      导出包含正常晚自习、请假名单（区分晚自习与普通课程）、安排说明。待补假条的请假有效；取消的请假恢复正常安排。
    </p>
    <p v-if="error" class="error-banner" role="alert">名单加载失败，请选择有效日期后重试。</p>
    <div v-if="data" class="leave-stats">
      <div>
        <strong>{{ data.expected.length }}</strong
        ><span>晚自习应到</span>
      </div>
      <div>
        <strong>{{ data.normal.length }}</strong
        ><span>正常晚自习</span>
      </div>
      <div>
        <strong>{{
          data.eveningLeaves.filter((l) => data!.expected.some((s) => s.studentId === l.studentId))
            .length
        }}</strong
        ><span>晚自习请假</span>
      </div>
      <div>
        <strong>{{ data.leaves.filter((l) => !l.cancelledAt && !l.proof).length }}</strong
        ><span>本日假条待补</span>
      </div>
    </div>
  </section>
  <section class="content-panel leave-panel">
    <h2>{{ day }} 正常晚自习名单</h2>
    <p v-if="!data?.settings.enabled" class="leave-help">
      晚自习安排未启用，请先在“晚自习设置”中配置。
    </p>
    <p v-else class="leave-help">
      {{ data?.settings.startTime }}–{{ data?.settings.endTime }} ·
      已按通过的调整及有效晚自习请假计算
    </p>
    <div class="leave-student-grid">
      <div v-for="s in data?.normal" :key="s.studentId">
        <strong>{{ s.name }}</strong
        ><span>{{ s.studentId }}</span>
      </div>
    </div>
    <p v-if="!data?.normal.length" class="leave-help">当日没有正常晚自习人员。</p>
  </section>
  <section class="content-panel leave-panel">
    <h2>当日请假记录</h2>
    <div class="filter-tabs leave-tabs">
      <button
        v-for="[value, label] in [
          ['all', '全部记录'],
          ['evening', '有效晚自习请假'],
          ['course', '有效课程请假'],
          ['cancelled', '已取消'],
        ]"
        :key="value"
        :class="{ active: filter === value }"
        @click="filter = value!"
      >
        {{ label }}
      </button>
    </div>
    <div class="table-scroll">
      <table class="leave-table">
        <thead>
          <tr>
            <th>同学</th>
            <th>课程 / 时段</th>
            <th>请假原因</th>
            <th>假条</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in shown" :key="l.id">
            <td>
              {{ l.studentName }}<small>{{ l.studentId }}</small>
            </td>
            <td>
              {{ l.courseName
              }}<small
                >{{ l.kind === 'evening' ? '晚自习' : '普通课程' }} ·
                {{ l.startAt.slice(11, 16) }}–{{ l.endAt.slice(11, 16) }}</small
              ><small
                v-if="
                  l.kind === 'evening' && !data?.expected.some((s) => s.studentId === l.studentId)
                "
                >当前安排已变化，当日无需到场</small
              >
            </td>
            <td class="leave-reason">{{ l.reason }}</td>
            <td>
              <a v-if="l.proof" class="text-link" :href="`/api/leave/proofs/${l.proof.id}`">{{
                l.proof.name
              }}</a
              ><span v-else class="leave-proof-due">待补假条</span>
            </td>
            <td>
              <span class="badge" :class="{ neutral: !!l.cancelledAt }">{{
                l.cancelledAt ? '已取消' : '已生效'
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!shown.length" class="leave-help">当日没有符合条件的请假记录。</p>
  </section>
</template>
