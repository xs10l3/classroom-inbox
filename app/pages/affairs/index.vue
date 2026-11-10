<script setup lang="ts">
import {
  Plus,
  FileJson,
  Search,
  ExternalLink,
  Link2,
  ClipboardList,
  RefreshCw,
  Check,
  CircleCheck,
  Clock3,
  Files,
} from 'lucide-vue-next'
import type { Affair } from '../../../shared/types'
import { apiError, formatDate } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
const { data: classroom, refresh: refreshClassroom } = await useClassroom()
const { data, refresh, error } = await useFetch('/api/affairs', { key: 'classroom-affairs' })
const { notify } = useNotice()
const createOpen = ref(false),
  importOpen = ref(false),
  share = ref<Affair | null>(null),
  search = ref(''),
  filter = ref('all'),
  busy = ref('')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
})
onBeforeUnmount(() => clearInterval(timer))
const affairs = computed(() => data.value?.affairs || [])
const isComplete = (a: Affair) =>
  a.mode === 'link' ? a.completed : a.totalStudents > 0 && a.responseCount >= a.totalStudents
const isEnded = (a: Affair) => a.closed || Date.parse(a.dueAt) <= now.value
const ongoing = computed(() => affairs.value.filter((a) => !isComplete(a) && !isEnded(a)).length)
const completed = computed(() => affairs.value.filter(isComplete).length)
const filtered = computed(() =>
  affairs.value.filter(
    (a) =>
      `${a.title} ${a.category}`.toLowerCase().includes(search.value.toLowerCase()) &&
      (filter.value === 'all' || filter.value === a.mode),
  ),
)
const modeName = (mode: string) =>
  ({ form: '在线表单', link: '外部表格', files: '文件收集' })[mode] || mode
const entry = (a: Affair) =>
  a.mode === 'link'
    ? a.url
    : a.mode === 'form'
      ? `/fill/${a.shareToken}`
      : `/submit/${a.taskShareToken}`
async function reload() {
  await Promise.all([refresh(), refreshClassroom()])
}
async function created() {
  createOpen.value = false
  importOpen.value = false
  await reload()
}
async function toggle(a: Affair) {
  busy.value = a.id
  try {
    await $fetch(`/api/affairs/${a.id}`, { method: 'PATCH', body: { completed: !a.completed } })
    await refresh()
    notify(a.completed ? '事务已恢复待办' : '事务已标记完成')
  } catch (e) {
    notify(apiError(e), true)
  } finally {
    busy.value = ''
  }
}
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">EVERY LITTLE THING, IN ORDER</span>
      <h1>班级事务<span class="title-dot">.</span></h1>
      <p>通知、报名和文件收集，一个表看清所有进展。</p>
    </div>
    <div class="inline-actions">
      <button class="button secondary" @click="importOpen = true">
        <FileJson :size="17" />JSON 导入</button
      ><button class="button primary" @click="createOpen = true">
        <Plus :size="17" />新增事务
      </button>
    </div>
  </section>
  <section class="affair-summary">
    <div>
      <span class="stat-icon sage"><ClipboardList :size="21" /></span>
      <div>
        <strong>{{ affairs.length }}</strong
        ><span>全部事务</span>
      </div>
    </div>
    <div>
      <span class="stat-icon peach"><Clock3 :size="21" /></span>
      <div>
        <strong>{{ ongoing }}</strong
        ><span>正在办理</span>
      </div>
    </div>
    <div>
      <span class="stat-icon blue"><CircleCheck :size="21" /></span>
      <div>
        <strong>{{ completed }}</strong
        ><span>已完成</span>
      </div>
    </div>
  </section>
  <section class="content-panel affairs-panel">
    <div class="section-heading">
      <h2>班级事务概览表</h2>
      <button class="icon-button" aria-label="刷新事务" @click="reload">
        <RefreshCw :size="17" />
      </button>
    </div>
    <div class="affair-toolbar">
      <div class="filter-tabs">
        <button
          v-for="tab in [
            { value: 'all', label: '全部' },
            { value: 'form', label: '在线表单' },
            { value: 'link', label: '外部表格' },
            { value: 'files', label: '文件收集' },
          ]"
          :key="tab.value"
          :class="{ active: filter === tab.value }"
          @click="filter = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
      <label class="search-box"
        ><Search :size="16" /><input
          v-model="search"
          placeholder="搜索事务或分类"
          aria-label="搜索事务"
      /></label>
    </div>
    <div v-if="error" class="error-banner">
      加载失败。<button class="text-link" @click="refresh()">重试</button>
    </div>
    <div
      v-else-if="filtered.length"
      class="table-scroll"
      tabindex="0"
      aria-label="班级事务表，手机可左右滑动"
    >
      <table class="affairs-table">
        <thead>
          <tr>
            <th>事务 / 分类</th>
            <th>办理方式</th>
            <th>截止时间</th>
            <th>完成进度</th>
            <th>状态</th>
            <th>办理与管理</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in filtered" :key="a.id">
            <td>
              <strong class="affair-title">{{ a.title }}</strong
              ><span class="affair-category">{{ a.category }}</span>
              <p v-if="a.description" class="affair-desc" :title="a.description">
                {{ a.description }}
              </p>
            </td>
            <td>
              <span class="mode-label"
                ><Files v-if="a.mode === 'files'" :size="15" /><ExternalLink
                  v-else-if="a.mode === 'link'"
                  :size="15"
                /><ClipboardList v-else :size="15" />{{ modeName(a.mode) }}</span
              >
            </td>
            <td class="nowrap">
              {{ formatDate(a.dueAt, true) }}<small class="muted block">北京时间</small>
            </td>
            <td>
              <template v-if="a.mode !== 'link'"
                ><strong>{{ a.responseCount }}</strong> / {{ a.totalStudents }} 人
                <div class="progress-track affair-progress">
                  <span
                    :style="{
                      width: `${a.totalStudents ? (a.responseCount / a.totalStudents) * 100 : 0}%`,
                    }"
                  /></div></template
              ><span v-else class="muted">管理员标记</span>
            </td>
            <td>
              <span class="badge" :class="{ neutral: isEnded(a), complete: isComplete(a) }">{{
                isComplete(a) ? '已完成' : isEnded(a) ? '已截止' : '进行中'
              }}</span>
            </td>
            <td>
              <div class="affair-actions">
                <a :href="entry(a)" target="_blank" rel="noopener noreferrer" class="text-link"
                  >{{ a.mode === 'files' ? '提交文件' : '填写表格' }}<ExternalLink :size="13" /></a
                ><button
                  v-if="a.mode === 'link'"
                  class="text-link"
                  :disabled="busy === a.id"
                  @click="toggle(a)"
                >
                  <Check :size="13" />{{ a.completed ? '恢复待办' : '标记完成' }}</button
                ><NuxtLink
                  v-else
                  :to="a.mode === 'files' ? `/tasks/${a.taskId}` : `/affairs/${a.id}`"
                  class="text-link"
                  >查看结果</NuxtLink
                ><button
                  v-if="a.mode !== 'link'"
                  class="icon-button"
                  :aria-label="`分享${a.title}`"
                  @click="share = a"
                >
                  <Link2 :size="15" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-assignments">
      <div class="empty-icon"><ClipboardList :size="30" /></div>
      <h3>{{ affairs.length ? '没有找到相关事务' : '把班级的事情放到这里' }}</h3>
      <p>创建表单、添加已有表格链接，或者接入文件收集。</p>
      <button class="button secondary" @click="importOpen = true">
        <FileJson :size="16" />用 JSON 批量导入
      </button>
    </div>
  </section>
  <p class="mobile-only table-scroll-hint">左右滑动表格，可查看完成进度和办理入口。</p>
  <div class="little-tip affairs-tip">
    <FileJson :size="21" />
    <div>
      <strong>一段通知，也能变成清楚的待办。</strong>
      <p>
        打开“JSON 导入”，复制整理提示词，即可让 AI
        生成符合格式的数据。外部表格的办理结果需手动标记。
      </p>
    </div>
  </div>
  <CreateAffairModal
    v-if="createOpen"
    :tasks="classroom?.tasks || []"
    :max-size="classroom?.storage.maxSizeMb || 20"
    @close="createOpen = false"
    @created="created"
  />
  <ImportAffairsModal
    v-if="importOpen"
    :max-size="classroom?.storage.maxSizeMb || 20"
    @close="importOpen = false"
    @created="created"
  />
  <ShareModal
    v-if="share"
    :title="share.title"
    :token="share.mode === 'files' ? share.taskShareToken! : share.shareToken"
    :kind="share.mode === 'form' ? 'fill' : 'submit'"
    :app-url="classroom?.appUrl"
    @close="share = null"
  />
</template>
