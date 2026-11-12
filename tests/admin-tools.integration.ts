import { strict as assert } from 'node:assert'
import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { addDays, shanghaiDate, weekdayOf } from '../shared/evening'
import { previewPdf } from './preview-fixtures'

type Api = (path: string, options?: RequestInit, authenticated?: boolean) => Promise<Response>
export async function runAdminToolsChecks(
  api: Api,
  dataDir: string,
  failPut: () => void,
  objectCount: () => number,
  pass: (message: string) => void,
) {
  const dates = [addDays(shanghaiDate(), 45), addDays(shanghaiDate(), 47)]
  const body = (
    options: {
      ids?: string[]
      dates?: string[]
      kind?: string
      reason?: string
      proof?: Uint8Array
      deferProof?: string
    } = {},
  ): RequestInit => {
    const form = new FormData()
    for (const id of options.ids || ['001', '002']) form.append('studentIds', id)
    for (const date of options.dates || dates) form.append('dates', date)
    for (const [key, value] of Object.entries({
      kind: options.kind || 'course',
      courseName: '批量测试课',
      startTime: '10:00',
      endTime: '11:40',
      reason: options.reason || '批量测试后补',
      deferProof: options.deferProof || 'true',
    }))
      form.append(key, value)
    if (options.proof) form.append('proof', new File([options.proof], '批量假条.pdf'))
    return { method: 'POST', body: form }
  }
  const path = '/api/admin/leaves/batch'
  const report = async (date: string) => (await api('/api/admin/leaves?date=' + date)).json()
  assert.equal((await api(path + '?dates=' + dates.join(','), {}, false)).status, 401)
  assert.equal((await api(path, body(), false)).status, 401)
  assert.equal(
    (await api(path, { ...body(), headers: { Origin: 'https://evil.example' } })).status,
    403,
  )
  for (const options of [
    { ids: [] },
    { dates: [] },
    { ids: ['001', '001'] },
    { dates: [dates[0]!, dates[0]!] },
    { dates: ['2030-02-30'] },
    { dates: ['2020-01-01'] },
    { ids: ['001', 'missing'] },
    { deferProof: 'false' },
    { proof: Buffer.from('not a pdf') },
  ]) {
    assert.equal((await api(path, body(options))).status, 400, JSON.stringify(options))
  }
  assert.equal((await report(dates[0]!)).leaves.length, 0)
  const metadata = await (await api(path + '?dates=' + [...dates].reverse().join(','))).json()
  assert.deepEqual(metadata.dates, dates)
  assert.deepEqual(
    metadata.students.map((s: any) => s.studentId),
    ['001', '002'],
  )
  assert.equal(
    (await api(path, body({ dates: Array.from({ length: 32 }, (_, i) => addDays(dates[0]!, i)) })))
      .status,
    400,
  )
  const oversized = await api(
    path,
    body({
      ids: Array.from({ length: 17 }, (_, i) => `limit-${i}`),
      dates: Array.from({ length: 30 }, (_, i) => addDays(dates[0]!, i)),
    }),
  )
  assert.equal(oversized.status, 400)
  assert((await oversized.json()).message.includes('500'))
  const created = await api(path, body())
  assert.equal(created.status, 200, await created.clone().text())
  assert.equal((await created.json()).count, 4)
  assert.equal(
    (await report(dates[0]!)).leaves.filter((l: any) => l.reason === '批量测试后补').length,
    2,
  )
  // A conflict in one date prevents saving a different, otherwise valid date.
  const fresh = addDays(dates[1]!, 1)
  const conflict = await api(path, body({ dates: [fresh, dates[0]!] }))
  assert.equal(conflict.status, 400)
  assert((await conflict.json()).data.issues.length >= 2)
  assert.equal((await report(fresh)).leaves.length, 0)
  async function student(name: string, studentId: string): Promise<Api> {
    const identity = await api(
      '/api/leave/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, studentId }),
      },
      false,
    )
    assert.equal(identity.status, 200)
    const cookie = identity.headers.get('set-cookie')!.split(';')[0]!
    return (path, options = {}) =>
      api(
        path,
        { ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), cookie } },
        false,
      )
  }
  const a = await student('测试甲', '001'),
    b = await student('测试乙', '002')
  assert.equal((await a(path + '?dates=' + dates.join(','))).status, 401)
  const mine = (await (await a('/api/leave/me')).json()).leaves.filter(
    (l: any) => l.reason === '批量测试后补',
  )
  assert.equal(mine.length, 2)
  assert(mine.every((l: any) => l.studentId === '001' && !l.proof))
  assert.equal(
    (
      await b(`/api/leave/requests/${mine.find((l: any) => l.date === dates[0]).id}`, {
        method: 'DELETE',
      })
    ).status,
    404,
  )
  assert.equal(
    (
      await a(`/api/leave/requests/${mine.find((l: any) => l.date === dates[0]).id}`, {
        method: 'DELETE',
      })
    ).status,
    200,
  )
  assert.equal((await report(dates[0]!)).leaves.filter((l: any) => !l.cancelledAt).length, 1)
  pass(
    'Batch leave: multiple students × dates, authorization, validation, duplicate rollback and own-only query/cancellation',
  )

  const proofDates = dates.map((date) => addDays(date, 7))
  const before = objectCount()
  failPut()
  const failed = await api(
    path,
    body({ dates: proofDates, proof: previewPdf(), reason: '整批上传失败' }),
  )
  assert.equal(failed.status, 502)
  assert.equal(objectCount(), before, 'Successful objects from a failed batch must be rolled back')
  assert.equal((await report(proofDates[0]!)).leaves.length, 0)
  const withProof = await api(
    path,
    body({ dates: proofDates, proof: previewPdf(), reason: '整批共用假条' }),
  )
  assert.equal(withProof.status, 200, await withProof.clone().text())
  const proofRecords = (await Promise.all(proofDates.map(report))).flatMap((day) => day.leaves)
  assert.equal(proofRecords.length, 4)
  assert.equal(new Set(proofRecords.map((l) => l.proof.id)).size, 4)
  const own = proofRecords.find((l) => l.studentId === '001'),
    other = proofRecords.find((l) => l.studentId === '002')
  assert.equal((await b(`/api/leave/proofs/${own.proof.id}`)).status, 404)
  const replacement = new FormData()
  replacement.append('proof', new File([previewPdf()], '本人更新.pdf'))
  assert.equal(
    (await a(`/api/leave/requests/${own.id}/proof`, { method: 'POST', body: replacement })).status,
    200,
  )
  assert.equal((await a(`/api/leave/proofs/${own.proof.id}`)).status, 404)
  assert.deepEqual(
    new Uint8Array(await (await b(`/api/leave/proofs/${other.proof.id}`)).arrayBuffer()),
    new Uint8Array(previewPdf()),
  )
  let monday = addDays(shanghaiDate(), 7)
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1)
  const eveningDates = [addDays(monday, 1), addDays(monday, 15)]
  const unavailable = await api(
    path,
    body({ kind: 'evening', dates: eveningDates, reason: '不符合个人安排' }),
  )
  assert.equal(unavailable.status, 400)
  const evening = await api(
    path,
    body({ ids: ['001'], kind: 'evening', dates: eveningDates, reason: '个人安排批量晚自习' }),
  )
  assert.equal(evening.status, 200, await evening.clone().text())
  for (const date of eveningDates) {
    const day = await report(date)
    assert(!day.normal.some((s: any) => s.studentId === '001'))
    const record = day.leaves.find((l: any) => l.reason === '个人安排批量晚自习')
    assert.equal(record.startAt.slice(11, 16), '18:30')
    await a(`/api/leave/requests/${record.id}`, { method: 'DELETE' })
    assert((await report(date)).normal.some((s: any) => s.studentId === '001'))
  }
  pass(
    'Batch leave: common PDF copies remain independent, failed OBS uploads roll back, and each date respects approved personal evening arrangements',
  )

  const backups = '/api/admin/backups'
  assert.equal((await api(backups, {}, false)).status, 401)
  assert.equal((await api(backups, { method: 'POST' }, false)).status, 401)
  assert.equal((await a(backups)).status, 401)
  assert.equal(
    (await api(backups, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status,
    403,
  )
  assert.equal((await (await api(backups)).json()).backups.length, 0)
  const createdBackup = await api(backups, { method: 'POST' })
  assert.equal(createdBackup.status, 200, await createdBackup.clone().text())
  const { name } = await createdBackup.json()
  const list = await (await api(backups)).json()
  assert.equal(list.backups[0].name, name)
  assert(list.totalBytes > 0)
  assert(!JSON.stringify(list).includes(dataDir))
  assert.equal((await api(`${backups}/${name}`, {}, false)).status, 401)
  assert.equal((await a(`${backups}/${name}`)).status, 401)
  const downloaded = await api(`${backups}/${name}`)
  assert.equal(downloaded.status, 200)
  assert.equal(downloaded.headers.get('cache-control'), 'no-store')
  assert(downloaded.headers.get('content-disposition')!.startsWith('attachment;'))
  const bytes = new Uint8Array(await downloaded.arrayBuffer())
  assert.equal(Buffer.from(bytes.subarray(0, 16)).toString(), 'SQLite format 3\0')
  const downloadedPath = join(dataDir, 'downloaded-test.sqlite')
  await writeFile(downloadedPath, bytes)
  const snapshot = new Database(downloadedPath, { readonly: true }),
    live = new Database(join(dataDir, 'classroom.sqlite'), { readonly: true })
  try {
    assert.equal((snapshot.query('PRAGMA integrity_check').get() as any).integrity_check, 'ok')
    for (const table of [
      'students',
      'tasks',
      'affairs',
      'form_responses',
      'submissions',
      'evening_settings',
      'evening_adjustments',
      'leave_requests',
      'leave_proofs',
    ]) {
      assert.deepEqual(
        snapshot.query(`SELECT COUNT(*) AS n FROM ${table}`).get(),
        live.query(`SELECT COUNT(*) AS n FROM ${table}`).get(),
        table,
      )
    }
  } finally {
    snapshot.close()
    live.close()
  }
  assert.equal((await lstat(join(dataDir, 'backups', name))).mode & 0o777, 0o600)
  const second = await (await api(backups, { method: 'POST' })).json()
  assert.notEqual(second.name, name)
  const fakeName = 'classroom-2099-01-01T00-00-00-000Z.sqlite'
  await symlink(join(dataDir, 'classroom.sqlite'), join(dataDir, 'backups', fakeName))
  await mkdir(join(dataDir, 'backups', 'classroom-2099-01-02T00-00-00-000Z.sqlite'))
  await writeFile(join(dataDir, 'backups', '.creating-incomplete.sqlite'), 'partial')
  assert.equal((await api(`${backups}/${fakeName}`)).status, 404)
  assert.equal((await api(`${backups}/classroom-2099-01-02T00-00-00-000Z.sqlite`)).status, 404)
  assert.equal((await api(`${backups}/classroom.sqlite`)).status, 404)
  assert.equal((await api(`${backups}/..%2Fclassroom.sqlite`)).status, 404)
  assert.equal((await (await api(backups)).json()).backups.length, 2)
  pass(
    'Backup page API: administrator-only create/list/download, consistent live WAL snapshot, all business tables, integrity check, private permissions and path/symlink protection',
  )
}
