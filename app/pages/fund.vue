<script setup lang="ts">
import { ArrowLeft, ExternalLink } from 'lucide-vue-next'

const dashboardUrl =
  'https://hcn33zrupqsl.feishu.cn/share/base/dashboard/shrcnOZyqSNnl74i6XEOnPw7ygd'

useHead({ title: '班费公示 · 课代表' })
</script>

<template>
  <div class="leave-public fund-public">
    <header class="submit-header">
      <AppLogo small /><span>班费公示</span
      ><NuxtLink to="/" class="text-link"><ArrowLeft :size="16" />班级待办</NuxtLink>
    </header>
    <main class="fund-workspace">
      <section class="leave-heading fund-heading">
        <div>
          <span class="eyebrow">收支透明 · 随时查阅</span>
          <h1>班费公示<span class="title-dot">.</span></h1>
          <p>查看班费收支与余额，了解每一笔班费去向。</p>
        </div>
        <a :href="dashboardUrl" target="_blank" rel="noopener noreferrer" class="button secondary">
          <ExternalLink :size="16" />在飞书中打开
        </a>
      </section>
      <p class="fund-help">下方展示飞书公示看板。如未能正常显示，可点击“在飞书中打开”查看。</p>
      <iframe class="fund-dashboard" :src="dashboardUrl" title="班费收支公示看板" />
    </main>
  </div>
</template>

<style scoped>
.fund-public .submit-header {
  max-width: 1280px;
}
.fund-workspace {
  max-width: 1280px;
  margin: auto;
  padding: 44px 24px 70px;
}
.fund-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
.fund-heading .button {
  flex-shrink: 0;
}
.fund-help {
  margin: 0 0 16px;
  color: #69755e;
  font-size: 13px;
  line-height: 1.9;
}
.fund-dashboard {
  display: block;
  width: 100%;
  height: 75vh;
  min-height: 560px;
  border: 1px solid #d9e2ec;
  border-radius: 14px;
  background: #fff;
}
@media (max-width: 600px) {
  .fund-workspace {
    padding: 28px 16px 48px;
  }
  .fund-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }
  .fund-dashboard {
    height: 75svh;
  }
}
</style>
