import { strict as assert } from 'node:assert'
import ExcelJS from 'exceljs'
import { addDays, shanghaiDate, weekdayOf } from '../shared/evening'

type Api = (path: string, options?: RequestInit, authenticated?: boolean) => Promise<Response>
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export async function runLeaveChecks(
  api: Api,
  failPut: () => void,
  pass: (message: string) => void,
) {
  const roster = [
    { name: '测试甲', studentId: '001' },
    { name: '测试乙', studentId: '002' },
  ]
  await api('/api/roster', json({ students: roster }))
  const today = shanghaiDate()
  let monday = addDays(today, 7)
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1)
  const tuesday = addDays(monday, 1),
    thursday = addDays(monday, 3)
  const settings = {
    enabled: true,
    weekdays: [1, 3],
    startDate: today,
    endDate: addDays(monday, 21),
    startTime: '18:30',
    endTime: '20:30',
    originalNotice: '  晚自习原通知\n保留空格与换行。  ',
  }
  assert.equal((await api('/api/admin/evening', {}, false)).status, 401)
  assert.equal((await api('/api/admin/evening/export?date=' + monday, {}, false)).status, 401)
  assert.equal((await api('/api/leave/me', {}, false)).status, 401)
  assert.equal(
    (await api('/api/admin/evening', json({ ...settings, weekdays: [6] }, 'PUT'))).status,
    400,
  )
  assert.equal(
    (await api('/api/admin/evening', json({ ...settings, endDate: '2026-02-30' }, 'PUT'))).status,
    400,
  )
  assert.equal((await api('/api/admin/evening', json(settings, 'PUT'))).status, 200)
  const publicConfig = await (await api('/api/leave/config', {}, false)).json()
  assert.equal(publicConfig.settings.originalNotice, settings.originalNotice)
  assert(!JSON.stringify(publicConfig).includes('测试甲'))
  assert.equal(
    (await api('/api/leave/session', json({ name: '错', studentId: '001' }), false)).status,
    400,
  )
  async function identity(name: string, studentId: string) {
    const res = await api('/api/leave/session', json({ name, studentId }), false)
    assert.equal(res.status, 200)
    assert(res.headers.get('set-cookie')!.includes('HttpOnly'))
    return res.headers.get('set-cookie')!.split(';')[0]!
  }
  const aCookie = await identity('测试甲', '001'),
    bCookie = await identity('测试乙', '002')
  const student =
    (cookie: string): Api =>
    (path, options = {}) => {
      const headers = new Headers(options.headers)
      headers.set('cookie', cookie)
      return api(path, { ...options, headers }, false)
    }
  const a = student(aCookie),
    b = student(bCookie)
  const report = async (day: string) => (await api('/api/admin/leaves?date=' + day)).json()
  const recurring = {
    kind: 'permanent',
    sourceWeekday: 1,
    targetWeekday: 2,
    effectiveFrom: monday,
    reason: '每周调换',
  }
  assert.equal(
    (await a('/api/leave/adjustments', json({ ...recurring, targetWeekday: 6 }))).status,
    400,
  )
  assert.equal(
    (await a('/api/leave/adjustments', json({ ...recurring, targetWeekday: 3 }))).status,
    400,
  )
  assert.equal(
    (
      await a(
        '/api/leave/adjustments',
        json({ ...recurring, effectiveFrom: addDays(settings.endDate, 1) }),
      )
    ).status,
    400,
  )
  const requested = await a('/api/leave/adjustments', json(recurring))
  assert.equal(requested.status, 200, await requested.clone().text())
  const pending = (await requested.json()).adjustment
  assert.equal(pending.status, 'pending')
  assert.equal((await report(monday)).normal.length, 2)
  assert.equal((await report(tuesday)).normal.length, 0)
  assert.equal(
    (
      await api(
        `/api/admin/evening/adjustments/${pending.id}`,
        json({ action: 'approve', reviewNote: '同意' }, 'PATCH'),
      )
    ).status,
    200,
  )
  assert.equal((await report(monday)).normal.length, 1)
  assert.equal((await report(tuesday)).normal[0].studentId, '001')
  assert.equal((await a('/api/leave/adjustments', json(recurring))).status, 400)
  const dated = {
    studentId: '002',
    kind: 'dates',
    sourceDate: monday,
    targetDate: thursday,
    reason: '单次调换',
  }
  assert.equal((await api('/api/admin/evening/adjustments', json(dated))).status, 200)
  assert.equal((await report(monday)).normal.length, 0)
  assert.equal((await report(thursday)).normal[0].studentId, '002')
  assert.equal((await api('/api/admin/evening/adjustments', json(dated))).status, 400)
  assert.equal(
    (await api('/api/admin/evening', json({ ...settings, weekdays: [1, 2, 3] }, 'PUT'))).status,
    400,
  )
  const single = await a(
    '/api/leave/adjustments',
    json({
      kind: 'dates',
      sourceDate: addDays(tuesday, 7),
      targetDate: addDays(thursday, 7),
      reason: '固定调整后的一次变化',
    }),
  )
  assert.equal(single.status, 200, await single.clone().text())
  const singleId = (await single.json()).adjustment.id
  assert.equal(
    (await api(`/api/admin/evening/adjustments/${singleId}`, json({ action: 'approve' }, 'PATCH')))
      .status,
    200,
  )
  assert.equal((await report(addDays(tuesday, 7))).normal.length, 0)
  assert.equal((await report(addDays(thursday, 7))).normal[0].studentId, '001')
  assert.equal(
    (await api(`/api/admin/evening/adjustments/${pending.id}`, json({ action: 'revoke' }, 'PATCH')))
      .status,
    400,
    'Dependent dated adjustment must be handled before revoking its recurring source',
  )
  pass(
    'Leave: inclusive schedule dates, permanent/date adjustments, approval gating, admin direct changes and conflict validation',
  )

  const pendingBody = {
    kind: 'permanent',
    sourceWeekday: 3,
    targetWeekday: 5,
    effectiveFrom: monday,
    reason: '撤回测试',
  }
  const withdrawn = (await (await a('/api/leave/adjustments', json(pendingBody))).json()).adjustment
  assert.equal(
    (await b(`/api/leave/adjustments/${withdrawn.id}`, { method: 'DELETE' })).status,
    400,
  )
  assert.equal(
    (await a(`/api/leave/adjustments/${withdrawn.id}`, { method: 'DELETE' })).status,
    200,
  )
  assert.equal(
    (
      await api(
        `/api/admin/evening/adjustments/${withdrawn.id}`,
        json({ action: 'approve' }, 'PATCH'),
      )
    ).status,
    400,
  )
  const rejected = (await (await a('/api/leave/adjustments', json(pendingBody))).json()).adjustment
  assert.equal(
    (
      await api(
        `/api/admin/evening/adjustments/${rejected.id}`,
        json({ action: 'reject', reviewNote: '日期不合适' }, 'PATCH'),
      )
    ).status,
    200,
  )
  const conflict = (await (await b('/api/leave/adjustments', json(pendingBody))).json()).adjustment
  const direct = await api(
    '/api/admin/evening/adjustments',
    json({ ...pendingBody, studentId: '002' }),
  )
  const directId = (await direct.json()).adjustment.id
  assert.equal(
    (
      await api(
        `/api/admin/evening/adjustments/${conflict.id}`,
        json({ action: 'approve' }, 'PATCH'),
      )
    ).status,
    400,
  )
  assert.equal(
    (await api(`/api/admin/evening/adjustments/${directId}`, json({ action: 'revoke' }, 'PATCH')))
      .status,
    200,
  )
  assert.equal(
    (
      await api(
        `/api/admin/evening/adjustments/${conflict.id}`,
        json({ action: 'approve' }, 'PATCH'),
      )
    ).status,
    200,
  )
  pass(
    'Leave: own pending withdrawal, rejection notes, approval-time conflict checks and revocation',
  )

  function leaveBody(changes: Record<string, string> = {}, proof?: string) {
    const form = new FormData()
    for (const [k, v] of Object.entries({
      kind: 'evening',
      date: tuesday,
      reason: '身体不适',
      deferProof: 'true',
      ...changes,
    }))
      form.append(k, v)
    if (proof !== undefined) form.append('proof', new File([proof], '假条.pdf'))
    return { method: 'POST', body: form }
  }
  assert.equal((await a('/api/leave/requests', leaveBody({ deferProof: 'false' }))).status, 400)
  assert.equal((await a('/api/leave/requests', leaveBody({ date: monday }))).status, 400)
  assert.equal((await a('/api/leave/requests', leaveBody({}, '<html>fake PDF</html>'))).status, 400)
  const leaveRes = await a('/api/leave/requests', leaveBody())
  assert.equal(leaveRes.status, 200, await leaveRes.clone().text())
  const id = (await leaveRes.json()).id
  let day = await report(tuesday)
  assert.equal(day.normal.length, 0)
  assert.equal(day.eveningLeaves.length, 1)
  assert.equal(day.eveningLeaves[0].proof, null)
  assert.equal((await a('/api/leave/requests', leaveBody())).status, 400)
  assert.equal((await b('/api/leave/me')).status, 200)
  assert(!(await (await b('/api/leave/me')).text()).includes('身体不适'))
  assert.equal((await b(`/api/leave/requests/${id}`, { method: 'DELETE' })).status, 404)
  const upload = (content: string) => {
    const form = new FormData()
    form.append('proof', new File([content], '假条.pdf'))
    return { method: 'POST', body: form }
  }
  assert.equal((await b(`/api/leave/requests/${id}/proof`, upload('%PDF-other'))).status, 404)
  assert.equal((await a(`/api/leave/requests/${id}/proof`, upload('%PDF-verified'))).status, 200)
  let mine = await (await a('/api/leave/me')).json()
  const proofId = mine.leaves.find((l: any) => l.id === id).proof.id
  assert(!JSON.stringify(mine).includes('objectKey'))
  assert.equal((await api(`/api/leave/proofs/${proofId}`, {}, false)).status, 401)
  assert.equal((await b(`/api/leave/proofs/${proofId}`)).status, 404)
  assert.equal(await (await a(`/api/leave/proofs/${proofId}`)).text(), '%PDF-verified')
  assert.equal(await (await api(`/api/leave/proofs/${proofId}`)).text(), '%PDF-verified')
  assert.equal((await api(`/api/leave/proofs/${proofId}?preview=1`, {}, false)).status, 401)
  assert.equal((await b(`/api/leave/proofs/${proofId}?preview=1`)).status, 404)
  const preview = await a(`/api/leave/proofs/${proofId}?preview=1`)
  assert.equal(preview.headers.get('content-type'), 'application/pdf')
  assert(preview.headers.get('content-disposition')!.startsWith('inline;'))
  assert.equal(await preview.text(), '%PDF-verified')
  assert.equal((await api(`/api/leave/proofs/${proofId}?preview=1`)).status, 200)
  failPut()
  assert.equal((await a(`/api/leave/requests/${id}/proof`, upload('%PDF-failed'))).status, 502)
  mine = await (await a('/api/leave/me')).json()
  assert.equal(mine.leaves.find((l: any) => l.id === id).proof.id, proofId)
  const workbook = new ExcelJS.Workbook()
  const exported = await api('/api/admin/evening/export?date=' + tuesday)
  assert.equal(exported.status, 200)
  await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
  assert.equal(workbook.getWorksheet('正常晚自习')!.rowCount, 1)
  const row = workbook.getWorksheet('请假名单')!.getRow(2)
  assert.equal(row.getCell(2).value, '001')
  assert.equal(row.getCell(3).value, '测试甲')
  assert.equal(row.getCell(9).value, '已交')
  assert.equal((await a(`/api/leave/requests/${id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await report(tuesday)).normal.length, 1)
  assert.equal((await report(tuesday)).eveningLeaves.length, 0)
  assert.equal((await a(`/api/leave/requests/${id}/proof`, upload('%PDF-too-late'))).status, 400)
  pass(
    'Leave: immediate deferred-proof leave, own-only queries/cancellation/proofs, actual OBS upload/download, failure protection and XLSX content',
  )

  const course = await a(
    '/api/leave/requests',
    leaveBody({
      kind: 'course',
      date: tuesday,
      courseName: '数学',
      startTime: '08:00',
      endTime: '09:40',
    }),
  )
  assert.equal(course.status, 200, await course.clone().text())
  assert.equal(
    (await report(tuesday)).normal.length,
    1,
    'Course leave must not remove evening attendance',
  )
  assert.equal(
    (
      await a(
        '/api/leave/requests',
        leaveBody({
          kind: 'course',
          date: tuesday,
          courseName: '数学',
          startTime: '09:30',
          endTime: '10:00',
        }),
      )
    ).status,
    400,
  )
  assert.equal((await report(settings.endDate)).normal.length, 1)
  assert.equal((await report(addDays(settings.endDate, 1))).expected.length, 0)
  assert.equal(
    (await a('/api/leave/requests', leaveBody({ date: addDays(settings.endDate, 1) }))).status,
    400,
  )
  assert.equal(
    (await api('/api/admin/evening', json({ ...settings, enabled: false }, 'PUT'))).status,
    200,
  )
  assert.equal(
    (
      await a(
        '/api/leave/requests',
        leaveBody({
          kind: 'course',
          date: thursday,
          courseName: '语文',
          startTime: '08:00',
          endTime: '09:40',
        }),
      )
    ).status,
    200,
  )
  assert.equal((await a('/api/leave/requests', leaveBody())).status, 400)
  assert.equal((await api('/api/admin/evening', json(settings, 'PUT'))).status, 200)
  assert.equal((await api('/api/admin/leaves?date=2030-02-30')).status, 400)
  await api('/api/roster', json({ students: [roster[1]] }))
  assert.equal((await a('/api/leave/me')).status, 401, 'Removed roster identity must lose access')
  await api('/api/roster', json({ students: roster }))
  assert.equal((await a('/api/leave/session', { method: 'DELETE' })).status, 200)
  pass(
    'Leave: ordinary-course time validation, schedule end boundary, disabled-study course leave and roster session invalidation',
  )
}
