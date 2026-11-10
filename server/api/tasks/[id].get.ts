import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { findTask, taskStudents, taskSubmissions } from '../../utils/db'
export default defineEventHandler((event) => {
  requireAdmin(event)
  const task = findTask(getRouterParam(event, 'id')!)
  if (!task) throw createError({ statusCode: 404, message: '作业不存在' })
  return { task, students: taskStudents(task.id), submissions: taskSubmissions(task.id) }
})
