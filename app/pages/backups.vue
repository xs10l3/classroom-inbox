<script setup lang="ts">
import { DatabaseBackup, Download, LoaderCircle, RefreshCw } from 'lucide-vue-next'
import { apiError, formatDate, formatSize } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '数据库备份 · 课代表' })
const {
  data,
  status,
  error: loadError,
  refresh,
} = await useFetch('/api/admin/backups', { key: 'database-backups' })
const busy = ref(false),
  error = ref('')
const { notify } = useNotice()
async function createBackup() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/backups', { method: 'POST', retry: 0 })
    await refresh()
    notify('备份已创建并通过完整性校验，可下载保存')
  } catch (e) {
    error.value = apiError(e)
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">KEEP A COPY, KEEP PEACE OF MIND</span>
      <h1>数据库备份<span class="title-dot">.</span></h1>
      <p>在线创建完整的业务数据快照，下载后妥善保存。</p>
    </div>
    <button class="button primary" :disabled="busy" @click="createBackup">
      <LoaderCircle v-if="busy" :size="17" class="spin" /><DatabaseBackup v-else :size="17" />{{
        busy ? '正在备份与校验…' : '创建数据库备份'
      }}
    </button>
  </section>
  <section class="content-panel leave-panel backup-scope">
    <h2>备份包含什么</h2>
    <p>
      包含班级名单、作业与事务、表单填写、提交记录、请假记录、晚自习设置及个人调整，以及附件索引。创建备份时可以继续使用系统。
    </p>
    <p>
      作业和假条的文件保存在华为云 OBS，.env 配置保存在服务器上，需要另外备份。这里下载的 SQLite
      文件包含业务记录和附件索引。
    </p>
    <p class="leave-help">
      备份保存在服务器的数据目录中；Docker
      部署时保存在数据卷内。建议下载到本地，保留服务器之外的副本。备份仅管理员可查看和下载。
    </p>
  </section>
  <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
  <section class="content-panel leave-panel">
    <div class="backup-list-heading">
      <div>
        <h2>已有备份</h2>
        <p class="leave-help">
          共 {{ data?.backups.length || 0 }} 份 · {{ formatSize(data?.totalBytes || 0) }} ·
          创建时自动校验完整性
        </p>
      </div>
      <button
        class="icon-button"
        aria-label="刷新备份列表"
        :disabled="status === 'pending' || busy"
        @click="refresh()"
      >
        <RefreshCw :size="18" :class="{ spin: status === 'pending' }" />
      </button>
    </div>
    <p v-if="loadError" class="form-error" role="alert">备份列表加载失败，请点击刷新重试。</p>
    <div v-if="data?.backups.length" class="table-scroll">
      <table class="leave-table backup-table">
        <thead>
          <tr>
            <th>备份文件 / 创建时间</th>
            <th>大小</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="backup in data.backups" :key="backup.name">
            <td>
              <strong class="backup-file-name">{{ backup.name }}</strong
              ><small>{{ formatDate(backup.createdAt, true) }}</small>
            </td>
            <td>{{ formatSize(backup.size) }}</td>
            <td>
              <a class="button secondary small" :href="`/api/admin/backups/${backup.name}`" download
                ><Download :size="15" />下载备份</a
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="!loadError && status !== 'pending'" class="backup-empty">
      <DatabaseBackup :size="32" />
      <h3>还没有数据库备份</h3>
      <p>点击“创建数据库备份”，生成第一份完整快照。</p>
    </div>
    <p v-else-if="status === 'pending'" class="leave-help" role="status">正在读取备份列表…</p>
  </section>
</template>
