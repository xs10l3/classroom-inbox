import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { boundedForm, safeName, validate } from './validation'
import { appConfig, obsConfigured } from './config'
import { db } from './db'
import { eveningSettings, adjustments, fail, requireDay } from './evening'
import { isEveningScheduled, shanghaiDate } from '../../shared/evening'
import type { Student } from '../../shared/types'

export const proofLimitMb = () => Math.min(10, appConfig().maxSizeMb)
export async function proofForm(event: H3Event) {
  return boundedForm(event, (proofLimitMb() + 1) * 1024 * 1024)
}
export async function parseProof(form: FormData) {
  const files = form.getAll('proof')
  if (
    !files.length ||
    (files.length === 1 && files[0] instanceof File && !files[0].size && !files[0].name)
  )
    return null
  if (files.length !== 1 || !(files[0] instanceof File)) fail('请上传一份假条')
  const file = files[0]
  if (!file.size || file.size > proofLimitMb() * 1024 * 1024)
    fail(`假条须为 1 字节至 ${proofLimitMb()} MB`)
  const bytes = Buffer.from(await file.arrayBuffer()),
    name = safeName(file.name)
  const ext = name.split('.').pop()?.toLowerCase()
  const valid =
    (ext === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-') ||
    (['jpg', 'jpeg'].includes(ext || '') &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (ext === 'png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (ext === 'webp' &&
      bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP')
  if (!valid) fail('假条仅支持真实的 PDF、JPG、PNG 或 WebP 文件')
  if (!obsConfigured())
    throw createError({ statusCode: 503, message: '假条存储尚未配置，可选择以后补交' })
  return {
    bytes,
    name,
    id: crypto.randomUUID(),
    size: file.size,
    createdAt: new Date().toISOString(),
  }
}
const leaveSchema = z.object({
  kind: z.enum(['evening', 'course']),
  date: z.string(),
  courseName: z.string().trim().max(100).default(''),
  startTime: z.string().default(''),
  endTime: z.string().default(''),
  reason: z.string().trim().min(1, '请填写请假原因').max(2000),
  deferProof: z.enum(['true', 'false']).default('false'),
})
export function parseLeave(form: FormData, student: Student) {
  const input = validate(
    leaveSchema,
    Object.fromEntries([...form.entries()].filter(([key]) => key !== 'proof')),
  )
  const date = requireDay(input.date)
  if (date < shanghaiDate()) fail('请假日期不能早于今天')
  let { startTime, endTime, courseName } = input
  if (input.kind === 'evening') {
    const settings = eveningSettings()
    if (!isEveningScheduled(settings, adjustments(student.studentId), student.studentId, date))
      fail('这一天没有你的晚自习安排，请核对个人调整是否已审核通过')
    startTime = settings.startTime
    endTime = settings.endTime
    courseName = '晚自习'
  } else if (
    !courseName ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    startTime >= endTime
  )
    fail('请填写课程名称和有效的同一天起止时间')
  const startAt = `${date}T${startTime}:00+08:00`,
    endAt = `${date}T${endTime}:00+08:00`
  const duplicate = db()
    .query<{ id: string }, [string, string, string, string, string]>(
      `SELECT id FROM leave_requests WHERE studentId=? AND kind=? AND cancelledAt='' AND date=? AND startAt<? AND endAt>?`,
    )
    .get(student.studentId, input.kind, date, endAt, startAt)
  if (duplicate) fail('这个时段已有有效请假，请在“我的请假”中查看或取消')
  return { ...input, courseName, startAt, endAt }
}
export function ownedLeave(id: string, studentId: string) {
  const row = db()
    .query<{ id: string; cancelledAt: string }, [string, string]>(
      'SELECT id,cancelledAt FROM leave_requests WHERE id=? AND studentId=?',
    )
    .get(id, studentId)
  if (!row) throw createError({ statusCode: 404, message: '请假记录不存在' })
  return row
}
