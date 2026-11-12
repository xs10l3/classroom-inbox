import { join, resolve } from 'node:path'
import { createDatabaseBackup } from './database-backup'

const dir = resolve(process.env.DATA_DIR || '.data')
const source = join(dir, 'classroom.sqlite')
const outputDir = resolve(process.argv[2] || join(dir, 'backups'))
console.log(createDatabaseBackup(source, outputDir).path)
