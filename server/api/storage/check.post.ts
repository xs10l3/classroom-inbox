import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { checkBucket } from '../../utils/obs'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  await checkBucket()
  return { ok: true }
})
