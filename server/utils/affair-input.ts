import { z } from 'zod'
import { createError } from 'h3'
import { validate } from './validation'

const fieldSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, '字段 key 须以字母开头，仅含字母、数字和下划线'),
    label: z.string().trim().min(1).max(80),
    type: z.enum(['text', 'textarea', 'number', 'select', 'date']).default('text'),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === 'select' && field.options.length < 2)
      ctx.addIssue({ code: 'custom', message: '单选字段至少需要两个选项' })
    if (new Set(field.options).size !== field.options.length)
      ctx.addIssue({ code: 'custom', message: '表单选项不能重复' })
  })

const affairSchema = z
  .object({
    title: z.string().trim().min(1, '请填写事务名称').max(80),
    category: z.string().trim().min(1).max(30).default('班级事务'),
    description: z.string().trim().max(3000).default(''),
    original_notice: z
      .string()
      .max(20000)
      .refine((value) => value.trim().length > 0, '请提供 original_notice，保留原始通知原文'),
    mode: z.enum(['form', 'link', 'files']),
    due_at: z.iso.datetime({ offset: true, message: 'due_at 须为带时区的 ISO 时间' }),
    url: z.string().max(2000).default(''),
    fields: z.array(fieldSchema).max(20).default([]),
    task_id: z.string().max(100).default(''),
    collection: z
      .object({
        extensions: z
          .array(
            z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9]{1,8}$/),
          )
          .min(1)
          .max(20)
          .default(['pdf', 'docx', 'zip']),
        max_size_mb: z.number().int().min(1).max(100).default(20),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((affair, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (affair.mode === 'link') {
      try {
        const url = new URL(affair.url)
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
      } catch {
        issue('外部表格链接须为有效 HTTPS 地址')
      }
    } else if (affair.url) issue('只有外部链接事务可以填写 url')
    if (affair.mode === 'form') {
      if (!affair.fields.length) issue('内置表单至少需要一个字段')
      if (new Set(affair.fields.map((f) => f.key)).size !== affair.fields.length)
        issue('字段 key 不能重复')
    } else if (affair.fields.length) issue('只有内置表单可以填写 fields')
    if (affair.mode !== 'files' && (affair.task_id || affair.collection))
      issue('只有文件收集可以关联作业')
    if (affair.task_id && affair.collection) issue('关联已有作业时，请移除 collection')
  })

export type AffairInput = z.infer<typeof affairSchema>

export function normalizeAffairs(input: unknown): AffairInput[] {
  if (!Array.isArray(input) || !input.length || input.length > 50)
    throw createError({ statusCode: 400, message: '请提供含 1–50 条事务的 JSON 数组' })
  return input.map((row, i) => {
    try {
      const affair = validate(affairSchema, row)
      if (Date.parse(affair.due_at) <= Date.now())
        throw createError({ statusCode: 400, message: '截止时间须晚于当前时间' })
      if (affair.mode === 'files' && !affair.task_id && !affair.collection)
        affair.collection = { extensions: ['pdf', 'docx', 'zip'], max_size_mb: 20 }
      return affair
    } catch (error) {
      throw createError({
        statusCode: 400,
        message: `第 ${i + 1} 条事务：${error instanceof Error ? error.message : '格式有误'}`,
      })
    }
  })
}
