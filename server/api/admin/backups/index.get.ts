import { requireAdmin } from '../../../utils/auth'
import { listBackups } from '../../../utils/backups'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return listBackups()
})
