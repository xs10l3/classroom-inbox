import { defineEventHandler, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { boundedJson, validate, taskSchema } from '../../utils/validation'
import { db, listStudents, findTask } from '../../utils/db'
import { createTaskRecord } from '../../utils/task-record'
import { appConfig } from '../../utils/config'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const input = validate(taskSchema, await boundedJson(event, 128 * 1024))
  if (new Date(input.dueAt).getTime() <= Date.now())
    throw createError({ statusCode: 400, message: '截止时间须晚于当前时间' })
  if (input.maxSizeMb > appConfig().maxSizeMb)
    throw createError({
      statusCode: 400,
      message: `单文件上限不能超过 ${appConfig().maxSizeMb} MB`,
    })
  const students = listStudents()
  if (!students.length) throw createError({ statusCode: 400, message: '请先导入班级名单' })
  const id = db().transaction(() => createTaskRecord(input, students))()
  return { task: findTask(id)! }
})
