import { randomUUID } from 'node:crypto'
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { z } from 'zod'
import { rateLimit } from '../../utils/auth'
import { boundedJson, validate } from '../../utils/validation'
import { publicAffair, affairStudents, validateAnswers } from '../../utils/affairs'
import { db } from '../../utils/db'
export default defineEventHandler(async (event) => {
  rateLimit(event, 'form-response', 40, 10 * 60_000)
  const token = getRouterParam(event, 'token')!
  const affair = publicAffair(token)
  if (!affair) throw createError({ statusCode: 404, message: '表单不存在' })
  const checkOpen = () => {
    const current = publicAffair(token)!
    if (current.closed || Date.parse(current.dueAt) <= Date.now())
      throw createError({ statusCode: 403, message: '本次表单已截止，无法填写' })
  }
  checkOpen()
  const input = validate(
    z
      .object({
        name: z.string().trim().min(1).max(40),
        studentId: z.string().trim().min(1).max(32),
        answers: z.unknown(),
      })
      .strict(),
    await boundedJson(event, 128 * 1024),
  )
  if (
    !affairStudents(affair.id).some((s) => s.studentId === input.studentId && s.name === input.name)
  )
    throw createError({ statusCode: 400, message: '姓名或学号与本次表单名单不匹配，请核对后再试' })
  const answers = validateAnswers(affair, input.answers)
  const submittedAt = new Date().toISOString()
  db().transaction(() => {
    checkOpen()
    db()
      .query(
        `INSERT INTO form_responses(affairId,studentId,studentName,answers,submittedAt) VALUES(?,?,?,?,?)
      ON CONFLICT(affairId,studentId) DO UPDATE SET answers=excluded.answers, submittedAt=excluded.submittedAt`,
      )
      .run(affair.id, input.studentId, input.name, JSON.stringify(answers), submittedAt)
  })()
  return { name: input.name, submittedAt, receipt: randomUUID() }
})
