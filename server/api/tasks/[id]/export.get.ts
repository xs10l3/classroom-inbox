import { defineEventHandler, getRouterParam, createError, setHeaders } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { findTask, taskStudents, taskSubmissions } from '../../../utils/db'
import { makeCsv } from '../../../utils/roster-import'
export default defineEventHandler((event) => {
  requireAdmin(event)
  const task = findTask(getRouterParam(event, 'id')!)
  if (!task) throw createError({ statusCode: 404, message: '作业不存在' })
  const submissions = taskSubmissions(task.id)
  setHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(task.title + '_提交情况.csv')}`,
  })
  return makeCsv([
    ['学号', '姓名', '提交状态', '文件数', '最近提交时间', '文件名'],
    ...taskStudents(task.id).map((s) => {
      const files = submissions.filter((f) => f.studentId === s.studentId)
      return [
        s.studentId,
        s.name,
        files.length ? '已提交' : '未提交',
        files.length,
        files[0]
          ? new Date(files[0].submittedAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              hour12: false,
            })
          : '',
        files.map((f) => f.originalName).join('；'),
      ]
    }),
  ])
})
