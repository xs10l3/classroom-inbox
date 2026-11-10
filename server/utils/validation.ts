import { z } from 'zod'
import { createError, getHeader, getRequestWebStream, type H3Event } from 'h3'
import type { Student } from '../../shared/types'

export const taskSchema = z.object({
  title: z.string().trim().min(1, '请填写作业名称').max(80),
  subject: z.string().trim().min(1).max(30),
  description: z.string().trim().max(3000).default(''),
  originalNotice: z
    .string()
    .max(20000)
    .refine((value) => value.trim().length > 0, '请保留原始通知原文'),
  dueAt: z.iso.datetime({ offset: true }),
  extensions: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]{1,8}$/),
    )
    .min(1)
    .max(20),
  maxSizeMb: z.number().int().min(1).max(100),
})

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw createError({
      statusCode: 400,
      message: result.error.issues[0]?.message || '输入格式有误',
    })
  return result.data
}

export function normalizeRoster(input: unknown): Student[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1000) {
    throw createError({ statusCode: 400, message: '名单须包含 1–1000 位同学' })
  }
  const ids = new Set<string>()
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object')
      throw createError({ statusCode: 400, message: `第 ${index + 1} 行不是有效记录` })
    const row = raw as Record<string, unknown>
    const name = String(row.name ?? row['姓名'] ?? '').trim()
    const studentId = String(row.studentId ?? row.student_id ?? row['学号'] ?? '').trim()
    const genderValue = String(row.gender ?? row['性别'] ?? '')
      .trim()
      .toUpperCase()
    const gender = ['F', '女', 'FEMALE'].includes(genderValue)
      ? 'F'
      : ['M', '男', 'MALE'].includes(genderValue)
        ? 'M'
        : null
    if (!name || name.length > 40)
      throw createError({ statusCode: 400, message: `第 ${index + 1} 行姓名为空或过长` })
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(studentId))
      throw createError({
        statusCode: 400,
        message: `第 ${index + 1} 行缺少有效学号，请将 Excel 学号列设为文本`,
      })
    if (ids.has(studentId))
      throw createError({ statusCode: 400, message: `学号 ${studentId} 重复，请先核对名单` })
    if (genderValue && !gender)
      throw createError({
        statusCode: 400,
        message: `第 ${index + 1} 行性别须为男/女或 M/F，可留空`,
      })
    ids.add(studentId)
    return { name, studentId, gender }
  })
}

export function safeName(value: string) {
  return (
    value
      .normalize('NFC')
      .replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g, '_')
      .replace(/\.{2,}/g, '_')
      .slice(0, 140) || 'file'
  )
}

export async function boundedBody(event: H3Event, maxBytes: number) {
  const length = Number(getHeader(event, 'content-length') || 0)
  if (length > maxBytes) throw createError({ statusCode: 413, message: '上传内容超过大小限制' })
  const chunks: Buffer[] = []
  let size = 0
  // Nitro's Bun adapter exposes a Web stream; the Node request is a compatibility shim.
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) return Buffer.alloc(0)
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const buffer = Buffer.from(value)
      size += buffer.length
      if (size > maxBytes) {
        await reader.cancel()
        throw createError({ statusCode: 413, message: '上传内容超过大小限制' })
      }
      chunks.push(buffer)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

export async function boundedForm(event: H3Event, maxBytes: number) {
  const type = getHeader(event, 'content-type') || ''
  if (!type.startsWith('multipart/form-data;'))
    throw createError({ statusCode: 400, message: '请使用文件表单上传' })
  const body = await boundedBody(event, maxBytes)
  try {
    return await new Response(body, { headers: { 'content-type': type } }).formData()
  } catch {
    throw createError({ statusCode: 400, message: '无法解析文件表单' })
  }
}

export async function boundedJson(event: H3Event, maxBytes = 32 * 1024) {
  try {
    return JSON.parse((await boundedBody(event, maxBytes)).toString('utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 400, message: 'JSON 格式不正确' })
  }
}
