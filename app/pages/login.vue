<script setup lang="ts">
import { ArrowRight, LockKeyhole, LoaderCircle, NotebookPen, Check } from 'lucide-vue-next'
import { apiError } from '~/utils/format'
useHead({ title: '管理员登录 · 课代表' })
const password = ref(''),
  error = ref(''),
  loading = ref(false)
const session = await useRequestFetch()<{ authenticated: boolean }>('/api/auth/session').catch(
  () => ({ authenticated: false }),
)
if (session.authenticated) await navigateTo('/admin')
async function login() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    await navigateTo('/admin')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="login-page">
    <section class="login-story">
      <AppLogo />
      <div class="login-story-main">
        <span class="eyebrow light">A LITTLE LESS CHAOS. A LOT MORE CALM.</span>
        <h1>班级作业，<br />一处收齐<span>。</span></h1>
        <p>告别翻不完的聊天记录。<br />把收集、整理和归档，交给课代表。</p>
        <div class="login-checks">
          <span><Check :size="15" />一键发布</span><span><Check :size="15" />自动核对</span
          ><span><Check :size="15" />云端归档</span>
        </div>
      </div>
      <div class="login-paper">
        <NotebookPen :size="42" :stroke-width="1.1" />
        <div><span /><span /><span /></div>
        <i><Check :size="24" /></i>
      </div>
      <span class="login-caption">每一份认真，都被好好收下。</span>
    </section>
    <section class="login-form-section">
      <form class="login-form" @submit.prevent="login">
        <span class="login-lock"><LockKeyhole :size="24" :stroke-width="1.5" /></span
        ><span class="eyebrow">WELCOME BACK</span>
        <h2>欢迎回到班级工作台</h2>
        <p>输入管理密码，开始今天的收集。</p>
        <label
          >管理密码<input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="请输入管理员密码"
        /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="button primary login-submit" :disabled="loading">
          <LoaderCircle v-if="loading" :size="18" class="spin" /><template v-else
            >进入工作台<ArrowRight :size="18"
          /></template>
        </button>
        <p class="login-help">学生无需登录，请使用课代表分享的作业链接提交。</p>
      </form>
      <span class="login-form-footer">有条不紊，从这里开始。</span>
    </section>
  </div>
</template>
