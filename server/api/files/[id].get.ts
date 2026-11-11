import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { db } from '../../utils/db'
import { sendPrivateFile } from '../../utils/private-file'
import type { Submission } from '../../../shared/types'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const file = db()
    .query<Submission, [string]>('SELECT * FROM submissions WHERE id=? AND active=1')
    .get(getRouterParam(event, 'id')!)
  if (!file) throw createError({ statusCode: 404, message: '文件不存在' })
  return sendPrivateFile(event, { objectKey: file.objectKey, name: file.storedName })
})
