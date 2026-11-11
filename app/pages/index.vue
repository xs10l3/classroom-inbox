<script setup lang="ts">
import {
  ArrowUpRight,
  Clock3,
  Files,
  ClipboardList,
  Search,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  CheckCheck,
  ListTodo,
} from 'lucide-vue-next'
import { formatDate } from '~/utils/format'
import type { ClassBoardItem } from '../../shared/types'
const { data, refresh, error, status } = await useFetch('/api/classroom')
useHead({ title: computed(() => `班级待办 · ${data.value?.className || '课代表'}`) })
const filter = ref('all'),
  search = ref(''),
  copied = ref(false),
  showLink = ref(false),
  linkInput = ref<HTMLInputElement>()
const now = ref(Date.now())
const boardLink = computed(() => (import.meta.client ? `${window.location.origin}/` : '/'))
const items = computed(() =>
  (data.value?.items || []).filter((item) => Date.parse(item.dueAt) > now.value),
)
const filtered = computed(() =>
  items.value.filter(
    (item) =>
      (filter.value === 'all' ||
        (filter.value === 'files' ? item.kind === 'files' : item.kind !== 'files')) &&
      `${item.title} ${item.category} ${item.description}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
)
const fileCount = computed(() => items.value.filter((item) => item.kind === 'files').length)
const soonCount = computed(
  () => items.value.filter((item) => Date.parse(item.dueAt) - now.value <= 86400_000).length,
)
function dueLabel(item: ClassBoardItem) {
  const hours = (Date.parse(item.dueAt) - now.value) / 3600_000
  return hours < 1 ? '即将截止' : hours <= 24 ? '24 小时内截止' : '开放办理中'
}
async function copy() {
  try {
    await navigator.clipboard.writeText(boardLink.value)
    copied.value = true
  } catch {
    showLink.value = true
    await nextTick()
    linkInput.value?.select()
  }
}
function clearFilters() {
  filter.value = 'all'
  search.value = ''
}
async function reload() {
  now.value = Date.now()
  await refresh()
}
function onVisible() {
  if (document.visibilityState === 'visible') void reload()
}
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => {
    void reload()
  }, 60000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>
<template>
  <div class="class-board">
    <header class="board-header">
      <div class="board-header-inner">
        <AppLogo small /><span>{{ data?.className || '我们的班级' }}</span
        ><button class="button secondary small" @click="copy">
          <Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{
            copied ? '链接已复制' : '分享待办页'
          }}
        </button>
      </div>
    </header>
    <main class="board-main">
      <section class="board-intro">
        <div>
          <span class="eyebrow">A CLEAR LIST. A CALMER DAY.</span>
          <h1>班级待办<span class="title-dot">.</span></h1>
          <p>要填写的表格，要提交的文件，<br class="mobile-only" />都在这里。</p>
        </div>
        <span class="board-intro-icon" aria-hidden="true"
          ><ListTodo :size="58" :stroke-width="1.1" /><span>✳</span></span
        >
      </section>
      <NuxtLink to="/leave" class="board-leave-entry"
        ><span
          ><strong>请假与个人安排</strong
          ><small>课程 / 晚自习请假 · 补交假条 · 申请调整 · 查询与取消</small></span
        ><ArrowRight :size="22"
      /></NuxtLink>
      <NuxtLink to="/fund" class="board-leave-entry board-fund-entry"
        ><span><strong>班费公示</strong><small>查看班费收支与余额，了解每一笔班费去向</small></span
        ><ArrowRight :size="22"
      /></NuxtLink>
      <div v-if="showLink" class="board-link-input">
        <label
          >班级待办链接<input
            ref="linkInput"
            :value="boardLink"
            readonly
            @click="linkInput?.select()"
        /></label>
      </div>
      <section class="board-summary">
        <div>
          <strong>{{ items.length }}</strong
          ><span>项开放待办</span>
        </div>
        <div>
          <strong>{{ items.length - fileCount }}</strong
          ><span>份表格待填写</span>
        </div>
        <div>
          <strong>{{ fileCount }}</strong
          ><span>项文件待提交</span>
        </div>
        <div class="board-soon">
          <Clock3 :size="17" /><span>{{
            soonCount ? `${soonCount} 项将在 24 小时内截止` : '按截止时间排序，记得提前完成'
          }}</span>
        </div>
      </section>
      <div class="board-toolbar">
        <div class="filter-tabs">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
            全部待办 <span>{{ items.length }}</span></button
          ><button :class="{ active: filter === 'form' }" @click="filter = 'form'">填写表格</button
          ><button :class="{ active: filter === 'files' }" @click="filter = 'files'">
            提交文件
          </button>
        </div>
        <div class="inline-actions">
          <label class="search-box"
            ><Search :size="16" /><input
              v-model="search"
              placeholder="搜索待办或课程"
              aria-label="搜索班级待办" /></label
          ><button
            class="icon-button"
            :disabled="status === 'pending'"
            aria-label="刷新待办"
            @click="reload"
          >
            <RefreshCw :size="17" :class="{ spin: status === 'pending' }" />
          </button>
        </div>
      </div>
      <div v-if="error" class="error-banner">
        待办暂时未能加载。<button class="text-link" @click="reload">重新加载</button>
      </div>
      <section v-else-if="filtered.length" class="board-grid" aria-label="当前开放的班级待办">
        <article v-for="item in filtered" :key="item.key" class="board-card">
          <div class="board-card-top">
            <span class="subject-icon" :class="item.kind === 'files' ? 'blue' : 'sage'"
              ><Files v-if="item.kind === 'files'" :size="23" :stroke-width="1.5" /><ClipboardList
                v-else
                :size="23"
                :stroke-width="1.5" /></span
            ><span
              class="badge"
              :class="{ 'board-urgent': Date.parse(item.dueAt) - now <= 86400_000 }"
              >{{ dueLabel(item) }}</span
            >
          </div>
          <span class="subject-label">{{ item.category }}</span>
          <h2>{{ item.title }}</h2>
          <p class="board-description">
            {{
              item.description ||
              (item.kind === 'files'
                ? '准备好文件，点击下方入口提交。'
                : '点击下方入口，按要求填写表格。')
            }}
          </p>
          <OriginalNotice :text="item.originalNotice" />
          <div class="board-deadline">
            <Clock3 :size="14" /><span
              >{{ formatDate(item.dueAt, true) }} 截止<small>北京时间</small></span
            >
          </div>
          <a
            :href="item.url"
            :target="item.kind === 'link' ? '_blank' : undefined"
            :rel="item.kind === 'link' ? 'noopener noreferrer' : undefined"
            class="button board-action"
            :aria-label="`${item.kind === 'files' ? '提交文件' : '填写表格'}：${item.title}`"
            ><span>{{
              item.kind === 'files'
                ? '去提交文件'
                : item.kind === 'link'
                  ? '打开外部表格'
                  : '去填写表格'
            }}</span
            ><ExternalLink v-if="item.kind === 'link'" :size="16" /><ArrowRight
              v-else
              :size="17" /></a
          ><small v-if="item.kind === 'link'" class="board-external-note"
            >将在新窗口打开原表格，请在原页面完成填写。</small
          >
        </article>
      </section>
      <section v-else class="board-empty">
        <span class="empty-icon"><CheckCheck :size="34" :stroke-width="1.4" /></span>
        <h2>{{ items.length ? '没有找到相关待办' : '现在没有开放的待办' }}</h2>
        <p>
          {{
            items.length
              ? '换个关键词，或查看全部待办。'
              : '新的表格和文件收集发布后，会出现在这里。'
          }}
        </p>
        <button v-if="items.length" class="button secondary" @click="clearFilters">
          查看全部待办
        </button>
      </section>
      <div class="board-note">
        <CheckCheck :size="19" />
        <p>
          这里展示班级当前开放的全部待办。完成提交后，请保存回执；外部表格按原平台的提示确认。<span
            >页面每分钟更新一次，已截止或停止办理的事项会自动移出。</span
          >
        </p>
      </div>
      <footer class="board-footer">
        <span>课代表 · 班级的每件事，都有着落。</span
        ><NuxtLink to="/login">管理员入口<ArrowUpRight :size="13" /></NuxtLink>
      </footer>
    </main>
  </div>
</template>
