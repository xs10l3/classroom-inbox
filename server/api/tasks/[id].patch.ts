import { z } from 'zod'
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { boundedJson, validate } from '../../utils/validation'
import { db, findTask } from '../../utils/db'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const task = findTask(getRouterParam(event, 'id')!)
  if (!task) throw createError({ statusCode: 404, message: '作业不存在' })
  const body = validate(
    z.object({
      closed: z.boolean().optional(),
      dueAt: z.iso.datetime({ offset: true }).optional(),
    }),
    await boundedJson(event),
  )
  if (body.dueAt && new Date(body.dueAt).getTime() <= Date.now())
    throw createError({ statusCode: 400, message: '新的截止时间须晚于当前时间' })
  db()
    .query('UPDATE tasks SET closed=?, dueAt=? WHERE id=?')
    .run(
      body.closed === undefined ? Number(task.closed) : Number(body.closed),
      body.dueAt ? new Date(body.dueAt).toISOString() : task.dueAt,
      task.id,
    )
  return { task: findTask(task.id)! }
})
