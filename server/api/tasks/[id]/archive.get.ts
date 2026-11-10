import archiver from 'archiver'
import { once } from 'node:events'
import { defineEventHandler, getRouterParam, createError, setHeaders, sendStream } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { findTask, taskSubmissions, taskStudents } from '../../../utils/db'
import { downloadObject } from '../../../utils/obs'
import { safeName } from '../../../utils/validation'
import { makeCsv } from '../../../utils/roster-import'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const task = findTask(getRouterParam(event, 'id')!)
  if (!task) throw createError({ statusCode: 404, message: '作业不存在' })
  const submissions = taskSubmissions(task.id)
  if (!submissions.length) throw createError({ statusCode: 400, message: '暂时还没有可下载的文件' })
  // Fail before sending response headers if the first OBS request fails.
  const first = await downloadObject(submissions[0]!.objectKey)
  const zip = archiver('zip', { zlib: { level: 5 } })
  setHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName(task.title) + '.zip')}`,
  })
  const completed = new Set(submissions.map((s) => s.studentId))
  zip.append(
    makeCsv([
      ['学号', '姓名', '提交状态'],
      ...taskStudents(task.id).map((s) => [
        s.studentId,
        s.name,
        completed.has(s.studentId) ? '已提交' : '未提交',
      ]),
    ]),
    { name: '提交情况.csv' },
  )
  const fill = async () => {
    for (let i = 0; i < submissions.length; i++) {
      const file = submissions[i]!
      const stream = i === 0 ? first : await downloadObject(file.objectKey)
      const end = once(stream, 'end')
      zip.append(stream, {
        name: `${file.studentId}_${safeName(file.studentName)}/${file.id.slice(0, 8)}_${safeName(file.storedName)}`,
      })
      await end
    }
    await zip.finalize()
  }
  void fill().catch((error) => {
    console.error('[Archive] Storage stream failed')
    zip.destroy(error)
  })
  event.node.res.on('close', () => {
    if (!zip.writableFinished) {
      first.destroy()
      zip.abort()
    }
  })
  return sendStream(event, zip)
})
