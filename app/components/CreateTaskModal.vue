<script setup lang="ts">
import { ArrowUpRight, LoaderCircle } from 'lucide-vue-next'
import { apiError, inputToIso, localDateInput } from '~/utils/format'
const props = defineProps<{ maxSize: number; studentCount: number }>()
const emit = defineEmits<{ close: []; created: [] }>()
const { notify } = useNotice()
const form = reactive({
  title: '',
  subject: '',
  description: '',
  originalNotice: '',
  dueAt: localDateInput(new Date(Date.now() + 3 * 86400_000)),
  extensions: 'pdf, doc, docx, zip',
  maxSizeMb: Math.min(20, props.maxSize),
})
const loading = ref(false)
const error = ref('')
async function submit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/tasks', {
      method: 'POST',
      body: {
        ...form,
        dueAt: inputToIso(form.dueAt),
        extensions: form.extensions
          .split(/[,，、\s]+/)
          .map((s) => s.replace(/^\./, '').toLowerCase())
          .filter(Boolean),
      },
    })
    notify('作业已发布，复制收集链接发给同学吧')
    emit('created')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <AppModal
    title="发布一份新作业"
    :subtitle="`将向当前名单中的 ${studentCount} 位同学收集作业`"
    @close="emit('close')"
  >
    <form class="form-stack" @submit.prevent="submit">
      <label
        >作业名称<span class="required">*</span
        ><input
          v-model="form.title"
          required
          maxlength="80"
          placeholder="例如：第一章课后习题"
          autofocus
      /></label>
      <div class="form-grid">
        <label
          >课程名称<span class="required">*</span
          ><input
            v-model="form.subject"
            required
            maxlength="30"
            placeholder="例如：高等数学" /></label
        ><label
          >截止时间 · 北京时间<span class="required">*</span
          ><input v-model="form.dueAt" type="datetime-local" required
        /></label>
      </div>
      <label
        >作业说明<textarea
          v-model="form.description"
          rows="3"
          maxlength="3000"
          placeholder="写下作业内容、提交要求，或需要提醒同学的事…"
        />
      </label>
      <label
        >原始通知<span class="required">*</span
        ><textarea
          v-model="form.originalNotice"
          required
          maxlength="20000"
          rows="4"
          placeholder="粘贴老师或班群的完整原文，保留时间、地点和提交要求。"
        /><span class="field-hint">原文会随作业保存，同学可在提交页查看。</span></label
      >
      <div class="form-grid">
        <label
          >允许的文件格式<input
            v-model="form.extensions"
            required
            placeholder="pdf, docx, zip"
          /><span class="field-hint">多种格式用逗号分隔</span></label
        ><label
          >单文件大小上限（MB）<input
            v-model.number="form.maxSizeMb"
            type="number"
            min="1"
            :max="maxSize"
            required
          /><span class="field-hint">每次最多 5 个文件，合计不超过 100 MB</span></label
        >
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="modal-footer">
        <button type="button" class="button secondary" :disabled="loading" @click="emit('close')">
          取消</button
        ><button class="button primary" :disabled="loading">
          <LoaderCircle v-if="loading" :size="17" class="spin" /><ArrowUpRight
            v-else
            :size="17"
          />{{ loading ? '正在发布' : '发布作业' }}
        </button>
      </div>
    </form>
  </AppModal>
</template>
