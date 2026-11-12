<script setup lang="ts">
import { LoaderCircle, Plus, X, UsersRound } from 'lucide-vue-next'
import { shanghaiDate, validDate } from '#shared/evening'
import { batchLeaveLimit, batchLeaveDateLimit, batchLeaveRecordLimit } from '#shared/leave-batch'
import { apiError } from '~/utils/format'
const props = defineProps<{ initialDate: string }>()
const emit = defineEmits<{ close: []; created: [result: { count: number; dates: string[] }] }>()
const today = shanghaiDate()
const dates = ref([
  validDate(props.initialDate) && props.initialDate >= today ? props.initialDate : today,
])
const newDate = ref(dates.value[0]!)
const queryDates = computed(() => dates.value.join(','))
const {
  data,
  error: loadError,
  status,
  refresh,
} = useFetch('/api/admin/leaves/batch', {
  query: { dates: queryDates },
})
const form = reactive({
  kind: 'evening',
  courseName: '',
  startTime: '08:00',
  endTime: '09:40',
  reason: '',
  deferProof: false,
})
const selected = ref<string[]>([]),
  search = ref(''),
  proof = ref<File>(),
  review = ref(false),
  busy = ref(false),
  error = ref('')
const issues = ref<string[]>([])
const currentData = computed(() =>
  status.value === 'success' && data.value?.dates.join(',') === queryDates.value
    ? data.value
    : null,
)
const candidates = computed(() =>
  (currentData.value?.students || []).map((student) => {
    let unavailable = ''
    for (const date of dates.value) {
      if (
        form.kind === 'evening' &&
        !currentData.value!.expectedIds[date]?.includes(student.studentId)
      ) {
        unavailable = `${date} 没有晚自习安排`
        break
      }
      const start = form.kind === 'evening' ? currentData.value!.settings.startTime : form.startTime
      const end = form.kind === 'evening' ? currentData.value!.settings.endTime : form.endTime
      if (
        start &&
        end &&
        currentData.value!.activeLeaves.some(
          (leave) =>
            leave.date === date &&
            leave.studentId === student.studentId &&
            leave.kind === form.kind &&
            leave.startAt.slice(11, 16) < end &&
            leave.endAt.slice(11, 16) > start,
        )
      ) {
        unavailable = `${date} 此时段已有请假`
        break
      }
    }
    return { ...student, unavailable }
  }),
)
const visible = computed(() =>
  candidates.value.filter((student) =>
    `${student.name} ${student.studentId}`
      .toLowerCase()
      .includes(search.value.trim().toLowerCase()),
  ),
)
const chosen = computed(() =>
  candidates.value.filter((student) => selected.value.includes(student.studentId)),
)
const count = computed(() => selected.value.length * dates.value.length)
const ready = computed(
  () =>
    !!currentData.value &&
    selected.value.length > 0 &&
    chosen.value.length === selected.value.length &&
    chosen.value.every((student) => !student.unavailable) &&
    count.value <= batchLeaveRecordLimit &&
    !!form.reason.trim() &&
    (form.kind === 'evening' || (!!form.courseName.trim() && form.startTime < form.endTime)) &&
    (!!proof.value || form.deferProof),
)
watch([queryDates, () => form.kind, () => form.startTime, () => form.endTime], () => {
  selected.value = []
  review.value = false
  error.value = ''
  issues.value = []
})
watch(proof, (value) => {
  if (value) form.deferProof = false
})
function addDate() {
  if (!validDate(newDate.value) || newDate.value < today) {
    error.value = '请选择今天或之后的有效日期'
    return
  }
  if (dates.value.includes(newDate.value)) {
    error.value = '这个日期已经添加'
    return
  }
  if (dates.value.length >= batchLeaveDateLimit) {
    error.value = `每批最多 ${batchLeaveDateLimit} 个日期`
    return
  }
  dates.value = [...dates.value, newDate.value].sort()
  error.value = ''
}
function chooseVisible() {
  selected.value = [
    ...new Set([
      ...selected.value,
      ...visible.value
        .filter((student) => !student.unavailable)
        .map((student) => student.studentId),
    ]),
  ].slice(0, batchLeaveLimit)
}
function selectProof(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file && file.size > (data.value?.proofLimitMb || 10) * 1024 * 1024) {
    error.value = `假条不能超过 ${data.value?.proofLimitMb || 10} MB`
    input.value = ''
    proof.value = undefined
    return
  }
  proof.value = file
  error.value = ''
}
function close() {
  if (!busy.value) emit('close')
}
async function submit() {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  issues.value = []
  const body = new FormData()
  for (const [key, value] of Object.entries(form)) body.append(key, String(value))
  for (const date of dates.value) body.append('dates', date)
  for (const id of selected.value) body.append('studentIds', id)
  if (proof.value) body.append('proof', proof.value)
  try {
    const result = await $fetch('/api/admin/leaves/batch', { method: 'POST', body, retry: 0 })
    emit('created', result)
  } catch (e) {
    const response = e as { response?: { status: number }; data?: { data?: { issues?: string[] } } }
    error.value = response.response
      ? apiError(e)
      : '提交结果未确认，请关闭弹窗并刷新当天名单核对后再操作。'
    issues.value = response.data?.data?.issues || []
    review.value = false
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <AppModal
    :title="review ? '确认批量请假' : '批量请假'"
    subtitle="为多位同学、多个日期统一登记，提交后立即生效。"
    @close="close"
  >
    <form
      class="form-stack batch-leave-form"
      @submit.prevent="review ? submit() : (review = ready)"
    >
      <template v-if="!review">
        <label
          >请假类型<select v-model="form.kind">
            <option value="evening">晚自习请假</option>
            <option value="course">普通课程请假</option>
          </select></label
        >
        <fieldset class="batch-date-field">
          <legend>请假日期（可多选）</legend>
          <div class="batch-date-add">
            <label>添加请假日期<input v-model="newDate" type="date" :min="today" /></label
            ><button type="button" class="button secondary small" @click="addDate">
              <Plus :size="15" />添加日期
            </button>
          </div>
          <div class="batch-date-chips">
            <span v-for="date in dates" :key="date"
              >{{ date
              }}<button
                type="button"
                class="icon-button"
                :aria-label="`移除日期 ${date}`"
                :disabled="dates.length === 1"
                @click="dates = dates.filter((value) => value !== date)"
              >
                <X :size="14" /></button
            ></span>
          </div>
          <p class="field-hint">先添加日期，再选择同学；每位同学在每个日期各生成一条请假。</p>
        </fieldset>
        <template v-if="form.kind === 'course'"
          ><label>课程名称<input v-model="form.courseName" maxlength="100" required /></label>
          <div class="form-grid">
            <label>每天开始时间<input v-model="form.startTime" type="time" required /></label
            ><label>每天结束时间<input v-model="form.endTime" type="time" required /></label></div
        ></template>
        <p v-else class="field-hint">
          晚自习时段：{{ data?.settings.startTime }}–{{
            data?.settings.endTime
          }}。所选同学在全部所选日期均须有晚自习安排，已通过的个人调整会计入。
        </p>
        <section class="batch-student-field" aria-label="选择请假同学">
          <label>搜索同学<input v-model="search" type="search" placeholder="姓名或学号" /></label>
          <div class="batch-selection-toolbar">
            <span>已选 {{ selected.length }} 人 · {{ dates.length }} 天</span
            ><button
              type="button"
              class="text-link"
              :disabled="!currentData"
              @click="chooseVisible"
            >
              全选搜索结果</button
            ><button type="button" class="text-link" @click="selected = []">清空选择</button>
          </div>
          <p v-if="status === 'pending'" class="leave-help" role="status">正在核对名单与安排…</p>
          <p v-else-if="loadError" class="form-error" role="alert">
            名单加载失败。<button type="button" class="text-link" @click="refresh()">
              重新加载
            </button>
          </p>
          <div v-else class="batch-student-list">
            <label
              v-for="student in visible"
              :key="student.studentId"
              class="leave-check"
              :class="{ unavailable: student.unavailable }"
              ><input
                v-model="selected"
                type="checkbox"
                :value="student.studentId"
                :aria-label="`选择 ${student.name} ${student.studentId}`"
                :disabled="
                  !!student.unavailable ||
                  (!selected.includes(student.studentId) && selected.length >= batchLeaveLimit)
                "
              /><span
                ><strong>{{ student.name }}</strong> <small>{{ student.studentId }}</small
                ><em v-if="student.unavailable">{{ student.unavailable }}</em></span
              ></label
            >
            <p v-if="!visible.length" class="leave-help">没有符合条件的同学。</p>
          </div>
          <p class="field-hint">
            最多 {{ batchLeaveLimit }} 人、{{ batchLeaveDateLimit }} 个日期，合计
            {{ batchLeaveRecordLimit }} 条。无法选择的同学会显示原因。
          </p>
        </section>
        <label
          >统一请假原因<textarea
            v-model="form.reason"
            rows="3"
            maxlength="2000"
            required
            placeholder="适用于本批所选同学和日期的原因"
          />
        </label>
        <label
          >本批共用假条（可选）<input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            @change="selectProof"
          /><span class="field-hint"
            >PDF / JPG / PNG / WebP，最多
            {{
              data?.proofLimitMb || 10
            }}
            MB。所选同学可查看本假条，请使用适用于整批人员和日期的文件；每条请假分别保留副本。</span
          ></label
        >
        <p v-if="proof" class="field-hint">
          已选择：{{ proof.name }}
          <button type="button" class="text-link" @click="proof = undefined">移除假条</button>
        </p>
        <label v-if="!proof" class="leave-check"
          ><input v-model="form.deferProof" type="checkbox" />暂时没有假条，由同学以后补交</label
        >
      </template>
      <template v-else>
        <div class="batch-review-summary">
          <strong>{{ selected.length }} 人 × {{ dates.length }} 天 = {{ count }} 条请假</strong>
          <p>
            {{ form.kind === 'evening' ? '晚自习' : form.courseName }} ·
            {{ form.kind === 'evening' ? data?.settings.startTime : form.startTime }}–{{
              form.kind === 'evening' ? data?.settings.endTime : form.endTime
            }}
          </p>
          <p>日期：{{ dates.join('、') }}</p>
          <p>
            同学：{{
              chosen.map((student) => `${student.name}（${student.studentId}）`).join('、')
            }}
          </p>
          <p>原因：{{ form.reason }}</p>
          <p>假条：{{ proof ? proof.name : '待补交，每位同学可在“我的请假”中补交' }}</p>
        </div>
        <p class="leave-help">
          确认后整批立即生效；如安排变化或存在重复请假，本批将不保存。同学可在“我的请假”中查询和取消自己的记录。
        </p>
      </template>
      <p v-if="count > batchLeaveRecordLimit" class="form-error" role="alert">
        当前为 {{ count }} 条，请减少人数或日期。
      </p>
      <div v-if="error" class="form-error" role="alert">
        <p>{{ error }}</p>
        <ul v-if="issues.length > 1">
          <li v-for="issue in issues" :key="issue">{{ issue }}</li>
        </ul>
      </div>
      <div class="modal-footer">
        <button
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="review ? (review = false) : close()"
        >
          {{ review ? '返回修改' : '取消' }}</button
        ><button class="button primary" :disabled="!ready || busy">
          <LoaderCircle v-if="busy" :size="17" class="spin" /><UsersRound v-else :size="17" />{{
            busy
              ? '正在提交，请稍候…'
              : review
                ? `确认并生成 ${count} 条请假`
                : `核对 ${count} 条请假`
          }}
        </button>
      </div>
    </form>
  </AppModal>
</template>
