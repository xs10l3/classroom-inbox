<script setup lang="ts">
import { Copy, Check, Upload, ArrowRight, LoaderCircle, Code2 } from 'lucide-vue-next'
import { affairExample, affairPrompt } from '#shared/affair-template'
import { apiError } from '~/utils/format'
const props = defineProps<{ maxSize: number }>()
const emit = defineEmits<{ close: []; created: [] }>()
const source = ref(''),
  error = ref(''),
  busy = ref(false),
  copied = ref(false),
  showPrompt = ref(false)
const preview = ref<
  | {
      title: string
      category: string
      mode: string
      due_at: string
      fields: unknown[]
      original_notice: string
      task_id: string
    }[]
  | null
>(null)
const fileInput = ref<HTMLInputElement>(),
  promptInput = ref<HTMLTextAreaElement>()
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
const prompt = computed(() => affairPrompt(today, props.maxSize))
const { notify } = useNotice()
watch(source, () => {
  preview.value = null
  error.value = ''
})
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    copied.value = true
    notify('整理提示词已复制，粘贴到 AI 对话中使用')
  } catch {
    showPrompt.value = true
    await nextTick()
    promptInput.value?.select()
  }
}
async function loadFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 512 * 1024) {
    error.value = 'JSON 文件不能超过 512 KB'
    return
  }
  source.value = await file.text()
  if (fileInput.value) fileInput.value.value = ''
}
async function check() {
  busy.value = true
  error.value = ''
  try {
    let parsed
    try {
      parsed = JSON.parse(source.value.replace(/^\uFEFF/, ''))
    } catch {
      throw new Error('JSON 格式不正确，请检查逗号、引号和数组括号')
    }
    const result = await $fetch('/api/affairs/preview', { method: 'POST', body: parsed })
    preview.value = result.affairs
  } catch (e) {
    error.value = e instanceof Error && !('data' in e) ? e.message : apiError(e)
  } finally {
    busy.value = false
  }
}
async function save() {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch('/api/affairs', {
      method: 'POST',
      body: JSON.parse(source.value.replace(/^\uFEFF/, '')),
    })
    notify(`已导入 ${result.affairs.length} 条班级事务`)
    emit('created')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <AppModal
    title="通过 JSON 导入事务"
    subtitle="粘贴内容或上传文件，预览确认后批量发布。每次最多 50 条。"
    @close="emit('close')"
  >
    <div class="form-stack affairs-import">
      <div class="prompt-callout">
        <Code2 :size="22" />
        <div>
          <strong>把通知交给 AI 整理</strong>
          <p>复制提示词，补上通知内容，再把生成的 JSON 粘贴回来。</p>
        </div>
        <button class="button secondary" @click="copyPrompt">
          <Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{
            copied ? '已复制提示词' : '复制提示词'
          }}
        </button>
      </div>
      <button class="text-link" @click="showPrompt = !showPrompt">
        {{ showPrompt ? '收起提示词' : '查看完整提示词' }}
      </button>
      <textarea
        v-if="showPrompt"
        ref="promptInput"
        class="json-editor"
        :value="prompt"
        readonly
        rows="10"
        aria-label="事务整理提示词"
      />
      <div class="inline-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="sr-only"
          aria-label="上传事务 JSON"
          @change="loadFile"
        />
        <button class="button secondary small" @click="fileInput?.click()">
          <Upload :size="15" />选择 JSON 文件
        </button>
        <button
          class="text-link"
          @click="
            source = JSON.stringify(
              affairExample.map((a) =>
                a.mode === 'files'
                  ? { ...a, collection: { ...a.collection, max_size_mb: Math.min(20, maxSize) } }
                  : a,
              ),
              null,
              2,
            )
          "
        >
          填入格式示例
        </button>
      </div>
      <label
        >事务 JSON<textarea
          v-model="source"
          class="json-editor"
          rows="12"
          placeholder='[{ "title": "…", "original_notice": "通知原文", "mode": "form", "due_at": "…", "fields": […] }]'
          spellcheck="false"
        />
      </label>
      <p class="field-hint">
        导入后立即发布。内置表单与新文件收集会保存当前班级名单；每次确认都会新增事务，请勿重复导入。
      </p>
      <div v-if="preview" class="import-preview">
        <strong>校验通过，共 {{ preview.length }} 条</strong>
        <ul class="preview-list">
          <li v-for="(item, i) in preview" :key="i">
            <span>{{ i + 1 }}. {{ item.title }}</span
            ><small>{{
              item.mode === 'form'
                ? `内置表单 · ${item.fields.length} 个字段`
                : item.mode === 'link'
                  ? '外部链接 · 手动标记完成'
                  : item.task_id
                    ? '关联已有文件收集'
                    : '自动创建文件收集'
            }}</small>
          </li>
        </ul>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="modal-footer">
        <button class="button secondary" :disabled="busy" @click="emit('close')">取消</button
        ><button
          v-if="!preview"
          class="button primary"
          :disabled="busy || !source.trim()"
          @click="check"
        >
          <LoaderCircle v-if="busy" :size="16" class="spin" />校验并预览<ArrowRight
            :size="16"
          /></button
        ><button v-else class="button primary" :disabled="busy" @click="save">
          <LoaderCircle v-if="busy" :size="16" class="spin" />确认导入 {{ preview.length }} 条
        </button>
      </div>
    </div>
  </AppModal>
</template>
