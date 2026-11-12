import { lstatSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createError } from 'h3'
import { appConfig } from './config'

// Accept both existing CLI names and the new collision-resistant names.
export const backupNamePattern =
  /^classroom-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\.sqlite$/
export const backupDirectory = () => resolve(appConfig().dataDir, 'backups')

export function listBackups() {
  try {
    const directory = backupDirectory()
    const backups = readdirSync(directory)
      .flatMap((name) => {
        if (!backupNamePattern.test(name)) return []
        try {
          const stat = lstatSync(join(directory, name))
          return stat.isFile()
            ? [{ name, size: stat.size, createdAt: stat.mtime.toISOString() }]
            : []
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
          throw error
        }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
    return { backups, totalBytes: backups.reduce((sum, backup) => sum + backup.size, 0) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { backups: [], totalBytes: 0 }
    throw createError({ statusCode: 500, message: '无法读取备份列表，请检查数据目录权限' })
  }
}
