<script setup lang="ts">
import {
  Cloud,
  ShieldCheck,
  CheckCircle2,
  CircleAlert,
  ArrowUpRight,
  LoaderCircle,
  Cable,
  LockKeyhole,
  FolderTree,
  Server,
  Check,
} from 'lucide-vue-next'
import { apiError } from '~/utils/format'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: '存储设置 · 课代表' })
const { data } = await useClassroom()
const loading = ref(false),
  checked = ref(false),
  error = ref('')
async function check() {
  loading.value = true
  error.value = ''
  checked.value = false
  try {
    await $fetch('/api/storage/check', { method: 'POST' })
    checked.value = true
  } catch (e) {
    error.value = apiError(e)
  } finally {
    loading.value = false
  }
}
const envLines =
  'OBS_ENDPOINT=https://obs.cn-east-3.myhuaweicloud.com\nOBS_REGION=cn-east-3\nOBS_BUCKET=你的桶名称\nOBS_ACCESS_KEY_ID=你的访问密钥\nOBS_SECRET_ACCESS_KEY=你的私有密钥'
</script>
<template>
  <section class="page-title-row">
    <div>
      <span class="eyebrow">SAFELY COLLECTED, CAREFULLY KEPT</span>
      <h1>存储设置<span class="title-dot">.</span></h1>
      <p>作业存入华为云 OBS，班级记录保存在服务器。</p>
    </div>
  </section>
  <div class="settings-columns">
    <section class="content-panel storage-card">
      <div class="storage-card-heading">
        <span class="cloud-large"><Cloud :size="33" :stroke-width="1.3" /></span>
        <div>
          <h2>华为云 OBS</h2>
          <p>Object Storage Service</p>
        </div>
        <span class="badge" :class="{ neutral: !data?.storage.configured }"
          ><span />{{ data?.storage.configured ? '凭证已配置' : '等待配置' }}</span
        >
      </div>
      <div class="settings-rows">
        <div>
          <span><ShieldCheck :size="17" />访问方式</span><strong>服务端鉴权 · 私有文件</strong>
        </div>
        <div>
          <span><LockKeyhole :size="17" />密钥管理</span><strong>仅服务端环境变量</strong>
        </div>
        <div>
          <span><FolderTree :size="17" />文件整理</span><strong>作业 / 学号 / 提交批次</strong>
        </div>
        <div>
          <span><Server :size="17" />单文件大小上限</span
          ><strong>{{ data?.storage.maxSizeMb || 50 }} MB</strong>
        </div>
      </div>
      <div class="storage-test">
        <div>
          <h3>检查存储连接</h3>
          <p>连接测试会检查服务器能否访问指定存储桶。</p>
        </div>
        <button
          class="button secondary"
          :disabled="loading || !data?.storage.configured"
          @click="check"
        >
          <LoaderCircle v-if="loading" :size="16" class="spin" /><Cable v-else :size="16" />{{
            loading ? '正在检查' : '测试连接'
          }}
        </button>
      </div>
      <p v-if="checked" class="connection-result success">
        <CheckCircle2 :size="17" />连接成功，存储桶可以访问。
      </p>
      <p v-if="error" class="connection-result failure" role="alert">
        <CircleAlert :size="17" />{{ error }}
      </p>
      <p v-if="!data?.storage.configured" class="connection-result info">
        <CircleAlert :size="17" />请完成右侧配置并重启应用，再测试连接。
      </p>
    </section>
    <aside class="content-panel config-guide">
      <span class="label-small">管理员配置指南</span>
      <h2>在服务器填写环境变量</h2>
      <p>在项目根目录的 <code>.env</code> 中填写以下配置；区域与 Endpoint 需和存储桶一致。</p>
      <pre>{{ envLines }}</pre>
      <p>存储桶设置为私有，IAM 账号需具备该桶的读、写、删除与桶检查权限。更新配置后重启应用。</p>
      <a
        href="https://support.huaweicloud.com/obs/index.html"
        target="_blank"
        rel="noopener noreferrer"
        class="text-link"
        >查看华为云 OBS 文档<ArrowUpRight :size="15"
      /></a>
    </aside>
  </div>
  <div class="settings-note">
    <ShieldCheck :size="22" :stroke-width="1.5" />
    <div>
      <strong>每一份作业，都有自己的位置。</strong>
      <p>
        学生通过作业链接上传；管理员登录后查看名单、下载文件和导出统计。OBS 密钥不会发送到浏览器。
      </p>
    </div>
    <Check :size="19" />
  </div>
</template>
