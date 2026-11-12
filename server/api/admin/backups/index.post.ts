import { join, resolve } from 'node:path'
import { createDatabaseBackup } from '../../../../scripts/database-backup'
import { requireAdmin, rateLimit } from '../../../utils/auth'
import { backupDirectory } from '../../../utils/backups'
import { appConfig } from '../../../utils/config'
import { db } from '../../../utils/db'

export default defineEventHandler((event) => {
  requireAdmin(event)
  rateLimit(event, 'database-backup', 5, 60_000)
  db()
  try {
    const backup = createDatabaseBackup(
      join(resolve(appConfig().dataDir), 'classroom.sqlite'),
      backupDirectory(),
    )
    return { ok: true, name: backup.name }
  } catch {
    throw createError({
      statusCode: 500,
      message: '备份创建失败，请检查磁盘空间和数据目录权限后重试',
    })
  }
})
