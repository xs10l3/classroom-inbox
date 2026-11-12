import { closeSync, constants, createReadStream, fstatSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { requireAdmin } from '../../../utils/auth'
import { backupDirectory, backupNamePattern } from '../../../utils/backups'

export default defineEventHandler((event) => {
  requireAdmin(event)
  const name = getRouterParam(event, 'name') || ''
  const missing = () => createError({ statusCode: 404, message: '备份文件不存在' })
  if (!backupNamePattern.test(name)) throw missing()
  let fd: number | undefined
  try {
    fd = openSync(join(backupDirectory(), name), constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw missing()
    const stream = createReadStream('', { fd, autoClose: true })
    fd = undefined // The stream now owns the descriptor.
    setHeaders(event, {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${name}"`,
    })
    return sendStream(event, stream)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    if (['ENOENT', 'ELOOP', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || ''))
      throw missing()
    if ((error as { statusCode?: number }).statusCode === 404) throw error
    throw createError({ statusCode: 500, message: '备份文件读取失败，请稍后重试' })
  }
})
