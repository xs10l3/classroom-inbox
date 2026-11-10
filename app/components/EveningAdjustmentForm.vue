<script setup lang="ts">
import type { EveningSettings, Student } from '../../shared/types'
import { eveningWeekdays, weekdayLabels, shanghaiDate } from '#shared/evening'
import { apiError } from '~/utils/format'
const props = defineProps<{ settings: EveningSettings; students?: Student[]; admin?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const { notify } = useNotice()
const form = reactive({
  studentId: '',
  kind: 'permanent' as 'permanent' | 'dates',
  sourceWeekday: props.settings.weekdays[0] || 1,
  targetWeekday: eveningWeekdays.find((d) => !props.settings.weekdays.includes(d)) || 2,
  effectiveFrom:
    shanghaiDate() > props.settings.startDate ? shanghaiDate() : props.settings.startDate,
  sourceDate: '',
  targetDate: '',
  reason: '',
})
const busy = ref(false),
  error = ref('')
const targets = computed(() => eveningWeekdays.filter((d) => !props.settings.weekdays.includes(d)))
watch(
  () => props.settings.weekdays,
  () => {
    if (!props.settings.weekdays.includes(form.sourceWeekday))
      form.sourceWeekday = props.settings.weekdays[0] || 1
    if (!targets.value.includes(form.targetWeekday)) form.targetWeekday = targets.value[0] || 2
  },
)
async function save() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(props.admin ? '/api/admin/evening/adjustments' : '/api/leave/adjustments', {
      method: 'POST',
      body: form,
    })
    form.reason = ''
    notify(props.admin ? '个人调整已生效' : '调整申请已提交，等待管理员审核')
    emit('saved')
  } catch (e) {
    error.value = apiError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <form v-if="settings.enabled && targets.length" class="form-stack" @submit.prevent="save">
    <p class="leave-help">
      调入日期限周一至周五、周日中本班原本没有晚自习的日期。固定调整持续至
      {{ settings.endDate }}；指定日期调整只交换这两天的安排。
    </p>
    <label v-if="admin"
      >调整同学<select v-model="form.studentId" required>
        <option value="" disabled>请选择同学</option>
        <option v-for="s in students" :key="s.studentId" :value="s.studentId">
          {{ s.studentId }} · {{ s.name }}
        </option>
      </select></label
    >
    <label
      >调整方式<select v-model="form.kind">
        <option value="permanent">永久调整（每周固定）</option>
        <option value="dates">指定日期调整</option>
      </select></label
    >
    <template v-if="form.kind === 'permanent'">
      <div class="form-grid">
        <label
          >调出星期<select v-model.number="form.sourceWeekday">
            <option v-for="d in settings.weekdays" :key="d" :value="d">
              {{ weekdayLabels[d] }}
            </option>
          </select></label
        ><label
          >调入星期<select v-model.number="form.targetWeekday">
            <option v-for="d in targets" :key="d" :value="d">{{ weekdayLabels[d] }}</option>
          </select></label
        >
      </div>
      <label
        >生效日期<input
          v-model="form.effectiveFrom"
          type="date"
          :min="shanghaiDate() > settings.startDate ? shanghaiDate() : settings.startDate"
          :max="settings.endDate"
          required
      /></label>
    </template>
    <div v-else class="form-grid">
      <label
        >调出日期<input
          v-model="form.sourceDate"
          type="date"
          :min="shanghaiDate()"
          :max="settings.endDate"
          required /></label
      ><label
        >调入日期<input
          v-model="form.targetDate"
          type="date"
          :min="shanghaiDate()"
          :max="settings.endDate"
          required
      /></label>
    </div>
    <label>调整原因<textarea v-model="form.reason" rows="3" maxlength="2000" required /></label>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <button class="button primary" :disabled="busy">
      {{ busy ? '正在保存…' : admin ? '直接设置并生效' : '提交调整申请' }}
    </button>
  </form>
  <p v-else class="leave-help">
    {{
      settings.enabled
        ? '本班可调整的星期已全部安排晚自习，请联系管理员。'
        : '管理员启用晚自习安排后，可以申请个人调整。'
    }}
  </p>
</template>
