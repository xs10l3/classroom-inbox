<script setup lang="ts">
import { Clock3, Check, ArrowRight, LoaderCircle, Link2, ArrowLeft } from 'lucide-vue-next'
import type { FormField } from '../../../shared/types'
import { apiError, formatDate } from '~/utils/format'
const route = useRoute()
const endpoint: string = `/api/fill/${String(route.params.token)}`
const { data, error: loadError } = await useFetch<{
  className: string
  form: {
    title: string
    category: string
    description: string
    originalNotice: string
    dueAt: string
    closed: boolean
    fields: FormField[]
  }
}>(endpoint)
useHead({ title: computed(() => `${data.value?.form.title || '填写表格'} · 课代表`) })
const name = ref(''),
  studentId = ref(''),
  answers = reactive<Record<string, string>>({}),
  error = ref(''),
  busy = ref(false)
const receipt = ref<{ name: string; receipt: string; submittedAt: string } | null>(null)
const closed = computed(
  () =>
    !!data.value?.form.closed || (!!data.value && Date.parse(data.value.form.dueAt) <= Date.now()),
)
async function submit() {
  busy.value = true
  error.value = ''
  try {
    receipt.value = await $fetch<{ name: string; receipt: string; submittedAt: string }>(endpoint, {
      method: 'POST',
      body: { name: name.value, studentId: studentId.value, answers },
    })
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="submit-page">
    <header class="submit-header">
      <AppLogo small /><span>{{ data?.className || '班级事务' }}</span
      ><span class="submit-header-label">班级的每件事，都有着落。</span>
    </header>
    <main class="submit-main">
      <div v-if="loadError" class="submit-card invalid-link">
        <span class="empty-icon"><Link2 :size="30" /></span>
        <h1>这个表单链接暂时无法打开</h1>
        <p>请向课代表确认链接是否完整，或稍后重试。</p>
      </div>
      <template v-else-if="data"
        ><div class="submit-intro">
          <span class="eyebrow">EVERY RESPONSE COUNTS</span
          ><span class="subject-pill">{{ data.form.category }}</span>
          <h1>{{ data.form.title }}</h1>
          <p><Clock3 :size="15" />{{ formatDate(data.form.dueAt, true) }} 截止 · 北京时间</p>
        </div>
        <section v-if="receipt" class="submit-card receipt-card" role="status">
          <span class="receipt-check"><Check :size="35" /></span
          ><span class="eyebrow">SAVED. ALL SET.</span>
          <h2>填写已保存，{{ receipt.name }}！</h2>
          <p>谢谢你的配合，每一份回复都很重要。</p>
          <div class="receipt-info">
            <div>
              <span>提交时间</span><strong>{{ formatDate(receipt.submittedAt, true) }}</strong>
            </div>
            <div>
              <span>提交回执</span
              ><strong class="mono">{{ receipt.receipt.slice(0, 8).toUpperCase() }}</strong>
            </div>
          </div>
          <button v-if="!closed" class="button secondary" @click="receipt = null">
            <ArrowLeft :size="15" />返回修改填写
          </button>
          <p class="small muted">可截图保存回执；重新填写会更新本次结果。</p>
        </section>
        <section v-else class="submit-card">
          <div v-if="closed" class="submit-closed">
            <Clock3 :size="30" />
            <h2>这份表格已经停止填写</h2>
            <p>如需补填，请联系课代表。</p>
          </div>
          <template v-else
            ><div v-if="data.form.description" class="submit-description">
              <span class="label-small">填写说明</span>
              <p class="preserve-lines">{{ data.form.description }}</p>
            </div>
            <OriginalNotice :text="data.form.originalNotice" />
            <form class="form-stack" @submit.prevent="submit">
              <div class="submit-step">
                <span>01</span>
                <h2>确认你的信息</h2>
              </div>
              <div class="form-grid">
                <label
                  >你的姓名<input
                    v-model="name"
                    required
                    maxlength="40"
                    autocomplete="name"
                    placeholder="请输入完整姓名"
                    :disabled="busy" /></label
                ><label
                  >你的学号<input
                    v-model="studentId"
                    required
                    maxlength="32"
                    placeholder="请输入完整学号"
                    :disabled="busy"
                /></label>
              </div>
              <div class="submit-step">
                <span>02</span>
                <h2>填写表格</h2>
              </div>
              <label v-for="field in data.form.fields" :key="field.key"
                >{{ field.label }}<span v-if="field.required" class="required">*</span
                ><textarea
                  v-if="field.type === 'textarea'"
                  v-model="answers[field.key]"
                  :required="field.required"
                  :disabled="busy"
                  maxlength="2000"
                  rows="3" /><select
                  v-else-if="field.type === 'select'"
                  v-model="answers[field.key]"
                  :required="field.required"
                  :disabled="busy"
                >
                  <option value="" disabled>请选择</option>
                  <option v-for="option in field.options" :key="option" :value="option">
                    {{ option }}
                  </option></select
                ><input
                  v-else
                  v-model="answers[field.key]"
                  :type="field.type"
                  :required="field.required"
                  :disabled="busy"
                  maxlength="2000"
                  :step="field.type === 'number' ? 'any' : undefined"
              /></label>
              <p v-if="error" class="form-error" role="alert">{{ error }}</p>
              <button class="button primary submit-homework" :disabled="busy">
                <LoaderCircle v-if="busy" :size="18" class="spin" /><template v-else
                  >确认提交表格<ArrowRight :size="18"
                /></template>
              </button>
              <p class="submit-disclaimer">提交成功后会显示回执；在截止前可重新填写。</p>
            </form></template
          >
        </section>
      </template>
      <footer class="submit-footer"><span>课代表</span>让班级事务，也变得简单。</footer>
    </main>
  </div>
</template>
