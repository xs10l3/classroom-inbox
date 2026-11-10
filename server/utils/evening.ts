import { createError } from 'h3'
import { z } from 'zod'
import { db, listStudents } from './db'
import { validate } from './validation'
import {
  addDays,
  eveningWeekdays,
  isEveningScheduled,
  shanghaiDate,
  validDate,
  weekdayOf,
} from '../../shared/evening'
import type { EveningAdjustment, EveningSettings, LeaveRecord, Student } from '../../shared/types'

export function fail(message: string): never {
  throw createError({ statusCode: 400, message })
}
const date = z.string().refine(validDate, '日期格式有误')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式有误')
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    weekdays: z
      .array(
        z
          .number()
          .int()
          .refine((n) => eveningWeekdays.includes(n)),
      )
      .max(6),
    startDate: date,
    endDate: date,
    startTime: time,
    endTime: time,
    originalNotice: z.string().max(20000).default(''),
  })
  .refine((s) => s.startDate <= s.endDate, '结束日期不能早于开始日期')
  .refine((s) => s.endTime > s.startTime, '结束时间必须晚于开始时间（同一天）')
  .refine((s) => !s.enabled || s.weekdays.length > 0, '请选择本班的晚自习日期')
  .refine((s) => new Set(s.weekdays).size === s.weekdays.length, '晚自习日期不能重复')

export function eveningSettings(): EveningSettings {
  const row = db()
    .query<{ value: string }, []>('SELECT value FROM evening_settings WHERE id=1')
    .get()
  return row
    ? JSON.parse(row.value)
    : {
        enabled: false,
        weekdays: [],
        startDate: shanghaiDate(),
        endDate: addDays(shanghaiDate(), 120),
        startTime: '18:30',
        endTime: '20:30',
        originalNotice: '',
      }
}
export function adjustments(studentId?: string): EveningAdjustment[] {
  return studentId
    ? db()
        .query<EveningAdjustment, [string]>(
          'SELECT * FROM evening_adjustments WHERE studentId=? ORDER BY createdAt DESC,id',
        )
        .all(studentId)
    : db()
        .query<EveningAdjustment, []>(
          'SELECT * FROM evening_adjustments ORDER BY createdAt DESC,id',
        )
        .all()
}
export function currentStudent(studentId: string) {
  return db().query<Student, [string]>('SELECT * FROM students WHERE studentId=?').get(studentId)
}
export const adjustmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('permanent'),
    sourceWeekday: z.number().int(),
    targetWeekday: z.number().int(),
    effectiveFrom: date,
    reason: z.string().trim().min(1, '请填写调整原因').max(2000),
  }),
  z.object({
    kind: z.literal('dates'),
    sourceDate: date,
    targetDate: date,
    reason: z.string().trim().min(1, '请填写调整原因').max(2000),
  }),
])
const applies = (a: EveningAdjustment, day: string) => !a.inactiveFrom || day < a.inactiveFrom

// Validate the entire effective set, including interactions between recurring and dated transfers.
export function validateSchedule(settings: EveningSettings, entries: EveningAdjustment[]) {
  const active = entries.filter((a) => ['approved', 'revoked'].includes(a.status))
  for (const id of new Set(active.map((a) => a.studentId))) {
    const own = active.filter((a) => a.studentId === id)
    const recurring = own.filter(
      (a) => a.kind === 'permanent' && (!a.inactiveFrom || a.inactiveFrom > a.effectiveFrom),
    )
    for (const a of recurring) {
      if (a.inactiveFrom && a.inactiveFrom <= shanghaiDate()) continue
      if (
        !settings.weekdays.includes(a.sourceWeekday!) ||
        settings.weekdays.includes(a.targetWeekday!) ||
        !eveningWeekdays.includes(a.targetWeekday!) ||
        a.effectiveFrom < settings.startDate ||
        a.effectiveFrom > settings.endDate
      )
        fail(`${a.studentName} 的固定调整与安排冲突，请先撤销该调整`)
      for (const b of recurring) {
        if (a.id === b.id) continue
        const from = a.effectiveFrom > b.effectiveFrom ? a.effectiveFrom : b.effectiveFrom
        if (
          (!a.inactiveFrom || from < a.inactiveFrom) &&
          (!b.inactiveFrom || from < b.inactiveFrom) &&
          (a.sourceWeekday === b.sourceWeekday || a.targetWeekday === b.targetWeekday)
        )
          fail(`${a.studentName} 已有相同调出或调入星期的固定调整`)
      }
    }
    const used = new Set<string>()
    for (const a of own.filter((a) => a.kind === 'dates')) {
      if (!applies(a, a.sourceDate) && !applies(a, a.targetDate)) continue
      if (a.sourceDate < shanghaiDate() && a.targetDate < shanghaiDate()) continue
      if (
        a.sourceDate < settings.startDate ||
        a.sourceDate > settings.endDate ||
        a.targetDate < settings.startDate ||
        a.targetDate > settings.endDate ||
        !eveningWeekdays.includes(weekdayOf(a.targetDate)) ||
        settings.weekdays.includes(weekdayOf(a.targetDate))
      )
        fail(`${a.studentName} 的日期调整超出安排范围或调入日期已有班级晚自习`)
      if (
        !isEveningScheduled({ ...settings, enabled: true }, recurring, id, a.sourceDate) ||
        isEveningScheduled({ ...settings, enabled: true }, recurring, id, a.targetDate)
      )
        fail(`${a.studentName} 的调出日期没有晚自习，或调入日期已有个人安排`)
      for (const day of [a.sourceDate, a.targetDate]) {
        if (used.has(day)) fail(`${a.studentName} 的日期调整重复或相互冲突`)
        used.add(day)
      }
    }
  }
}
export function createAdjustment(raw: unknown, student: Student, by: 'student' | 'admin') {
  const input = validate(adjustmentSchema, raw)
  const settings = eveningSettings()
  if (!settings.enabled) fail('晚自习安排尚未启用')
  const entry: EveningAdjustment = {
    id: crypto.randomUUID(),
    studentId: student.studentId,
    studentName: student.name,
    sourceWeekday: null,
    targetWeekday: null,
    effectiveFrom: '',
    sourceDate: '',
    targetDate: '',
    ...input,
    status: by === 'admin' ? 'approved' : 'pending',
    createdBy: by,
    createdAt: new Date().toISOString(),
    reviewedAt: by === 'admin' ? new Date().toISOString() : '',
    reviewNote: '',
    inactiveFrom: '',
  }
  validateNewAdjustment(entry, settings)
  db()
    .query(
      `INSERT INTO evening_adjustments (id,studentId,studentName,kind,sourceWeekday,targetWeekday,effectiveFrom,sourceDate,targetDate,reason,status,createdBy,createdAt,reviewedAt,reviewNote,inactiveFrom)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      entry.id,
      entry.studentId,
      entry.studentName,
      entry.kind,
      entry.sourceWeekday,
      entry.targetWeekday,
      entry.effectiveFrom,
      entry.sourceDate,
      entry.targetDate,
      entry.reason,
      entry.status,
      entry.createdBy,
      entry.createdAt,
      entry.reviewedAt,
      entry.reviewNote,
      entry.inactiveFrom,
    )
  return entry
}
export function validateNewAdjustment(entry: EveningAdjustment, settings = eveningSettings()) {
  if (!settings.enabled) fail('晚自习安排尚未启用')
  if (!currentStudent(entry.studentId)) fail('该同学已不在当前名单中')
  if (entry.kind === 'permanent') {
    if (entry.effectiveFrom < shanghaiDate()) fail('固定调整的生效日期不能早于今天')
  } else {
    if (entry.sourceDate < shanghaiDate() || entry.targetDate < shanghaiDate())
      fail('调整日期不能早于今天')
    if (entry.sourceDate === entry.targetDate) fail('调出和调入日期不能相同')
  }
  validateSchedule(settings, [
    ...adjustments().filter((a) => a.id !== entry.id),
    { ...entry, status: 'approved' },
  ])
}
export function leaveRecords(studentId?: string, day?: string): LeaveRecord[] {
  const clauses = [studentId ? 'l.studentId=?' : '', day ? 'l.date=?' : ''].filter(Boolean)
  const rows = db()
    .query<
      Omit<LeaveRecord, 'proof'> & {
        proofId: string | null
        proofName: string | null
        proofSize: number | null
        proofCreatedAt: string | null
      },
      string[]
    >(
      `SELECT l.*,p.name AS proofName,p.size AS proofSize,p.createdAt AS proofCreatedAt FROM leave_requests l LEFT JOIN leave_proofs p ON p.id=l.proofId ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY l.date DESC,l.createdAt DESC,l.id`,
    )
    .all(...[studentId, day].filter((v): v is string => !!v))
  return rows.map(({ proofId, proofName, proofSize, proofCreatedAt, ...row }) => ({
    ...row,
    proof: proofId
      ? { id: proofId, name: proofName!, size: proofSize!, createdAt: proofCreatedAt! }
      : null,
  }))
}
export function dailyEvening(day: string) {
  const settings = eveningSettings(),
    entries = adjustments(),
    students = listStudents()
  const leaves = leaveRecords(undefined, day)
  const expected = students.filter((s) => isEveningScheduled(settings, entries, s.studentId, day))
  const eveningLeaves = leaves.filter((l) => l.kind === 'evening' && !l.cancelledAt)
  const normal = expected.filter((s) => !eveningLeaves.some((l) => l.studentId === s.studentId))
  return { date: day, settings, expected, normal, eveningLeaves, leaves }
}
export function requireDay(value: unknown) {
  if (typeof value !== 'string' || !validDate(value)) fail('请选择有效日期')
  return value
}
