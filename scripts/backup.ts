import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve(process.env.DATA_DIR || '.data')
const source = join(dir, 'classroom.sqlite')
if (!existsSync(source)) throw new Error('数据库尚未创建，请先启动应用。')
const outputDir = resolve(process.argv[2] || join(dir, 'backups'))
mkdirSync(outputDir, { recursive: true, mode: 0o700 })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const destination = join(outputDir, `classroom-${stamp}.sqlite`)
const database = new Database(source, { readonly: true })
try {
  // VACUUM INTO creates a consistent backup of a live WAL database without changing it.
  database.query('PRAGMA busy_timeout=10000').run()
  database.query('VACUUM INTO ?').run(destination)
  chmodSync(destination, 0o600)
  const verification = new Database(destination, { readonly: true })
  try {
    const check = verification.query('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check !== 'ok') throw new Error('备份完整性校验失败')
  } finally {
    verification.close()
  }
  console.log(destination)
} catch (error) {
  rmSync(destination, { force: true })
  throw error
} finally {
  database.close()
}
