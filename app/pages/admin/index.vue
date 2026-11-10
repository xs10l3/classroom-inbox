<script setup lang="ts">
import {
  Plus,
  ArrowUpRight,
  Search,
  LayoutGrid,
  List,
  ChevronRight,
  ClipboardList,
  UsersRound,
  FileCheck2,
  Clock3,
  Link2,
  FolderOpen,
  ArrowRight,
  Sparkles,
  Upload,
  CalendarDays,
  CheckCheck,
} from 'lucide-vue-next'
import type { Task } from '../../../shared/types'
import { formatDate, formatSize, calendarDay } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
const { data, refresh, error } = await useClassroom()
const createOpen = ref(false),
  shareTask = ref<Task | null>(null)
const filter = ref('all'),
  search = ref(''),
  view = ref('grid')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onBeforeUnmount(() => clearInterval(timer))
const tasks = computed(() => data.value?.tasks || [])
const ongoing = (t: Task) => !t.closed && new Date(t.dueAt).getTime() > now.value
const counts = computed(() => ({
  all: tasks.value.length,
  ongoing: tasks.value.filter(ongoing).length,
  ended: tasks.value.filter((t) => !ongoing(t)).length,
  completed: tasks.value.filter((t) => t.submittedCount === t.totalStudents).length,
}))
const pending = computed(() =>
  tasks.value.filter(ongoing).reduce((n, t) => n + t.totalStudents - t.submittedCount, 0),
)
const submitted = computed(() => tasks.value.reduce((n, t) => n + t.submittedCount, 0))
const filtered = computed(() =>
  tasks.value.filter(
    (t) =>
      (filter.value === 'all' ||
        (filter.value === 'ongoing' && ongoing(t)) ||
        (filter.value === 'ended' && !ongoing(t)) ||
        (filter.value === 'completed' && t.submittedCount === t.totalStudents)) &&
      `${t.title}${t.subject}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const upcoming = computed(() =>
  tasks.value
    .filter(ongoing)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 3),
)
const tabs = [
  { id: 'all', label: '全部作业' },
  { id: 'ongoing', label: '收集中' },
  { id: 'ended', label: '已截止' },
  { id: 'completed', label: '已收齐' },
] as const
function create() {
  if (!data.value?.students.length) return navigateTo('/students')
  createOpen.value = true
}
async function created() {
  createOpen.value = false
  await refresh()
}
function status(t: Task) {
  return !ongoing(t) ? '已截止' : t.submittedCount === t.totalStudents ? '已收齐' : '收集中'
}
</script>
<template>
  <div v-if="error" class="error-banner">
    数据加载失败。<button class="text-link" @click="refresh()">重新加载</button>
  </div>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">YOUR CLASS, ALL IN ONE PLACE</span>
      <h1>作业总览<span class="title-dot">.</span></h1>
      <p>班级作业的每一步，都在这里井井有条。</p>
    </div>
    <button class="button primary" @click="create"><Plus :size="18" />发布作业</button>
  </section>
  <section class="welcome-banner">
    <div class="welcome-copy">
      <span class="welcome-kicker"><span class="status-dot" /> 新的一天，从容一点</span>
      <h2>把作业收齐，<br />把时间留给更重要的事。</h2>
      <p>
        {{
          data?.students.length
            ? `有 ${data.students.length} 位同学在这里。今天也一起，让班级事务简单一点。`
            : '从一份班级名单开始，告别反复统计和翻找文件。'
        }}
      </p>
      <NuxtLink v-if="!data?.students.length" to="/students" class="banner-link"
        >导入第一份班级名单<ArrowRight :size="17" /></NuxtLink
      ><button v-else class="banner-link" @click="create">
        开始一次新收集<ArrowRight :size="17" />
      </button>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="art-orbit" />
      <div class="floating-star star-one">✳</div>
      <div class="floating-star star-two">✦</div>
      <div class="art-paper paper-back" />
      <div class="art-paper paper-front">
        <span class="paper-mini-title">ASSIGNMENT</span><span class="paper-line long" /><span
          class="paper-line"
        /><span class="paper-line short" />
        <div class="paper-check"><CheckCheck :size="31" :stroke-width="1.5" /></div>
      </div>
      <div class="art-folder">
        <span class="folder-tab" /><FolderOpen :size="30" :stroke-width="1.2" /><span
          >ALL IN GOOD ORDER.</span
        >
      </div>
      <span class="art-bubble"><CheckCheck :size="16" /> 每一份，都收好</span>
    </div>
  </section>
  <section class="stats-grid">
    <article class="stat-card">
      <div>
        <span>正在收集</span><span class="stat-icon sage"><ClipboardList :size="19" /></span>
      </div>
      <strong>{{ counts.ongoing }}<small>份作业</small></strong>
      <p><span class="mini-dot sage-bg" /> 共有 {{ counts.all }} 份已发布作业</p>
    </article>
    <article class="stat-card">
      <div>
        <span>已收到提交</span><span class="stat-icon blue"><FileCheck2 :size="19" /></span>
      </div>
      <strong>{{ submitted }}<small>人次</small></strong>
      <p><span class="mini-dot blue-bg" /> 每份作业按同学去重统计</p>
    </article>
    <article class="stat-card">
      <div>
        <span>还在等待</span><span class="stat-icon peach"><Clock3 :size="19" /></span>
      </div>
      <strong>{{ pending }}<small>人次</small></strong>
      <p><span class="mini-dot peach-bg" /> 收集中作业的待提交人数</p>
    </article>
    <article class="stat-card">
      <div>
        <span>班级同学</span><span class="stat-icon purple"><UsersRound :size="19" /></span>
      </div>
      <strong>{{ data?.students.length || 0 }}<small>位同学</small></strong
      ><NuxtLink to="/students">查看与管理名单<ArrowUpRight :size="13" /></NuxtLink>
    </article>
  </section>
  <div class="dashboard-columns">
    <section class="assignments-section">
      <div class="section-heading">
        <h2>
          班级作业<span>{{ tasks.length }}</span>
        </h2>
        <div class="view-switch" aria-label="作业显示方式">
          <button
            aria-label="卡片视图"
            :class="{ selected: view === 'grid' }"
            @click="view = 'grid'"
          >
            <LayoutGrid :size="16" /></button
          ><button
            aria-label="列表视图"
            :class="{ selected: view === 'list' }"
            @click="view = 'list'"
          >
            <List :size="17" />
          </button>
        </div>
      </div>
      <div class="collection-toolbar">
        <div class="filter-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="{ active: filter === tab.id }"
            @click="filter = tab.id"
          >
            {{ tab.label }}<span>{{ counts[tab.id] }}</span>
          </button>
        </div>
        <label class="search-box"
          ><Search :size="16" /><input
            v-model="search"
            placeholder="搜索作业"
            aria-label="搜索作业"
        /></label>
      </div>
      <div v-if="filtered.length" class="task-grid" :class="{ 'list-view': view === 'list' }">
        <article v-for="(task, index) in filtered" :key="task.id" class="task-card">
          <div class="task-card-top">
            <span class="subject-icon" :class="['sage', 'blue', 'peach', 'purple'][index % 4]"
              ><ClipboardList :size="23" :stroke-width="1.5" /></span
            ><span
              class="badge"
              :class="{
                neutral: !ongoing(task),
                complete: task.submittedCount === task.totalStudents,
              }"
              ><span />{{ status(task) }}</span
            >
          </div>
          <div class="task-card-title">
            <span class="subject-label">{{ task.subject }}</span
            ><NuxtLink :to="`/tasks/${task.id}`"
              ><h3>{{ task.title }}</h3></NuxtLink
            >
            <p>{{ task.description || '认真完成，记得按时提交。' }}</p>
          </div>
          <div class="task-card-progress">
            <div class="progress-label">
              <span>收集进度</span
              ><span
                ><strong>{{ task.submittedCount }}</strong> / {{ task.totalStudents }} 人</span
              >
            </div>
            <div class="progress-track">
              <span
                :style="{
                  width: `${task.totalStudents ? (task.submittedCount / task.totalStudents) * 100 : 0}%`,
                }"
              />
            </div>
          </div>
          <div class="task-card-footer">
            <span><CalendarDays :size="13" />{{ formatDate(task.dueAt, true) }} 截止</span
            ><button
              class="icon-button"
              aria-label="分享收集链接"
              title="分享收集链接"
              @click="shareTask = task"
            >
              <Link2 :size="16" /></button
            ><NuxtLink :to="`/tasks/${task.id}`" class="task-open" aria-label="查看作业详情"
              ><ArrowUpRight :size="18"
            /></NuxtLink>
          </div>
        </article>
      </div>
      <div v-else class="empty-assignments">
        <div class="empty-icon"><ClipboardList :size="30" :stroke-width="1.3" /><span>+</span></div>
        <h3>{{ tasks.length ? '没有找到符合条件的作业' : '第一份作业，从这里开始' }}</h3>
        <p>
          {{
            tasks.length
              ? '换一个关键词或筛选条件试试。'
              : '发布作业后，即可分享链接、查看进度和一键归档。'
          }}
        </p>
        <button v-if="!tasks.length" class="button secondary" @click="create">
          {{ data?.students.length ? '发布第一份作业' : '先导入班级名单' }}<ArrowRight :size="16" />
        </button>
      </div>
      <div class="small-note">
        <span class="status-dot" />提交状态实时保存，点击右上角刷新可获取最新进度。
      </div>
    </section>
    <aside class="dashboard-side">
      <section class="side-panel">
        <div class="section-heading">
          <h2>近期截止</h2>
          <Clock3 :size="17" />
        </div>
        <template v-if="upcoming.length"
          ><NuxtLink
            v-for="task in upcoming"
            :key="task.id"
            :to="`/tasks/${task.id}`"
            class="upcoming-item"
            ><span class="upcoming-date"
              ><strong>{{ calendarDay(task.dueAt) }}</strong
              ><small>{{
                new Date(task.dueAt).toLocaleDateString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  month: 'short',
                })
              }}</small></span
            >
            <div>
              <strong>{{ task.title }}</strong
              ><small>还有 {{ task.totalStudents - task.submittedCount }} 人待提交</small>
            </div>
            <ChevronRight :size="15" /></NuxtLink
        ></template>
        <div v-else class="side-empty">
          <CalendarDays :size="25" :stroke-width="1.3" />
          <p>暂时没有即将截止的作业<br /><span>享受这份从容吧。</span></p>
        </div>
      </section>
      <section class="side-panel activity-panel">
        <div class="section-heading">
          <h2>最近提交</h2>
          <span class="live-label"><span class="status-dot" />动态</span>
        </div>
        <div v-if="data?.recentSubmissions.length" class="activity-list">
          <NuxtLink
            v-for="file in data.recentSubmissions.slice(0, 4)"
            :key="file.id"
            :to="`/tasks/${file.taskId}`"
            class="activity-item"
            ><span class="activity-avatar">{{ file.studentName.slice(-2) }}</span>
            <div>
              <p>
                <strong>{{ file.studentName }}</strong> 提交了作业
              </p>
              <small>{{ file.taskTitle }}</small
              ><time>{{ formatDate(file.submittedAt, true) }} · {{ formatSize(file.size) }}</time>
            </div></NuxtLink
          >
        </div>
        <div v-else class="side-empty">
          <Upload :size="25" :stroke-width="1.3" />
          <p>还没有收到作业<br /><span>第一份提交，很快就来。</span></p>
        </div>
      </section>
      <div class="little-tip">
        <Sparkles :size="20" :stroke-width="1.5" />
        <div>
          <strong>课代表的小贴士</strong>
          <p>同学无需手动重命名文件。提交后，系统会按学号、姓名和作业名称自动整理。</p>
        </div>
      </div>
    </aside>
  </div>
  <CreateTaskModal
    v-if="createOpen"
    :max-size="data?.storage.maxSizeMb || 50"
    :student-count="data?.students.length || 0"
    @close="createOpen = false"
    @created="created"
  />
  <ShareModal
    v-if="shareTask"
    :title="shareTask.title"
    :token="shareTask.shareToken"
    :app-url="data?.appUrl"
    @close="shareTask = null"
  />
</template>
