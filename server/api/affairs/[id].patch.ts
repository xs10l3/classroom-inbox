import { defineEventHandler, getRouterParam, createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../utils/auth'
import { boundedJson, validate } from '../../utils/validation'
import { db } from '../../utils/db'
import { findAffair } from '../../utils/affairs'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const affair = findAffair(id)
  if (!affair) throw createError({ statusCode: 404, message: '事务不存在' })
  const input = validate(
    z
      .object({
        closed: z.boolean().optional(),
        completed: z.boolean().optional(),
        dueAt: z.iso.datetime({ offset: true }).optional(),
      })
      .strict(),
    await boundedJson(event),
  )
  if (input.completed !== undefined && affair.mode !== 'link')
    throw createError({ statusCode: 400, message: '只有外部链接事务需要手动标记完成' })
  if (input.dueAt && Date.parse(input.dueAt) <= Date.now())
    throw createError({ statusCode: 400, message: '截止时间须晚于当前时间' })
  db().transaction(() => {
    if (input.closed !== undefined) {
      db().query('UPDATE affairs SET closed=? WHERE id=?').run(Number(input.closed), id)
      if (affair.taskId)
        db().query('UPDATE tasks SET closed=? WHERE id=?').run(Number(input.closed), affair.taskId)
    }
    if (input.completed !== undefined)
      db().query('UPDATE affairs SET completed=? WHERE id=?').run(Number(input.completed), id)
    if (input.dueAt) {
      const due = new Date(input.dueAt).toISOString()
      db().query('UPDATE affairs SET dueAt=? WHERE id=?').run(due, id)
      if (affair.taskId) db().query('UPDATE tasks SET dueAt=? WHERE id=?').run(due, affair.taskId)
    }
  })()
  return { affair: findAffair(id)! }
})
