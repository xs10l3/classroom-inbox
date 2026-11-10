<script setup lang="ts">
import {
  FolderArchive,
  Download,
  Search,
  FileText,
  ArrowUpRight,
  HardDrive,
  Files,
} from 'lucide-vue-next'
import { formatDate, formatSize } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '文件归档 · 课代表' })
const { data } = await useClassroom()
const search = ref('')
const tasks = computed(
  () => data.value?.tasks.filter((t) => `${t.title}${t.subject}`.includes(search.value)) || [],
)
const fileCount = computed(() => data.value?.tasks.reduce((n, t) => n + t.fileCount, 0) || 0)
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">A PLACE FOR EVERY FILE</span>
      <h1>文件归档<span class="title-dot">.</span></h1>
      <p>按作业整理，按同学归档。需要时，每一份都找得到。</p>
    </div>
  </section>
  <div class="archive-stats">
    <div>
      <span class="stat-icon sage"><FolderArchive :size="21" /></span>
      <div>
        <span>作业文件夹</span><strong>{{ data?.tasks.length || 0 }}<small>个</small></strong>
      </div>
    </div>
    <div>
      <span class="stat-icon blue"><Files :size="21" /></span>
      <div>
        <span>当前有效文件</span><strong>{{ fileCount }}<small>份</small></strong>
      </div>
    </div>
    <div>
      <span class="stat-icon peach"><HardDrive :size="21" /></span>
      <div>
        <span>累计存储用量 · 含历史版本</span
        ><strong class="size-value">{{ formatSize(data?.totalSize || 0) }}</strong>
      </div>
    </div>
  </div>
  <section class="content-panel">
    <div class="panel-toolbar">
      <h2>全部作业归档</h2>
      <label class="search-box"
        ><Search :size="16" /><input
          v-model="search"
          placeholder="搜索作业或课程"
          aria-label="搜索作业或课程"
      /></label>
    </div>
    <div v-if="tasks.length" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>作业名称</th>
            <th>课程</th>
            <th>收集进度</th>
            <th>截止时间</th>
            <th>下载归档</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id">
            <td>
              <NuxtLink :to="`/tasks/${task.id}`" class="archive-name"
                ><span class="folder-icon"><FolderArchive :size="22" :stroke-width="1.5" /></span>
                <div>
                  <strong>{{ task.title }}</strong
                  ><small>{{ task.fileCount }} 个有效文件</small>
                </div></NuxtLink
              >
            </td>
            <td class="muted">{{ task.subject }}</td>
            <td>
              {{ task.submittedCount }} <span class="muted">/ {{ task.totalStudents }} 人</span>
            </td>
            <td class="muted small">{{ formatDate(task.dueAt, true) }}</td>
            <td>
              <div class="toolbar-actions">
                <a
                  v-if="task.fileCount"
                  :href="`/api/tasks/${task.id}/archive`"
                  class="button secondary small-button"
                  ><Download :size="14" />ZIP 打包</a
                ><span v-else class="muted small">等待第一份提交</span
                ><a
                  :href="`/api/tasks/${task.id}/export`"
                  class="icon-button"
                  title="导出提交统计"
                  aria-label="导出提交统计"
                  ><FileText :size="17" /></a
                ><NuxtLink
                  :to="`/tasks/${task.id}`"
                  class="icon-button"
                  title="查看作业"
                  aria-label="查看作业"
                  ><ArrowUpRight :size="17"
                /></NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="large-empty">
      <span class="empty-icon"><FolderArchive :size="32" :stroke-width="1.3" /></span>
      <h3>{{ search ? '没有找到相关归档' : '好好收下，也好好归档' }}</h3>
      <p>作业发布后会出现在这里，收到文件即可一键打包下载。</p>
      <NuxtLink to="/admin" class="button secondary"
        >前往作业总览<ArrowUpRight :size="16"
      /></NuxtLink>
    </div>
  </section>
  <p class="page-note">
    <FolderArchive :size="15" />ZIP
    内按学号和姓名分文件夹，并附提交情况表；仅打包每位同学最近一次提交的文件。
  </p>
</template>
