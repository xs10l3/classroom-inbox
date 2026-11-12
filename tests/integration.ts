import { strict as assert } from 'node:assert'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

// Real production server + real S3 SDK against a local S3-compatible fixture.
// No real OBS credentials are read or used by this test.
const temp = await mkdtemp(join(tmpdir(), 'classroom-integration-'))
// Start from the previous schema to exercise additive migrations without losing history.
await mkdir(join(temp, 'data'), { recursive: true })
const legacyDb = new Database(join(temp, 'data', 'classroom.sqlite'))
legacyDb.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
  description TEXT NOT NULL, dueAt TEXT NOT NULL, createdAt TEXT NOT NULL, shareToken TEXT NOT NULL UNIQUE,
  extensions TEXT NOT NULL, maxSizeMb INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE affairs (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
  description TEXT NOT NULL, mode TEXT NOT NULL, dueAt TEXT NOT NULL, createdAt TEXT NOT NULL,
  shareToken TEXT NOT NULL UNIQUE, closed INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL DEFAULT '', taskId TEXT REFERENCES tasks(id), fields TEXT NOT NULL);
  INSERT INTO tasks VALUES('legacy-task','旧版本保留作业','课程','旧说明','2020-01-01T00:00:00Z',
  '2020-01-01T00:00:00Z','legacy-token','["pdf"]',2,1);`)
legacyDb.close()
const objects = new Map<string, Uint8Array>()
let failNextPut = false
let pausedDownload: { path: string; resume: Promise<void> } | undefined
const objectServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname)
    if (request.method === 'HEAD') return new Response(null, { status: 200 })
    if (request.method === 'PUT') {
      if (failNextPut) {
        failNextPut = false
        return new Response('<Error><Code>AccessDenied</Code></Error>', {
          status: 403,
          headers: { 'content-type': 'application/xml' },
        })
      }
      objects.set(path, new Uint8Array(await request.arrayBuffer()))
      return new Response(null, { status: 200, headers: { etag: '"test-etag"' } })
    }
    if (request.method === 'GET') {
      const content = objects.get(path)
      if (content && pausedDownload?.path === path) {
        const gate = pausedDownload
        return new Response(
          new ReadableStream({
            async start(controller) {
              const middle = Math.max(1, Math.floor(content.length / 2))
              controller.enqueue(content.slice(0, middle))
              await gate.resume
              controller.enqueue(content.slice(middle))
              controller.close()
            },
          }),
          { headers: { 'Content-Length': String(content.length) } },
        )
      }
      return content
        ? new Response(content, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(content.byteLength),
            },
          })
        : new Response(null, { status: 404 })
    }
    if (request.method === 'DELETE') {
      objects.delete(path)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 405 })
  },
})
const portServer = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') })
const port = portServer.port!
portServer.stop(true)
const app = Bun.spawn([process.execPath, resolve('.output/server/index.mjs')], {
  cwd: temp,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    HOST: '127.0.0.1',
    NITRO_PORT: String(port),
    DATA_DIR: join(temp, 'data'),
    ADMIN_PASSWORD: 'integration-password-123',
    SESSION_SECRET: 'integration-session-secret-at-least-32-characters',
    OBS_ENDPOINT: `http://127.0.0.1:${objectServer.port}`,
    OBS_REGION: 'cn-east-3',
    OBS_BUCKET: 'test-bucket',
    OBS_ACCESS_KEY_ID: 'TEST_ACCESS_KEY',
    OBS_SECRET_ACCESS_KEY: 'TEST_SECRET_KEY',
    OBS_SECURITY_TOKEN: '',
    OBS_ALLOW_LOCAL_TEST_ENDPOINT: 'true',
    APP_URL: '',
    COOKIE_SECURE: 'false',
    OBS_PREFIX: 'integration',
    UPLOAD_MAX_MB: '2',
    TRUST_PROXY: 'false',
    DOWNLOAD_TTL_MINUTES: '60',
  },
  stdout: 'pipe',
  stderr: 'pipe',
})
const base = `http://127.0.0.1:${port}`
let cookie = ''
async function api(path: string, options: RequestInit = {}, authenticated = true) {
  const headers = new Headers(options.headers)
  if (authenticated && cookie) headers.set('cookie', cookie)
  return fetch(base + path, { ...options, headers })
}
function json(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
const checks: string[] = []
function pass(message: string) {
  checks.push(message)
  console.log(`✓ ${message}`)
}
function submissionBody(
  studentId: string,
  name: string,
  files: { name: string; content: string }[],
) {
  const body = new FormData()
  body.append('name', name)
  body.append('studentId', studentId)
  for (const file of files) body.append('files', new File([file.content], file.name))
  return body
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await api('/api/health')).ok) {
        ready = true
        break
      }
    } catch {}
    await Bun.sleep(150)
  }
  assert(ready, 'Production server did not start')
  assert.equal((await api('/api/dashboard', {}, false)).status, 401)
  const home = await api('/', {}, false)
  assert.equal(home.status, 200)
  assert((await home.text()).includes('班级待办'))
  const oldBoard = await api('/classroom', { redirect: 'manual' }, false)
  assert.equal(oldBoard.status, 301)
  assert.equal(oldBoard.headers.get('location'), '/')
  assert.equal((await api('/api/auth/login', json({ password: 'incorrect' }), false)).status, 401)
  const login = await api('/api/auth/login', json({ password: 'integration-password-123' }), false)
  assert.equal(login.status, 200)
  cookie = login.headers.get('set-cookie')!.split(';')[0]!
  assert(login.headers.get('set-cookie')!.includes('HttpOnly'))
  assert(login.headers.get('set-cookie')!.includes('SameSite=Strict'))
  pass('Admin authentication, protected data and HttpOnly session')

  assert.equal((await (await api('/api/dashboard')).json()).students.length, 0)
  const legacyTask = (await (await api('/api/dashboard')).json()).tasks.find(
    (entry: any) => entry.id === 'legacy-task',
  )
  assert.equal(legacyTask.originalNotice, '')
  assert.equal(legacyTask.description, '旧说明')
  assert.equal(
    (
      await api(
        '/api/tasks',
        json({
          title: '无名单作业',
          subject: '数学',
          originalNotice: '请按时提交数学作业 PDF。',
          dueAt: '2030-01-01T12:00:00Z',
          extensions: ['pdf'],
          maxSizeMb: 2,
        }),
      )
    ).status,
    400,
  )
  const roster = [
    { name: '测试甲', student_id: '001', gender: 'F' },
    { name: '测试乙', student_id: '002', gender: 'M' },
  ]
  const csvBody = new FormData()
  csvBody.append(
    'file',
    new File(['\uFEFF学号,姓名,性别\r\n001,测试甲,女\r\n002,测试乙,男'], 'roster.csv'),
  )
  const csvPreview = await api('/api/roster/preview', { method: 'POST', body: csvBody })
  assert.equal(csvPreview.status, 200)
  assert.equal((await csvPreview.json()).students[0].studentId, '001')
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('名单')
  sheet.addRows([
    ['学号', '姓名', '性别'],
    ['001', '测试甲', '女'],
    ['002', '测试乙', '男'],
  ])
  const xlsxBody = new FormData()
  xlsxBody.append('file', new File([await workbook.xlsx.writeBuffer()], 'roster.xlsx'))
  assert.equal((await api('/api/roster/preview', { method: 'POST', body: xlsxBody })).status, 200)
  const jsonBody = new FormData()
  jsonBody.append('file', new File([JSON.stringify(roster)], 'roster.json'))
  assert.equal((await api('/api/roster/preview', { method: 'POST', body: jsonBody })).status, 200)
  assert.equal((await api('/api/roster', json({ students: [...roster, roster[0]] }))).status, 400)
  assert.equal((await api('/api/roster', json({ students: roster }))).status, 200)
  pass('Empty initial roster; CSV/XLSX/JSON preview and duplicate validation')

  const response = await api(
    '/api/tasks',
    json({
      title: '集成测试作业',
      subject: '数学',
      originalNotice: '请按时提交数学作业 PDF。',
      description: '按要求提交 PDF',
      dueAt: '2030-01-01T12:00:00Z',
      extensions: ['pdf'],
      maxSizeMb: 2,
    }),
  )
  assert.equal(response.status, 200)
  const { task } = await response.json()
  assert.equal(task.totalStudents, 2)
  assert.equal(
    (await api('/api/roster', json({ students: [{ name: '新同学', studentId: '003' }] }))).status,
    200,
  )
  const taskDetails = await (await api(`/api/tasks/${task.id}`)).json()
  assert.equal(taskDetails.students.length, 2)
  assert.equal(taskDetails.students[0].studentId, '001')
  const publicData = JSON.stringify(
    await (await api(`/api/submit/${task.shareToken}`, {}, false)).json(),
  )
  assert(!publicData.includes('测试甲'))
  assert(!publicData.includes('TEST_SECRET'))
  assert(!publicData.includes('objectKey'))
  pass('Task roster snapshots survive roster changes; public page does not expose names or keys')

  const submitPath = `/api/submit/${task.shareToken}`
  assert.equal(
    (
      await api(
        submitPath,
        {
          method: 'POST',
          body: submissionBody('001', '错误姓名', [{ name: 'a.pdf', content: 'pdf' }]),
        },
        false,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await api(
        submitPath,
        {
          method: 'POST',
          body: submissionBody('001', '测试甲', [{ name: 'a.exe', content: 'bad' }]),
        },
        false,
      )
    ).status,
    400,
  )
  const hugeBody = submissionBody('001', '测试甲', [
    { name: 'huge.pdf', content: 'a'.repeat(2 * 1024 * 1024 + 1) },
  ])
  assert.equal((await api(submitPath, { method: 'POST', body: hugeBody }, false)).status, 400)
  const firstSubmission = await api(
    submitPath,
    {
      method: 'POST',
      body: submissionBody('001', '测试甲', [{ name: '作业.pdf', content: '%PDF-first' }]),
    },
    false,
  )
  assert.equal(firstSubmission.status, 200, await firstSubmission.text())
  let detail = await (await api(`/api/tasks/${task.id}`)).json()
  assert.equal(detail.task.submittedCount, 1)
  assert.equal(detail.submissions.length, 1)
  assert(objects.size === 1)
  assert.equal((await api(`/api/files/${detail.submissions[0].id}`, {}, false)).status, 401)
  const downloaded = await api(`/api/files/${detail.submissions[0].id}`)
  assert.equal(await downloaded.text(), '%PDF-first')
  pass('Student identity, file format/size checks, actual S3 SDK upload and protected download')

  failNextPut = true
  const failed = await api(
    submitPath,
    {
      method: 'POST',
      body: submissionBody('001', '测试甲', [{ name: 'fail.pdf', content: 'will fail' }]),
    },
    false,
  )
  assert.equal(failed.status, 502)
  detail = await (await api(`/api/tasks/${task.id}`)).json()
  assert.equal(detail.submissions[0].originalName, '作业.pdf')
  assert.equal(
    (
      await api(
        submitPath,
        {
          method: 'POST',
          body: submissionBody('001', '测试甲', [
            { name: '新版.pdf', content: '%PDF-updated' },
            { name: '附加.pdf', content: '%PDF-extra' },
          ]),
        },
        false,
      )
    ).status,
    200,
  )
  detail = await (await api(`/api/tasks/${task.id}`)).json()
  assert.equal(detail.task.submittedCount, 1)
  assert.equal(detail.submissions.length, 2)
  assert(objects.size === 3, 'Historical objects should be retained')
  pass(
    'Failed upload retains previous submission; resubmission replaces active records and retains history',
  )

  const csv = await (await api(`/api/tasks/${task.id}/export`)).text()
  assert(csv.includes('测试甲') && csv.includes('未提交') && csv.includes('测试乙'))
  const archive = await api(`/api/tasks/${task.id}/archive`)
  assert.equal(archive.status, 200)
  const zip = new Uint8Array(await archive.arrayBuffer())
  assert.equal(Buffer.from(zip.subarray(0, 2)).toString(), 'PK')
  const unpacked = await JSZip.loadAsync(zip, { checkCRC32: true })
  const names = Object.keys(unpacked.files)
  assert(
    names.some((name) => name.includes('新版.pdf')),
    JSON.stringify(names),
  )
  assert(
    names.some((name) => name.includes('附加.pdf')),
    JSON.stringify(names),
  )
  assert(names.includes('提交情况.csv'), JSON.stringify(names))
  const updatedPdf = unpacked.file(names.find((name) => name.includes('新版.pdf'))!)!
  assert.equal(await updatedPdf.async('string'), '%PDF-updated')
  pass('CSV missing-student export and valid streamed ZIP of current files')

  // Batch affairs import and all three completion flows.
  assert.equal((await api('/api/affairs', {}, false)).status, 401)
  await api('/api/roster', json({ students: roster }))
  const batch = [
    {
      title: '活动报名统计',
      category: '活动',
      mode: 'form',
      due_at: '2030-12-01T20:00:00+08:00',
      original_notice: '  通知原文：\n请在规定时间内完成本项事务。\n  ',
      fields: [
        {
          key: 'attend',
          label: '是否参加',
          type: 'select',
          required: true,
          options: ['参加', '不参加'],
        },
        { key: 'note', label: '备注', type: 'textarea', required: false },
      ],
    },
    {
      title: '外部问卷',
      mode: 'link',
      due_at: '2030-12-01T20:00:00+08:00',
      original_notice: '  通知原文：\n请在规定时间内完成本项事务。\n  ',
      url: 'https://example.com/form',
    },
    {
      title: '材料收集',
      mode: 'files',
      due_at: '2030-12-01T20:00:00+08:00',
      original_notice: '  通知原文：\n请在规定时间内完成本项事务。\n  ',
      collection: { extensions: ['pdf'], max_size_mb: 2 },
    },
  ]
  assert.equal((await api('/api/affairs/preview', json(batch))).status, 200)
  assert.equal(
    (await (await api('/api/affairs')).json()).affairs.length,
    0,
    'Preview must not write',
  )
  assert.equal((await api('/api/affairs', json([...batch, { title: 'invalid' }]))).status, 400)
  assert.equal(
    (await (await api('/api/affairs')).json()).affairs.length,
    0,
    'Invalid batch must not partially write',
  )
  const imported = await api('/api/affairs', json(batch))
  assert.equal(imported.status, 200, await imported.clone().text())
  const affairs = (await imported.json()).affairs
  assert.equal(affairs.length, 3)
  const formAffair = affairs.find((a: any) => a.mode === 'form')
  const fileAffair = affairs.find((a: any) => a.mode === 'files')
  const linkAffair = affairs.find((a: any) => a.mode === 'link')
  assert.equal(formAffair.originalNotice, batch[0]!.original_notice)
  assert.equal(fileAffair.totalStudents, 2)
  assert(fileAffair.taskId && fileAffair.taskShareToken)
  const linked = await api(
    '/api/affairs',
    json([
      {
        title: '已有作业入口',
        mode: 'files',
        task_id: task.id,
        due_at: '2030-12-01T20:00:00+08:00',
        original_notice: '  通知原文：\n请在规定时间内完成本项事务。\n  ',
      },
    ]),
  )
  assert.equal(linked.status, 200)
  assert.equal((await linked.json()).affairs[0].taskShareToken, task.shareToken)
  assert.equal(
    (await api(`/api/affairs/${linkAffair.id}`, json({ completed: true }, 'PATCH'))).status,
    200,
  )
  assert.equal((await (await api(`/api/affairs/${linkAffair.id}`)).json()).affair.completed, true)
  pass(
    'Atomic JSON affairs import, read-only preview, external progress and existing/new file collection links',
  )

  const boardResponse = await api('/api/classroom', {}, false)
  assert.equal(boardResponse.status, 200)
  const board = await boardResponse.json()
  assert(board.items.some((item: any) => item.title === '活动报名统计'))
  assert(board.items.some((item: any) => item.title === '材料收集'))
  assert(
    !board.items.some((item: any) => item.title === '外部问卷'),
    'Completed external affairs are hidden',
  )
  assert.equal(
    board.items.filter((item: any) => item.url === `/submit/${task.shareToken}`).length,
    1,
    'Linked task must appear only once',
  )
  const boardText = JSON.stringify(board)
  assert(
    !boardText.includes('测试甲') &&
      !boardText.includes('objectKey') &&
      !boardText.includes('studentId'),
  )
  assert.equal(
    board.items.find((item: any) => item.title === '活动报名统计').originalNotice,
    batch[0]!.original_notice,
  )
  assert.equal(boardResponse.headers.get('cache-control'), 'no-store')
  pass(
    'Public class board lists active forms/uploads once, retains original notices and excludes private student data',
  )

  await api('/api/roster', json({ students: [{ name: '新同学', studentId: '003' }] }))
  const fillPath = `/api/fill/${formAffair.shareToken}`
  const publicForm = await (await api(fillPath, {}, false)).text()
  assert(
    !publicForm.includes('测试甲') &&
      !publicForm.includes('studentId') &&
      !publicForm.includes('responses'),
  )
  const answers = { attend: '参加', note: '=SUM(1,2)' }
  assert.equal(
    (await api(fillPath, json({ name: '新同学', studentId: '003', answers }), false)).status,
    400,
  )
  assert.equal(
    (
      await api(
        fillPath,
        json({ name: '测试甲', studentId: '001', answers: { attend: '非法选项' } }),
        false,
      )
    ).status,
    400,
  )
  assert.equal(
    (await api(fillPath, json({ name: '测试甲', studentId: '001', answers: {} }), false)).status,
    400,
  )
  assert.equal(
    (await api(fillPath, json({ name: '测试甲', studentId: '001', answers }), false)).status,
    200,
  )
  assert.equal(
    (
      await api(
        fillPath,
        json({
          name: '测试甲',
          studentId: '001',
          answers: { attend: '不参加', note: '=SUM(1,2)' },
        }),
        false,
      )
    ).status,
    200,
  )
  const filled = await (await api(`/api/affairs/${formAffair.id}`)).json()
  assert.equal(filled.affair.responseCount, 1)
  assert.equal(filled.students.length, 2)
  assert.equal(filled.responses.length, 1)
  assert.equal(filled.responses[0].answers.attend, '不参加')
  const formCsv = await (await api(`/api/affairs/${formAffair.id}/export`)).text()
  assert(formCsv.includes('未填写') && formCsv.includes('测试乙') && formCsv.includes("'=SUM(1,2)"))
  assert.equal((await api(`/api/affairs/${formAffair.id}/export`, {}, false)).status, 401)
  await api(`/api/affairs/${formAffair.id}`, json({ closed: true }, 'PATCH'))
  assert.equal(
    (await api(fillPath, json({ name: '测试甲', studentId: '001', answers }), false)).status,
    403,
  )
  await api(`/api/affairs/${formAffair.id}`, json({ closed: false }, 'PATCH'))
  const formDb = new Database(join(temp, 'data', 'classroom.sqlite'))
  formDb.query('UPDATE affairs SET dueAt=? WHERE id=?').run('2020-01-01T00:00:00Z', formAffair.id)
  formDb.close()
  assert.equal(
    (await api(fillPath, json({ name: '测试甲', studentId: '001', answers }), false)).status,
    403,
  )
  const affairUpload = await api(
    `/api/submit/${fileAffair.taskShareToken}`,
    {
      method: 'POST',
      body: submissionBody('001', '测试甲', [{ name: '材料.pdf', content: '%PDF-affair' }]),
    },
    false,
  )
  assert.equal(affairUpload.status, 200)
  assert.equal((await (await api(`/api/affairs/${fileAffair.id}`)).json()).affair.responseCount, 1)
  await api(`/api/affairs/${fileAffair.id}`, json({ closed: true }, 'PATCH'))
  assert.equal((await (await api(`/api/tasks/${fileAffair.taskId}`)).json()).task.closed, true)
  const closedBoard = await (await api('/api/classroom', {}, false)).json()
  assert(!closedBoard.items.some((item: any) => ['活动报名统计', '材料收集'].includes(item.title)))
  pass(
    'Form roster snapshots, answer validation, updates, missing CSV, closure/deadline and OBS collection progress',
  )

  const { runLeaveChecks } = await import('./leaves.integration')
  await runLeaveChecks(
    api,
    () => {
      failNextPut = true
    },
    pass,
  )

  const { runPreviewChecks } = await import('./preview.integration')
  await runPreviewChecks(api, pass)

  const { runAdminToolsChecks } = await import('./admin-tools.integration')
  await runAdminToolsChecks(
    api,
    join(temp, 'data'),
    () => {
      failNextPut = true
    },
    () => objects.size,
    pass,
  )

  const { runDownloadChecks } = await import('./downloads.integration')
  await runDownloadChecks(api, join(temp, 'data'), objects, pass, (path) => {
    let resume!: () => void
    pausedDownload = {
      path,
      resume: new Promise<void>((resolve) => {
        resume = resolve
      }),
    }
    return () => {
      pausedDownload = undefined
      resume()
    }
  })

  const backupProcess = Bun.spawn(
    [process.execPath, resolve('scripts/backup.ts'), join(temp, 'backups')],
    {
      cwd: temp,
      env: { ...process.env, DATA_DIR: join(temp, 'data') },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const backupPath = (await new Response(backupProcess.stdout).text()).trim()
  assert.equal(await backupProcess.exited, 0, await new Response(backupProcess.stderr).text())
  const backupDb = new Database(backupPath, { readonly: true })
  assert.equal((backupDb.query('SELECT COUNT(*) AS count FROM affairs').get() as any).count, 4)
  assert.equal(
    (backupDb.query('SELECT COUNT(*) AS count FROM form_responses').get() as any).count,
    1,
  )
  assert.equal(
    (backupDb.query('SELECT COUNT(*) AS count FROM evening_settings').get() as any).count,
    1,
  )
  assert((backupDb.query('SELECT COUNT(*) AS count FROM leave_requests').get() as any).count > 0)
  assert((backupDb.query('SELECT COUNT(*) AS count FROM leave_proofs').get() as any).count > 0)
  assert.equal((backupDb.query('PRAGMA integrity_check').get() as any).integrity_check, 'ok')
  backupDb.close()
  pass(
    'Live WAL database backup preserves affairs, evening settings, leave/proof indices and passes integrity verification',
  )

  if (process.env.BROWSER_TEST === '1') {
    const { runBrowserChecks } = await import('./browser')
    await runBrowserChecks(base)
    const { runLeaveBrowserChecks } = await import('./leaves.browser')
    await runLeaveBrowserChecks(base)
  }

  assert.equal((await api(`/api/tasks/${task.id}`, json({ closed: true }, 'PATCH'))).status, 200)
  assert.equal(
    (
      await api(
        submitPath,
        {
          method: 'POST',
          body: submissionBody('001', '测试甲', [{ name: 'late.pdf', content: 'late' }]),
        },
        false,
      )
    ).status,
    403,
  )
  assert.equal((await api(`/api/tasks/${task.id}`, json({ closed: false }, 'PATCH'))).status, 200)
  const directDb = new Database(join(temp, 'data', 'classroom.sqlite'))
  directDb.query('UPDATE tasks SET dueAt=? WHERE id=?').run('2020-01-01T00:00:00Z', task.id)
  directDb.close()
  assert.equal(
    (
      await api(
        submitPath,
        {
          method: 'POST',
          body: submissionBody('001', '测试甲', [{ name: 'late.pdf', content: 'late' }]),
        },
        false,
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await api('/api/roster', {
        ...json({ students: roster }),
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      })
    ).status,
    403,
  )
  assert.equal((await api('/api/storage/check', { method: 'POST' })).status, 200)
  const dashboard = await api('/api/dashboard')
  assert.equal(dashboard.headers.get('cache-control'), 'no-store')
  assert.equal((await api('/api/auth/logout', { method: 'POST' })).status, 200)
  pass('Manual closure, elapsed deadline, cross-site protection and OBS connectivity check')
  console.log(`\n${checks.length} integration groups passed.`)
} finally {
  app.kill()
  await app.exited
  const errors = await new Response(app.stderr).text()
  if (errors.trim())
    console.log(
      'Server diagnostic output:',
      errors.replace(/integration-password-123/g, '[redacted]'),
    )
  objectServer.stop(true)
  await rm(temp, { recursive: true, force: true })
}
