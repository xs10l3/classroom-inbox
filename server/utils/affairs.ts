import { randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { Affair, FormResponse, Student } from '../../shared/types'
import { db, findTask, listStudents, listTasks } from './db'
import { appConfig } from './config'
import { createTaskRecord } from './task-record'
import type { AffairInput } from './affair-input'

type AffairRow = Omit<Affair, 'fields' | 'closed' | 'completed'> & {
  fields: string
  closed: number
  completed: number
}
export function listAffairs(): Affair[] {
  const tasks = new Map(listTasks().map((task) => [task.id, task]))
  return db()
    .query<AffairRow, []>(
      `SELECT a.*,
    (SELECT COUNT(*) FROM affair_students WHERE affairId=a.id) AS totalStudents,
    (SELECT COUNT(*) FROM form_responses WHERE affairId=a.id) AS responseCount
    FROM affairs a ORDER BY a.createdAt DESC, a.id DESC`,
    )
    .all()
    .map((row) => {
      const task = row.taskId ? tasks.get(row.taskId) : undefined
      return {
        ...row,
        fields: JSON.parse(row.fields),
        closed: task ? task.closed : Boolean(row.closed),
        completed: Boolean(row.completed),
        taskShareToken: task?.shareToken || null,
        dueAt: task?.dueAt || row.dueAt,
        responseCount: task?.submittedCount ?? row.responseCount,
        totalStudents: task?.totalStudents ?? row.totalStudents,
      }
    })
}
export const findAffair = (id: string) => listAffairs().find((a) => a.id === id)
export const publicAffair = (token: string) =>
  listAffairs().find((a) => a.shareToken === token && a.mode === 'form')
export function affairStudents(id: string) {
  return db()
    .query<Student, [string]>(
      'SELECT studentId,name,gender FROM affair_students WHERE affairId=? ORDER BY studentId',
    )
    .all(id)
}
export function affairResponses(id: string): FormResponse[] {
  return db()
    .query<Omit<FormResponse, 'answers'> & { answers: string }, [string]>(
      'SELECT * FROM form_responses WHERE affairId=? ORDER BY studentId',
    )
    .all(id)
    .map((row) => ({ ...row, answers: JSON.parse(row.answers) }))
}

export function checkAffairImports(inputs: AffairInput[]) {
  const students = listStudents()
  for (const affair of inputs) {
    if (affair.mode === 'link') continue
    if (affair.mode === 'files' && affair.task_id) {
      if (!findTask(affair.task_id))
        throw createError({ statusCode: 400, message: `${affair.title}：关联的作业不存在` })
    } else {
      if (!students.length)
        throw createError({ statusCode: 400, message: '请先导入班级名单，再创建表单或文件收集' })
      if (affair.collection && affair.collection.max_size_mb > appConfig().maxSizeMb)
        throw createError({
          statusCode: 400,
          message: `单文件上限不能超过 ${appConfig().maxSizeMb} MB`,
        })
    }
  }
}

export function createAffairs(inputs: AffairInput[]) {
  checkAffairImports(inputs)
  const students = listStudents()
  const ids: string[] = []
  db().transaction(() => {
    for (const input of inputs) {
      const id = randomUUID()
      let taskId: string | null = input.task_id || null
      if (input.mode === 'files' && !taskId) {
        taskId = createTaskRecord(
          {
            title: input.title,
            subject: input.category,
            description: input.description,
            originalNotice: input.original_notice,
            dueAt: input.due_at,
            extensions: input.collection!.extensions,
            maxSizeMb: input.collection!.max_size_mb,
          },
          students,
        )
      }
      db()
        .prepare(
          `INSERT INTO affairs(id,title,category,description,originalNotice,mode,dueAt,createdAt,shareToken,url,taskId,fields)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.title,
          input.category,
          input.description,
          input.original_notice,
          input.mode,
          new Date(input.due_at).toISOString(),
          new Date().toISOString(),
          randomBytes(24).toString('base64url'),
          input.url,
          taskId,
          JSON.stringify(input.fields),
        )
      if (input.mode === 'form') {
        const insert = db().prepare(
          'INSERT INTO affair_students(affairId,studentId,name,gender) VALUES(?,?,?,?)',
        )
        for (const student of students)
          insert.run(id, student.studentId, student.name, student.gender)
      }
      ids.push(id)
    }
  })()
  return listAffairs().filter((a) => ids.includes(a.id))
}

export function validateAnswers(affair: Affair, raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw createError({ statusCode: 400, message: '请填写表单内容' })
  const values = raw as Record<string, unknown>
  if (Object.keys(values).some((key) => !affair.fields.some((field) => field.key === key)))
    throw createError({ statusCode: 400, message: '表单字段已变更，请刷新页面' })
  const answers: Record<string, string> = Object.create(null)
  for (const field of affair.fields) {
    const rawValue = values[field.key]
    if (rawValue != null && typeof rawValue !== 'string' && typeof rawValue !== 'number')
      throw createError({ statusCode: 400, message: `${field.label}：内容格式不正确` })
    const value = String(rawValue ?? '').trim()
    if (field.required && !value)
      throw createError({ statusCode: 400, message: `请填写${field.label}` })
    if (value.length > 2000)
      throw createError({ statusCode: 400, message: `${field.label}最多 2000 字` })
    if (value && field.type === 'select' && !field.options.includes(value))
      throw createError({ statusCode: 400, message: `${field.label}：请选择有效选项` })
    if (
      value &&
      field.type === 'number' &&
      (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))
    )
      throw createError({ statusCode: 400, message: `${field.label}须为有效数字` })
    if (
      value &&
      field.type === 'date' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw createError({ statusCode: 400, message: `${field.label}须为有效日期` })
    answers[field.key] = value
  }
  return answers
}
