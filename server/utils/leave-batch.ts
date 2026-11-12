import { createError } from 'h3'
import { z } from 'zod'
import {
  batchLeaveLimit,
  batchLeaveDateLimit,
  batchLeaveRecordLimit,
} from '../../shared/leave-batch'
import { validDate, shanghaiDate } from '../../shared/evening'
import { listStudents } from './db'
import { parseLeave } from './leave-files'
import { validate } from './validation'

export function batchStudentIds(form: FormData) {
  return validate(
    z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, '学号格式有误'))
      .min(1, '请至少选择一位同学')
      .max(batchLeaveLimit, `每批最多 ${batchLeaveLimit} 位同学`)
      .refine((ids) => new Set(ids).size === ids.length, '所选学号重复，请重新选择'),
    form.getAll('studentIds'),
  )
}

export function batchDates(input: unknown) {
  return validate(
    z
      .array(
        z
          .string()
          .refine(validDate, '请假日期格式有误')
          .refine((date) => date >= shanghaiDate(), '请假日期不能早于今天'),
      )
      .min(1, '请至少选择一个日期')
      .max(batchLeaveDateLimit, `每批最多 ${batchLeaveDateLimit} 个日期`)
      .refine((dates) => new Set(dates).size === dates.length, '请假日期重复，请重新选择'),
    input,
  ).sort()
}

// The same validator runs before upload and inside the final synchronous transaction.
export function validateBatchLeaves(form: FormData, ids: string[], dates: string[]) {
  if (ids.length * dates.length > batchLeaveRecordLimit)
    throw createError({
      statusCode: 400,
      message: `每批最多生成 ${batchLeaveRecordLimit} 条请假，请减少人数或日期`,
    })
  const roster = new Map(listStudents().map((student) => [student.studentId, student]))
  const issues: string[] = []
  const records = dates.flatMap((date) =>
    ids.flatMap((studentId) => {
      const student = roster.get(studentId)
      if (!student) {
        issues.push(`学号 ${studentId} 不在当前班级名单中`)
        return []
      }
      try {
        form.set('date', date)
        return [{ student, input: parseLeave(form, student) }]
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('statusCode' in error) ||
          error.statusCode !== 400
        )
          throw error
        issues.push(
          `${date} ${student.name}（${studentId}）：${error instanceof Error ? error.message : '请假信息有误'}`,
        )
        return []
      }
    }),
  )
  if (issues.length)
    throw createError({
      statusCode: 400,
      message: `${issues[0]}。本批未保存，请核对后重试。`,
      data: { issues },
    })
  return records
}
