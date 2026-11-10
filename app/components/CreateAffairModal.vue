<script setup lang="ts">
import { Plus, Trash2, LoaderCircle } from 'lucide-vue-next'
import type { FormField, Task } from '../../shared/types'
import { apiError, inputToIso, localDateInput } from '~/utils/format'
const props = defineProps<{ maxSize: number; tasks: Task[] }>()
const emit = defineEmits<{ close: []; created: [] }>()
const { notify } = useNotice()
const form = reactive({
  title: '',
  category: '班级事务',
  description: '',
  originalNotice: '',
  mode: 'form',
  dueAt: localDateInput(new Date(Date.now() + 3 * 86400_000)),
  url: '',
  taskId: '',
  extensions: 'pdf, docx, zip',
  maxSizeMb: Math.min(20, props.maxSize),
})
const fields = ref<(FormField & { optionsText: string })[]>([])
let keyNumber = 0
function addField() {
  fields.value.push({
    key: `field_${++keyNumber}`,
    label: '',
    type: 'text',
    required: true,
    options: [],
    optionsText: '',
  })
}
addField()
const busy = ref(false),
  error = ref('')
async function submit() {
  busy.value = true
  error.value = ''
  try {
    const input: Record<string, unknown> = {
      title: form.title,
      category: form.category,
      description: form.description,
      original_notice: form.originalNotice,
      mode: form.mode,
      due_at: inputToIso(form.dueAt),
    }
    if (form.mode === 'link') input.url = form.url
    if (form.mode === 'form')
      input.fields = fields.value.map(({ optionsText, ...field }) => ({
        ...field,
        options:
          field.type === 'select'
            ? optionsText
                .split(/[\n,，]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      }))
    if (form.mode === 'files') {
      if (form.taskId) input.task_id = form.taskId
      else
        input.collection = {
          extensions: form.extensions
            .split(/[,，、\s]+/)
            .map((s) => s.replace(/^\./, '').toLowerCase())
            .filter(Boolean),
          max_size_mb: form.maxSizeMb,
        }
    }
    await $fetch('/api/affairs', { method: 'POST', body: [input] })
    notify('班级事务已发布')
    emit('created')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <AppModal title="新增班级事务" subtitle="为同学准备一个清楚的办理入口。" @close="emit('close')">
    <form class="form-stack" @submit.prevent="submit">
      <label
        >事务名称<input
          v-model="form.title"
          required
          maxlength="80"
          placeholder="例如：班级活动报名"
      /></label>
      <div class="form-grid">
        <label>分类<input v-model="form.category" required maxlength="30" /></label
        ><label
          >截止时间 · 北京时间<input v-model="form.dueAt" type="datetime-local" required
        /></label>
      </div>
      <label
        >事务说明<textarea
          v-model="form.description"
          rows="2"
          maxlength="3000"
          placeholder="填写要求、注意事项…"
        />
      </label>
      <label
        >原始通知<span class="required">*</span
        ><textarea
          v-model="form.originalNotice"
          required
          maxlength="20000"
          rows="4"
          placeholder="粘贴完整原文，系统将原样保存。"
        /><span class="field-hint">同学可在班级待办页和内置办理页面展开原文。</span></label
      >
      <label
        >办理方式<select v-model="form.mode">
          <option value="form">内置表单 · 统计填写结果</option>
          <option value="link">外部链接 · 跳转已有表格</option>
          <option value="files">文件收集 · 连接收作业流程</option>
        </select></label
      >
      <template v-if="form.mode === 'form'">
        <div class="section-heading">
          <strong>表单字段</strong
          ><button
            type="button"
            class="text-link"
            :disabled="fields.length >= 20"
            @click="addField"
          >
            <Plus :size="15" />添加字段
          </button>
        </div>
        <p class="field-hint">姓名与学号由系统收集，无需重复添加。</p>
        <div v-for="(field, i) in fields" :key="field.key" class="field-builder">
          <div class="field-builder-heading">
            <strong>字段 {{ i + 1 }}</strong
            ><button
              type="button"
              class="icon-button"
              :aria-label="`删除字段 ${i + 1}`"
              :disabled="fields.length === 1"
              @click="fields.splice(i, 1)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
          <div class="form-grid">
            <label
              >字段名称<input
                v-model="field.label"
                required
                maxlength="80"
                placeholder="例如：是否参加" /></label
            ><label
              >填写类型<select v-model="field.type">
                <option value="text">短文本</option>
                <option value="textarea">长文本</option>
                <option value="number">数字</option>
                <option value="select">单选</option>
                <option value="date">日期</option>
              </select></label
            >
          </div>
          <label v-if="field.type === 'select'"
            >选项<input v-model="field.optionsText" required placeholder="参加，不参加" /><span
              class="field-hint"
              >用逗号分隔，至少两个选项</span
            ></label
          >
          <label class="check-label"><input v-model="field.required" type="checkbox" />必填</label>
        </div>
      </template>
      <label v-if="form.mode === 'link'"
        >外部表格链接<input v-model="form.url" type="url" required placeholder="https://…" /><span
          class="field-hint"
          >使用 HTTPS 链接，完成情况由管理员手动标记。</span
        ></label
      >
      <template v-if="form.mode === 'files'">
        <label
          >关联收集任务<select v-model="form.taskId">
            <option value="">同时创建一个新收集任务</option>
            <option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
          </select></label
        >
        <p v-if="form.taskId" class="field-hint">截止时间、名单、提交进度与所选作业保持一致。</p>
        <div v-else class="form-grid">
          <label
            >允许格式<input
              v-model="form.extensions"
              required
              placeholder="pdf, docx, zip" /></label
          ><label
            >单文件上限（MB）<input
              v-model.number="form.maxSizeMb"
              type="number"
              min="1"
              :max="maxSize"
              required
          /></label>
        </div>
      </template>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="modal-footer">
        <button type="button" class="button secondary" :disabled="busy" @click="emit('close')">
          取消</button
        ><button class="button primary" :disabled="busy">
          <LoaderCircle v-if="busy" :size="16" class="spin" />发布事务
        </button>
      </div>
    </form>
  </AppModal>
</template>
