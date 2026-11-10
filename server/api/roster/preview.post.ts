import { defineEventHandler, createError } from 'h3'
import { requireAdmin, rateLimit } from '../../utils/auth'
import { boundedForm } from '../../utils/validation'
import { parseRosterFile } from '../../utils/roster-import'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  rateLimit(event, 'roster-import', 20, 10 * 60_000)
  const form = await boundedForm(event, 5 * 1024 * 1024 + 64 * 1024)
  const file = form.get('file')
  if (!(file instanceof File)) throw createError({ statusCode: 400, message: '请选择名单文件' })
  return { students: await parseRosterFile(file) }
})
