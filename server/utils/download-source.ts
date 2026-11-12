import { constants, createReadStream, closeSync, fstatSync, openSync } from 'node:fs'
import { writeFile, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createError, type H3Event } from 'h3'
import { isAdmin, requireAdmin } from './auth'
import { requireLeaveStudent } from './leave-auth'
import { db, findTask, listStudents, taskStudents, taskSubmissions } from './db'
import { makeCsv } from './roster-import'
import { affairResponses, affairStudents, findAffair } from './affairs'
import { dailyLeaveExport } from './leave-export'
import { requireDay } from './evening'
import { shanghaiDate } from '../../shared/evening'
import { safeName } from './validation'
import { backupDirectory, backupNamePattern } from './backups'
import { writeDownloadArchive, writeObjectFile, type DownloadProgress } from './download-archive'

export interface DownloadSource {
  name: string
  mime: string
  files: { name: string; size: number | null }[]
  write: (destination: string, progress: DownloadProgress) => Promise<void>
}
const missing = () => createError({ statusCode: 404, message: '下载文件不存在或已失效' })
const single = (
  name: string,
  mime: string,
  size: number | null,
  write: (destination: string, onBytes: (bytes: number) => void) => Promise<void>,
): DownloadSource => ({
  name: safeName(name),
  mime,
  files: [{ name: safeName(name), size }],
  write: async (destination, progress) => {
    progress({ type: 'start', index: 0 })
    await write(destination, (bytes) => progress({ type: 'bytes', index: 0, bytes }))
    progress({ type: 'complete', index: 0, size: (await stat(destination)).size })
  },
})
const csv = (name: string, rows: unknown[][]): DownloadSource => {
  const content = makeCsv(rows)
  return single(name, 'text/csv; charset=utf-8', Buffer.byteLength(content), (destination) =>
    writeFile(destination, content, { mode: 0o600 }),
  )
}

export function resolveDownloadSource(event: H3Event, source: string): DownloadSource {
  if (!source.startsWith('/api/') || source.includes('\\') || source.length > 700) throw missing()
  const url = new URL(source, 'http://downloads.local')
  if (url.origin !== 'http://downloads.local') throw missing()
  const path = url.pathname
  const proofMatch = path.match(new RegExp('^/api/leave/proofs/([A-Za-z0-9_-]+)$'))
  if (proofMatch) {
    const student = isAdmin(event) ? null : requireLeaveStudent(event)
    const proof = db()
      .query<{ name: string; objectKey: string; size: number; studentId: string }, [string]>(
        'SELECT p.name,p.objectKey,p.size,l.studentId FROM leave_proofs p JOIN leave_requests l ON l.proofId=p.id WHERE p.id=?',
      )
      .get(proofMatch[1]!)
    if (!proof || (student && student.studentId !== proof.studentId)) throw missing()
    return single(proof.name, 'application/octet-stream', proof.size, (destination, onBytes) =>
      writeObjectFile(destination, proof.objectKey, proof.size, onBytes),
    )
  }
  requireAdmin(event)
  const fileMatch = path.match(new RegExp('^/api/files/([A-Za-z0-9_-]+)$'))
  if (fileMatch) {
    const file = db()
      .query<{ storedName: string; objectKey: string; size: number }, [string]>(
        'SELECT storedName,objectKey,size FROM submissions WHERE id=? AND active=1',
      )
      .get(fileMatch[1]!)
    if (!file) throw missing()
    return single(file.storedName, 'application/octet-stream', file.size, (destination, onBytes) =>
      writeObjectFile(destination, file.objectKey, file.size, onBytes),
    )
  }
  if (path === '/api/roster/template')
    return csv('roster-template.csv', [
      ['学号', '姓名', '性别'],
      ['2026000000001', '示例同学甲', '女'],
      ['2026000000002', '示例同学乙', '男'],
    ])
  if (path === '/api/roster/export')
    return csv('roster.csv', [
      ['学号', '姓名', '性别'],
      ...listStudents().map((s) => [
        s.studentId,
        s.name,
        s.gender === 'F' ? '女' : s.gender === 'M' ? '男' : '',
      ]),
    ])
  const taskMatch = path.match(new RegExp('^/api/tasks/([A-Za-z0-9_-]+)/(archive|export)$'))
  if (taskMatch) {
    const task = findTask(taskMatch[1]!)
    if (!task) throw missing()
    const files = taskSubmissions(task.id),
      students = taskStudents(task.id)
    if (taskMatch[2] === 'export')
      return csv(task.title + '_提交情况.csv', [
        ['学号', '姓名', '提交状态', '文件数', '最近提交时间', '文件名'],
        ...students.map((s) => {
          const submitted = files.filter((f) => f.studentId === s.studentId)
          return [
            s.studentId,
            s.name,
            submitted.length ? '已提交' : '未提交',
            submitted.length,
            submitted[0]
              ? new Date(submitted[0].submittedAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false,
                })
              : '',
            submitted.map((f) => f.originalName).join('；'),
          ]
        }),
      ])
    if (!files.length) throw createError({ statusCode: 400, message: '暂时还没有可下载的文件' })
    const complete = new Set(files.map((f) => f.studentId))
    const entries = [
      {
        name: '提交情况.csv',
        content: makeCsv([
          ['学号', '姓名', '提交状态'],
          ...students.map((s) => [
            s.studentId,
            s.name,
            complete.has(s.studentId) ? '已提交' : '未提交',
          ]),
        ]),
      },
      ...files.map((f) => ({
        name: `${f.studentId}_${safeName(f.studentName)}/${f.id.slice(0, 8)}_${safeName(f.storedName)}`,
        objectKey: f.objectKey,
        size: f.size,
      })),
    ]
    return {
      name: safeName(task.title) + '.zip',
      mime: 'application/zip',
      files: entries.map((entry) => ({
        name: entry.name,
        size: 'size' in entry ? entry.size : Buffer.byteLength(entry.content),
      })),
      write: (destination, progress) => writeDownloadArchive(destination, entries, progress),
    }
  }
  const affairMatch = path.match(new RegExp('^/api/affairs/([A-Za-z0-9_-]+)/export$'))
  if (affairMatch) {
    const affair = findAffair(affairMatch[1]!)
    if (!affair || affair.mode !== 'form') throw missing()
    const responses = new Map(affairResponses(affair.id).map((r) => [r.studentId, r]))
    return csv(affair.title + '_填写结果.csv', [
      ['学号', '姓名', '状态', '提交时间', ...affair.fields.map((f) => f.label)],
      ...affairStudents(affair.id).map((s) => {
        const r = responses.get(s.studentId)
        return [
          s.studentId,
          s.name,
          r ? '已填写' : '未填写',
          r
            ? new Date(r.submittedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })
            : '',
          ...affair.fields.map((f) => r?.answers[f.key] || ''),
        ]
      }),
    ])
  }
  if (path === '/api/admin/evening/export') {
    const day = requireDay(url.searchParams.get('date') || shanghaiDate()),
      format = url.searchParams.get('format') || 'xlsx'
    if (!['xlsx', 'zip'].includes(format))
      throw createError({ statusCode: 400, message: '请选择 Excel 或 ZIP 导出格式' })
    const { book, files } = dailyLeaveExport(day)
    const excelName = `晚自习名单-${day}.xlsx`
    return {
      name: format === 'zip' ? `请假名单与假条-${day}.zip` : `晚自习名单-${day}.xlsx`,
      mime:
        format === 'zip'
          ? 'application/zip'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      files: [{ name: excelName, size: null }, ...(format === 'zip' ? files : [])],
      write: async (destination, progress) => {
        progress({ type: 'start', index: 0 })
        const content = Buffer.from(await book.xlsx.writeBuffer())
        if (format === 'xlsx') {
          await writeFile(destination, content, { mode: 0o600 })
          progress({ type: 'complete', index: 0, size: content.length })
        } else
          await writeDownloadArchive(
            destination,
            [{ name: excelName, content }, ...files],
            progress,
          )
      },
    }
  }
  const backupMatch = path.match(new RegExp('^/api/admin/backups/([^/]+)$'))
  if (backupMatch) {
    const name = decodeURIComponent(backupMatch[1]!)
    if (!backupNamePattern.test(name)) throw missing()
    // Verify the backup without following symlinks, including when the prepared copy is requested again.
    let fd: number | undefined
    let size: number
    try {
      fd = openSync(join(backupDirectory(), name), constants.O_RDONLY | constants.O_NOFOLLOW)
      const info = fstatSync(fd)
      if (!info.isFile()) throw missing()
      size = info.size
    } catch {
      throw missing()
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
    return single(name, 'application/vnd.sqlite3', size, async (destination, onBytes) => {
      const descriptor = openSync(
        join(backupDirectory(), name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      )
      const input = createReadStream('', { fd: descriptor, autoClose: true })
      let bytes = 0
      input.on('data', (chunk) => {
        bytes += Buffer.byteLength(chunk)
        onBytes(bytes)
      })
      await pipeline(input, createWriteStream(destination, { mode: 0o600 }))
    })
  }
  throw missing()
}
