import { createHash } from 'node:crypto'
import { constants, createReadStream, openSync, fstatSync, closeSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile, rename, stat, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  createError,
  getCookie,
  getHeader,
  setHeaders,
  setResponseStatus,
  sendStream,
  type H3Event,
} from 'h3'
import { appConfig } from './config'
import { isAdmin, rateLimit } from './auth'
import { requireLeaveStudent } from './leave-auth'
import { resolveDownloadSource, type DownloadSource } from './download-source'
import type { PreparedDownload } from '../../shared/downloads'

interface DownloadJob extends Omit<PreparedDownload, 'url'> {
  owner: string
  source: string
  mime: string
  createdAt: string
}
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const root = () => resolve(appConfig().dataDir, 'downloads')
const running = new Map<string, Promise<void>>()
const liveJobs = new Map<string, DownloadJob>()
const readers = new Map<string, number>()
let active = 0
const queue: Array<() => void> = []
export function downloadTtlMinutes() {
  const value = Number(process.env.DOWNLOAD_TTL_MINUTES)
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 60
}
function owner(event: H3Event) {
  const token = isAdmin(event)
    ? getCookie(event, 'classroom_session')
    : (requireLeaveStudent(event), getCookie(event, 'classroom_leave_session'))
  return createHash('sha256').update(token!).digest('hex')
}
async function save(job: DownloadJob) {
  const directory = join(root(), job.id)
  await writeFile(join(directory, 'metadata.new'), JSON.stringify(job), { mode: 0o600 })
  await rename(join(directory, 'metadata.new'), join(directory, 'metadata.json'))
}
function view(job: DownloadJob): PreparedDownload {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    phase: job.phase,
    files: job.files.map((file) => ({ ...file })),
    size: job.size,
    expiresAt: job.expiresAt,
    error: job.error,
    url: job.status === 'ready' ? `/api/downloads/${job.id}/file` : null,
  }
}
export async function prepareDownload(event: H3Event, source: string) {
  const resolved = resolveDownloadSource(event, source),
    identity = owner(event)
  rateLimit(event, 'prepare-download', 120, 3600_000)
  if (running.size >= 20)
    throw createError({ statusCode: 429, message: '当前等待准备的下载较多，请稍后重试' })
  const job: DownloadJob = {
    id: crypto.randomUUID(),
    owner: identity,
    source,
    name: resolved.name,
    mime: resolved.mime,
    status: 'preparing',
    phase: 'queued',
    files: resolved.files.map((file) => ({
      name: file.name,
      size: file.size,
      status: 'pending',
      preparedBytes: 0,
    })),
    size: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  }
  await mkdir(join(root(), job.id), { recursive: true, mode: 0o700 })
  await save(job)
  const initial = view(job)
  liveJobs.set(job.id, job)
  const work = (async () => {
    if (active >= 2) await new Promise<void>((resolve) => queue.push(resolve))
    else active++
    try {
      await produce(job, resolved)
    } finally {
      const next = queue.shift()
      if (next) next()
      else active--
    }
  })()
  running.set(job.id, work)
  void work
    .finally(() => {
      running.delete(job.id)
      liveJobs.delete(job.id)
    })
    .catch(() => console.error('[Download] Job metadata failed'))
  return initial
}
async function produce(job: DownloadJob, source: DownloadSource) {
  const directory = join(root(), job.id)
  try {
    job.phase = 'preparing'
    await source.write(join(directory, 'payload.part'), (update) => {
      if (update.type === 'packing') {
        job.phase = 'packing'
        return
      }
      const file = job.files[update.index]!
      if (update.type === 'start') file.status = 'preparing'
      else if (update.type === 'bytes') file.preparedBytes = update.bytes
      else {
        file.status = 'ready'
        file.size = update.size
        file.preparedBytes = update.size
      }
    })
    job.size = (await stat(join(directory, 'payload.part'))).size
    await rename(join(directory, 'payload.part'), join(directory, 'payload'))
    job.status = 'ready'
    job.phase = 'ready'
  } catch {
    await rm(join(directory, 'payload.part'), { force: true })
    job.status = 'failed'
    job.phase = 'failed'
    for (const file of job.files) if (file.status === 'preparing') file.status = 'failed'
    job.error = '文件准备失败，请检查云存储连接、文件状态和服务器空间后重试'
  }
  job.expiresAt = new Date(Date.now() + downloadTtlMinutes() * 60_000).toISOString()
  await save(job)
}
async function load(event: H3Event, id: string, revalidateSource = true) {
  const identity = owner(event)
  if (!idPattern.test(id)) throw createError({ statusCode: 404, message: '下载任务不存在' })
  let job: DownloadJob
  try {
    const directory = join(root(), id)
    if (!(await lstat(directory)).isDirectory()) throw new Error('Invalid directory')
    job = liveJobs.get(id) || JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
  } catch {
    throw createError({ statusCode: 404, message: '下载任务不存在或已清理' })
  }
  if (job.id !== id || job.owner !== identity)
    throw createError({ statusCode: 404, message: '下载任务不存在' })
  if (Date.parse(job.expiresAt) <= Date.now())
    throw createError({ statusCode: 410, message: '临时文件已过期，请重新准备下载' })
  // Recheck the source before serving bytes. Status polling stays cheap during large exports.
  if (revalidateSource) resolveDownloadSource(event, job.source)
  if (job.status === 'preparing' && !running.has(id)) {
    job.status = 'failed'
    job.phase = 'failed'
    job.error = '服务已重启，请重新准备下载'
    job.expiresAt = new Date(Date.now() + downloadTtlMinutes() * 60_000).toISOString()
    await save(job)
  }
  return job
}
export async function downloadStatus(event: H3Event, id: string) {
  return view(await load(event, id, false))
}
export async function sendPreparedDownload(event: H3Event, id: string) {
  const job = await load(event, id)
  if (job.status !== 'ready')
    throw createError({
      statusCode: job.status === 'failed' ? 502 : 409,
      message: job.error || '文件尚未准备完成',
    })
  let fd: number | undefined
  try {
    fd = openSync(join(root(), id, 'payload'), constants.O_RDONLY | constants.O_NOFOLLOW)
    if (!fstatSync(fd).isFile()) throw new Error('Invalid payload')
    const range = getHeader(event, 'range')
    let start = 0,
      end = job.size - 1
    if (range) {
      const match = range.match(/^bytes=([0-9]*)-([0-9]*)$/)
      if (!match || (!match[1] && !match[2]) || !job.size)
        throw createError({ statusCode: 416, message: '下载范围无效' })
      if (!match[1]) start = Math.max(0, job.size - Number(match[2]))
      else {
        start = Number(match[1])
        if (match[2]) end = Math.min(end, Number(match[2]))
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= job.size
      )
        throw createError({ statusCode: 416, message: '下载范围无效' })
      setResponseStatus(event, 206)
      setHeaders(event, { 'Content-Range': `bytes ${start}-${end}/${job.size}` })
    }
    setHeaders(event, {
      'Content-Type': job.mime,
      'Content-Length': range ? end - start + 1 : job.size,
      'Accept-Ranges': 'bytes',
      // Keep proxies from recompressing a completed file into a chunked response.
      'Cache-Control': 'no-store, no-transform',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(job.name)}`,
      'X-Download-Expires-At': job.expiresAt,
      'X-Download-Size': job.size,
    })
    if (event.method === 'HEAD') {
      closeSync(fd)
      fd = undefined
      return ''
    }
    if (!event.node.res.socket && typeof Bun !== 'undefined') {
      // Nitro's Bun adapter passes this body to Response directly. Keeping a native
      // file Blob lets Bun serve a known-length file instead of chunked encoding.
      closeSync(fd)
      fd = undefined
      const file = Bun.file(join(root(), id, 'payload'))
      const body = range ? file.slice(start, end + 1) : file
      return await sendStream(event, body as unknown as Parameters<typeof sendStream>[1])
    }
    const stream = createReadStream('', {
      fd,
      autoClose: true,
      ...(job.size ? { start, end } : {}),
    })
    fd = undefined
    readers.set(id, (readers.get(id) || 0) + 1)
    stream.once('close', () => {
      const count = (readers.get(id) || 1) - 1
      if (count) readers.set(id, count)
      else readers.delete(id)
    })
    event.node.res.once('close', () => stream.destroy())
    return await sendStream(event, stream)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    if ((error as { statusCode?: number }).statusCode === 416) {
      setHeaders(event, { 'Content-Range': `bytes */${job.size}` })
      throw error
    }
    throw createError({ statusCode: 410, message: '临时文件不可用，请重新准备下载' })
  }
}
export async function directDownload(event: H3Event, source: string) {
  const job = await prepareDownload(event, source)
  await running.get(job.id)
  return sendPreparedDownload(event, job.id)
}
export async function cleanupDownloads(now = Date.now()) {
  await mkdir(root(), { recursive: true, mode: 0o700 })
  for (const entry of await readdir(root(), { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !idPattern.test(entry.name) ||
      running.has(entry.name) ||
      readers.has(entry.name)
    )
      continue
    const directory = join(root(), entry.name)
    let expired = false
    try {
      const job = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
      expired = Date.parse(job.expiresAt) <= now
    } catch {
      expired = (await stat(directory)).mtimeMs + 24 * 3600_000 <= now
    }
    if (expired) await rm(directory, { recursive: true, force: true })
  }
}
