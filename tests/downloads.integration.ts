import { strict as assert } from 'node:assert'
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { addDays, shanghaiDate, weekdayOf } from '../shared/evening'
import { previewPdf, previewPng } from './preview-fixtures'

type Api = (path: string, options?: RequestInit, authenticated?: boolean) => Promise<Response>
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export async function runDownloadChecks(
  api: Api,
  dataDir: string,
  objects: Map<string, Uint8Array>,
  pass: (message: string) => void,
  pauseDownload: (path: string) => () => void,
) {
  assert.equal(
    (await api('/api/downloads', json({ source: '/api/roster/export' }), false)).status,
    401,
  )
  assert.equal(
    (await api('/api/downloads', json({ source: 'https://evil.example/file' }))).status,
    404,
  )
  assert.equal((await api('/api/downloads', json({ source: '/api/health' }))).status, 404)
  assert.equal(
    (
      await api('/api/downloads', {
        ...json({ source: '/api/roster/export' }),
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      })
    ).status,
    403,
  )
  async function prepare(source: string, request: Api = api) {
    const created = await request('/api/downloads', json({ source }))
    assert.equal(created.status, 200, await created.clone().text())
    const initial = await created.json()
    assert.equal(initial.status, 'preparing')
    assert.equal(initial.url, null)
    assert.equal(initial.phase, 'queued')
    assert(initial.files.length > 0)
    assert(initial.files.every((file: any) => file.status === 'pending'))
    assert(!JSON.stringify(initial).includes('objectKey'), 'Storage keys stay private')
    let job = initial
    for (let i = 0; i < 200; i++) {
      const status = await request(`/api/downloads/${initial.id}`)
      assert.equal(status.status, 200, await status.clone().text())
      job = await status.json()
      if (job.status !== 'preparing') return job
      await Bun.sleep(20)
    }
    throw new Error('Download preparation timed out')
  }
  let monday = addDays(shanghaiDate(), 7)
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1)
  const date = addDays(monday, 15)
  const batch = (
    kind: string,
    ids: string[],
    proof?: Buffer,
    startTime = '13:00',
    endTime = '14:00',
    reason = '导出假条测试',
  ) => {
    const form = new FormData()
    for (const id of ids) form.append('studentIds', id)
    form.append('dates', date)
    for (const [key, value] of Object.entries({
      kind,
      courseName: '测试课程/安全',
      startTime,
      endTime,
      reason,
      deferProof: 'true',
    }))
      form.append(key, value)
    if (proof) form.append('proof', new File([proof], '同名原始假条.pdf'))
    return { method: 'POST', body: form }
  }
  assert.equal(
    (await api('/api/admin/leaves/batch', batch('evening', ['001'], previewPdf()))).status,
    200,
  )
  assert.equal(
    (await api('/api/admin/leaves/batch', batch('course', ['001', '002'], previewPdf()))).status,
    200,
  )
  assert.equal(
    (
      await api(
        '/api/admin/leaves/batch',
        batch('course', ['002'], undefined, '15:00', '16:00', '导出待补假条'),
      )
    ).status,
    200,
  )
  const identity = await api(
    '/api/leave/session',
    json({ name: '测试甲', studentId: '001' }),
    false,
  )
  const aCookie = identity.headers.get('set-cookie')!.split(';')[0]!
  const a: Api = (path, options = {}) => {
    const headers = new Headers(options.headers)
    headers.set('cookie', aCookie)
    return api(path, { ...options, headers }, false)
  }
  let report = await (await api('/api/admin/leaves?date=' + date)).json()
  const evening = report.leaves.find((l: any) => l.kind === 'evening' && !l.cancelledAt)
  const old = evening.proof.id
  const replacement = new FormData()
  replacement.append('proof', new File([previewPng()], '最新假条.png'))
  assert.equal(
    (await a(`/api/leave/requests/${evening.id}/proof`, { method: 'POST', body: replacement }))
      .status,
    200,
  )
  const cancelled = report.leaves.find(
    (l: any) => l.kind === 'course' && l.studentId === '001' && l.reason === '导出假条测试',
  )
  assert.equal((await a(`/api/leave/requests/${cancelled.id}`, { method: 'DELETE' })).status, 200)
  report = await (await api('/api/admin/leaves?date=' + date)).json()
  const job = await prepare(`/api/admin/evening/export?date=${date}&format=zip`)
  assert.equal(job.status, 'ready', job.error)
  assert.equal(job.phase, 'ready')
  assert(
    job.files.every((file: any) => file.status === 'ready' && file.preparedBytes === file.size),
  )
  assert.equal(job.name, `请假名单与假条-${date}.zip`)
  assert(Date.parse(job.expiresAt) > Date.now() + 58 * 60_000)
  assert.equal((await api(job.url, {}, false)).status, 401)
  assert.equal((await a(job.url)).status, 404)
  const response = await api(job.url)
  assert.equal(response.headers.get('content-length'), String(job.size))
  assert.equal(response.headers.get('accept-ranges'), 'bytes')
  assert.equal(response.headers.get('cache-control'), 'no-store, no-transform')
  assert.equal(response.headers.get('transfer-encoding'), null)
  const bytes = new Uint8Array(await response.arrayBuffer())
  assert.equal(bytes.length, job.size)
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const proofs = Object.values(zip.files).filter(
    (file) => !file.dir && file.name.startsWith('假条/'),
  )
  assert.equal(proofs.length, 2)
  assert.deepEqual(
    job.files.map((file: any) => file.name).sort(),
    Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
      .sort(),
  )
  for (const file of job.files)
    assert.equal(file.size, (await zip.file(file.name)!.async('uint8array')).length)
  assert(
    proofs.some((file) => file.name.includes('_001_测试甲_晚自习_') && file.name.endsWith('.png')),
  )
  assert(
    proofs.some(
      (file) =>
        file.name.includes('_002_测试乙_普通课程_测试课程_安全_1300-1400_') &&
        file.name.endsWith('.pdf'),
    ),
  )
  assert(!proofs.some((file) => file.name.includes('_001_测试甲_普通课程_')))
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await zip.file(`晚自习名单-${date}.xlsx`)!.async('nodebuffer'))
  const sheet = book.getWorksheet('请假名单')!
  assert.equal(sheet.rowCount, 4)
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    if (row.getCell(9).value === '已交') assert(zip.file(String(row.getCell(13).value)))
    else {
      assert.equal(row.getCell(9).value, '待补')
      assert.equal(row.getCell(13).text, '')
    }
  }
  assert.deepEqual(
    await zip.file(proofs.find((file) => file.name.endsWith('.png'))!.name)!.async('nodebuffer'),
    previewPng(),
  )
  assert.equal((await api(`/api/leave/proofs/${old}`)).status, 404)
  // Range, suffix range, invalid ranges and HEAD work against a complete persistent file.
  const range = await api(job.url, { headers: { Range: 'bytes=0-15' } })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), `bytes 0-15/${bytes.length}`)
  assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.slice(0, 16))
  const tail = await api(job.url, { headers: { Range: 'bytes=-8' } })
  assert.equal(tail.status, 206)
  assert.deepEqual(new Uint8Array(await tail.arrayBuffer()), bytes.slice(-8))
  assert.equal((await api(job.url, { headers: { Range: 'bytes=999999999-' } })).status, 416)
  const head = await api(job.url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('x-download-size'), String(bytes.length))
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  assert.equal((await api(job.url)).status, 200, 'Ready files can be downloaded again')
  const empty = await prepare(
    `/api/admin/evening/export?date=${addDays(shanghaiDate(), 100)}&format=zip`,
  )
  const emptyZip = await JSZip.loadAsync(await (await api(empty.url)).arrayBuffer(), {
    checkCRC32: true,
  })
  assert.equal(Object.values(emptyZip.files).filter((file) => !file.dir).length, 1)
  // Missing OBS objects produce a failed job, never an incomplete ZIP.
  const currentProof = report.leaves.find((l: any) => l.id === evening.id).proof.id
  const objectEntry = [...objects.entries()].find(([key]) =>
    key.includes('/' + currentProof + '/'),
  )!
  objects.delete(objectEntry[0])
  const failed = await prepare(`/api/admin/evening/export?date=${date}&format=zip`)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.url, null)
  assert.equal(failed.phase, 'failed')
  assert(failed.files.some((file: any) => file.status === 'failed'))
  objects.set(...objectEntry)
  const mine = await prepare(`/api/leave/proofs/${currentProof}`, a)
  assert.equal(mine.status, 'ready')
  assert.equal((await api(mine.url)).status, 404)
  assert.deepEqual(Buffer.from(await (await a(mine.url)).arrayBuffer()), previewPng())
  assert.equal(mine.files.length, 1)
  assert.equal(mine.files[0].name, '最新假条.png')
  const resume = pauseDownload(objectEntry[0])
  let waiting: any
  try {
    const response = await a(
      '/api/downloads',
      json({ source: `/api/leave/proofs/${currentProof}` }),
    )
    assert.equal(response.status, 200)
    waiting = await response.json()
    let status: any
    for (let i = 0; i < 100; i++) {
      status = await (await a(`/api/downloads/${waiting.id}`)).json()
      if (status.files[0].preparedBytes > 0) break
      await Bun.sleep(20)
    }
    assert.equal(status.phase, 'preparing')
    assert.equal(status.files[0].status, 'preparing')
    assert(
      status.files[0].preparedBytes > 0 && status.files[0].preparedBytes < status.files[0].size,
    )
    assert.equal(status.url, null)
    assert.equal((await a(`/api/downloads/${waiting.id}/file`)).status, 409)
    assert.equal((await api(`/api/downloads/${waiting.id}`)).status, 404)
  } finally {
    resume()
  }
  for (let i = 0; i < 100; i++) {
    const status = await (await a(`/api/downloads/${waiting.id}`)).json()
    if (status.status === 'ready') break
    await Bun.sleep(20)
  }
  assert.equal((await a(`/api/downloads/${waiting.id}/file`)).status, 200)
  pass(
    'Prepared downloads: full daily ZIP with renamed current proofs and matching Excel, cancelled/history/pending filtering, explicit failures, owner checks, Content-Length, HEAD and byte ranges',
  )
  // Expiry prevents new reads; the periodic cleaner deletes only download copies.
  const metadataPath = join(dataDir, 'downloads', job.id, 'metadata.json')
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  metadata.expiresAt = new Date(Date.now() - 1000).toISOString()
  await writeFile(metadataPath, JSON.stringify(metadata))
  assert.equal((await api(job.url)).status, 410)
  const saved = process.env.DATA_DIR
  process.env.DATA_DIR = dataDir
  try {
    const { cleanupDownloads } = await import('../server/utils/downloads')
    await cleanupDownloads()
  } finally {
    if (saved === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = saved
  }
  await assert.rejects(access(join(dataDir, 'downloads', job.id)))
  assert((await readdir(join(dataDir, 'backups'))).length > 0)
  assert.equal((await api(`/api/leave/proofs/${currentProof}`)).status, 200)
  // Avoid introducing a duplicate evening leave in the later browser scenario.
  assert.equal((await a(`/api/leave/requests/${evening.id}`, { method: 'DELETE' })).status, 200)
  pass(
    'Prepared download expiry blocks reads and cleans temporary files while preserving OBS attachments and original backups',
  )
}
