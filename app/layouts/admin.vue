<script setup lang="ts">
import {
  LayoutDashboard,
  ClipboardList,
  UsersRound,
  FolderArchive,
  Settings2,
  ChevronRight,
  LogOut,
  ArrowUpRight,
  Cloud,
  Menu,
  X,
  RefreshCw,
} from 'lucide-vue-next'
import { apiError } from '~/utils/format'
const route = useRoute()
const { data, refresh } = await useClassroom()
const { notify } = useNotice()
const mobileOpen = ref(false)
const refreshing = ref(false)
const nav = [
  { path: '/admin', label: '作业总览', icon: LayoutDashboard },
  { path: '/affairs', label: '班级事务', icon: ClipboardList },
  { path: '/students', label: '班级名单', icon: UsersRound },
  { path: '/archives', label: '文件归档', icon: FolderArchive },
  { path: '/settings', label: '存储设置', icon: Settings2 },
]
const current = computed(
  () =>
    nav.find((n) => n.path === route.path)?.label ||
    (route.path.startsWith('/affairs/') ? '事务详情' : '作业详情'),
)
const today = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())
watch(
  () => route.path,
  () => {
    mobileOpen.value = false
  },
)
async function reload() {
  refreshing.value = true
  await Promise.all([refresh(), refreshNuxtData('classroom-affairs')])
  refreshing.value = false
}
async function logout() {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    clearNuxtData('classroom-dashboard')
    await navigateTo('/login')
  } catch (e) {
    notify(apiError(e), true)
  }
}
</script>
<template>
  <div class="app-shell">
    <div v-if="mobileOpen" class="sidebar-scrim" @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <div class="sidebar-brand">
        <AppLogo /><button
          class="icon-button mobile-only"
          aria-label="关闭导航"
          @click="mobileOpen = false"
        >
          <X :size="20" />
        </button>
      </div>
      <div class="class-switch">
        <span class="class-avatar">班</span>
        <div>
          <strong>{{ data?.className || '我们的班级' }}</strong
          ><small>班级作业管理空间</small>
        </div>
        <ChevronRight :size="16" />
      </div>
      <span class="nav-label">工作空间 <span>WORKSPACE</span></span>
      <nav class="sidebar-nav">
        <NuxtLink
          v-for="item in nav"
          :key="item.path"
          :to="item.path"
          :class="{
            active:
              route.path === item.path ||
              (item.path === '/admin' && route.path.startsWith('/tasks/')) ||
              (item.path === '/affairs' && route.path.startsWith('/affairs/')),
          }"
          ><component :is="item.icon" :size="19" :stroke-width="1.7" /><span>{{ item.label }}</span
          ><span v-if="item.path === '/students' && data?.students.length" class="nav-count">{{
            data.students.length
          }}</span></NuxtLink
        >
        <NuxtLink to="/" target="_blank" class="student-portal-nav"
          ><UsersRound :size="19" :stroke-width="1.7" /><span>学生待办页</span
          ><ArrowUpRight :size="14"
        /></NuxtLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-tip">
          <div class="tip-spark">✳</div>
          <strong>把琐事交给课代表。</strong>
          <p>从第一份提交，到最后一份归档，<br />每一份认真，都值得被收好。</p>
        </div>
        <NuxtLink to="/settings" class="storage-mini"
          ><Cloud :size="18" /><span>华为云 OBS</span
          ><span class="status-dot" :class="{ amber: !data?.storage.configured }" /><small>{{
            data?.storage.configured ? '已配置' : '待配置'
          }}</small></NuxtLink
        >
        <div class="profile-row">
          <span class="profile-avatar">管</span>
          <div><strong>班级管理员</strong><small>让收作业轻松一点</small></div>
          <button class="icon-button" title="退出登录" aria-label="退出登录" @click="logout">
            <LogOut :size="17" />
          </button>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumbs">
          <button class="icon-button mobile-only" aria-label="打开导航" @click="mobileOpen = true">
            <Menu :size="22" /></button
          ><span>工作台</span><ChevronRight :size="14" /><strong>{{ current }}</strong>
        </div>
        <div class="topbar-right">
          <time>{{ today }}</time
          ><span class="top-divider" /><button
            class="icon-button"
            aria-label="刷新数据"
            title="刷新数据"
            @click="reload"
          >
            <RefreshCw :size="17" :class="{ spin: refreshing }" /></button
          ><span class="admin-badge">管理员 <ArrowUpRight :size="12" /></span>
        </div>
      </header>
      <main id="main-content" class="main-content"><slot /></main>
      <footer class="app-footer">
        <span>课代表 <span class="footer-dot">·</span> 让每一份作业都有着落</span
        ><span>少一点催交，多一点从容。</span>
      </footer>
    </div>
  </div>
</template>
