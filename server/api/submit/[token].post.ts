import { randomUUID } from 'node:crypto'
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { rateLimit } from '../../utils/auth'
import { findPublicTask, db, taskStudents } from '../../utils/db'
import { boundedForm, safeName } from '../../utils/validation'
import { uploadObject, removeUploadedObject } from '../../utils/obs'
import { appConfig, obsConfigured } from '../../utils/config'
import type { Submission } from '../../../shared/types'
export default defineEventHandler(async (event) => {
  rateLimit(event, 'submission', 30, 10 * 60_000)
  const task = findPublicTask(getRouterParam(event, 'token')!)
  if (!task) throw createError({ statusCode: 404, message: '收集链接不存在' })
  const checkOpen = () => {
    const current = findPublicTask(task.shareToken)!
    if (current.closed || new Date(current.dueAt).getTime() <= Date.now())
      throw createError({ statusCode: 403, message: '本次作业已截止，无法提交' })
  }
  checkOpen()
  if (!obsConfigured())
    throw createError({ statusCode: 503, message: '文件存储尚未配置，请联系管理员' })
  const form = await boundedForm(
    event,
    Math.min(100, task.maxSizeMb * 5) * 1024 * 1024 + 128 * 1024,
  )
  const studentId = String(form.get('studentId') || '').trim()
  const name = String(form.get('name') || '').trim()
  const student = taskStudents(task.id).find((s) => s.studentId === studentId && s.name === name)
  if (!student)
    throw createError({ statusCode: 400, message: '姓名或学号与本次作业名单不匹配，请核对后再试' })
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!files.length || files.length > 5)
    throw createError({ statusCode: 400, message: '每次请选择 1–5 个文件' })
  for (const file of files) {
    if (file.size === 0 || file.size > task.maxSizeMb * 1024 * 1024)
      throw createError({
        statusCode: 400,
        message: `每个文件须大于 0 字节，且不超过 ${task.maxSizeMb} MB`,
      })
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !task.extensions.includes(ext))
      throw createError({
        statusCode: 400,
        message: `不支持 ${ext || '无后缀'} 格式，请提交 ${task.extensions.join('、')}`,
      })
  }
  const uploaded: Submission[] = []
  try {
    for (const file of files) {
      const id = randomUUID()
      const storedName = `${studentId}_${safeName(name)}_${safeName(task.title)}_${safeName(file.name)}`
      const objectKey = `${appConfig().obsPrefix}/assignments/${task.id}/${studentId}/${id}/${storedName}`
      await uploadObject(objectKey, Buffer.from(await file.arrayBuffer()))
      uploaded.push({
        id,
        taskId: task.id,
        studentId,
        studentName: name,
        originalName: file.name,
        storedName,
        objectKey,
        size: file.size,
        submittedAt: new Date().toISOString(),
        late: false,
      })
    }
    db().transaction(() => {
      checkOpen()
      db()
        .query('UPDATE submissions SET active=0 WHERE taskId=? AND studentId=?')
        .run(task.id, studentId)
      const insert = db().prepare(
        `INSERT INTO submissions(id,taskId,studentId,studentName,originalName,storedName,objectKey,size,submittedAt,late) VALUES(?,?,?,?,?,?,?,?,?,0)`,
      )
      for (const s of uploaded)
        insert.run(
          s.id,
          s.taskId,
          s.studentId,
          s.studentName,
          s.originalName,
          s.storedName,
          s.objectKey,
          s.size,
          s.submittedAt,
        )
    })()
  } catch (error) {
    await Promise.all(uploaded.map((s) => removeUploadedObject(s.objectKey)))
    throw error
  }
  return {
    ok: true,
    receipt: randomUUID(),
    name,
    fileCount: files.length,
    submittedAt: uploaded[0]!.submittedAt,
  }
})
