import { Database } from 'bun:sqlite'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export function createDatabaseBackup(source: string, outputDir: string) {
  if (!existsSync(source)) throw new Error('数据库尚未创建，请先启动应用。')
  mkdirSync(outputDir, { recursive: true, mode: 0o700 })
  const id = crypto.randomUUID()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `classroom-${stamp}-${id}.sqlite`
  const temporary = join(outputDir, `.creating-${id}.sqlite`)
  const destination = join(outputDir, name)
  const database = new Database(source, { readonly: true })
  try {
    // Include committed WAL data in a consistent snapshot of the live database.
    database.query('PRAGMA busy_timeout=10000').run()
    database.query('VACUUM INTO ?').run(temporary)
    chmodSync(temporary, 0o600)
    const verification = new Database(temporary, { readonly: true })
    try {
      const check = verification.query('PRAGMA integrity_check').get() as {
        integrity_check: string
      }
      if (check.integrity_check !== 'ok') throw new Error('备份完整性校验失败')
    } finally {
      verification.close()
    }
    // Publish only complete, verified files to the download list.
    renameSync(temporary, destination)
    return { name, path: destination }
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  } finally {
    database.close()
  }
}
