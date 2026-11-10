import { defineEventHandler, getRouterParam, createError, setHeaders, sendStream } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { db } from '../../utils/db'
import { downloadObject } from '../../utils/obs'
import type { Submission } from '../../../shared/types'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const file = db()
    .query<Submission, [string]>('SELECT * FROM submissions WHERE id=? AND active=1')
    .get(getRouterParam(event, 'id')!)
  if (!file) throw createError({ statusCode: 404, message: '文件不存在' })
  const stream = await downloadObject(file.objectKey)
  setHeaders(event, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.storedName)}`,
  })
  return sendStream(event, stream)
})
