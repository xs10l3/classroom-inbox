import { defineEventHandler, getRouterParam, createError } from 'h3'
import { findPublicTask } from '../../utils/db'
import { appConfig, obsConfigured } from '../../utils/config'
export default defineEventHandler((event) => {
  const task = findPublicTask(getRouterParam(event, 'token')!)
  if (!task) throw createError({ statusCode: 404, message: '收集链接不存在' })
  return {
    task: {
      title: task.title,
      subject: task.subject,
      description: task.description,
      originalNotice: task.originalNotice,
      dueAt: task.dueAt,
      extensions: task.extensions,
      maxSizeMb: task.maxSizeMb,
      closed: task.closed || new Date(task.dueAt).getTime() <= Date.now(),
    },
    className: appConfig().className,
    storageReady: obsConfigured(),
  }
})
