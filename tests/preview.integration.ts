import { strict as assert } from 'node:assert'
import { previewPdf, previewPng } from './preview-fixtures'
type Api = (path: string, options?: RequestInit, authenticated?: boolean) => Promise<Response>
export async function runPreviewChecks(api: Api, pass: (message: string) => void) {
  const created = await api('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: '预览验证',
      subject: '测试',
      originalNotice: '预览文件测试通知',
      dueAt: '2030-01-01T12:00:00Z',
      extensions: ['pdf', 'png', 'svg', 'txt'],
      maxSizeMb: 2,
    }),
  })
  assert.equal(created.status, 200)
  const { task } = await created.json()
  const upload = async (files: { name: string; bytes: Buffer }[]) => {
    const body = new FormData()
    body.append('name', '测试甲')
    body.append('studentId', '001')
    for (const file of files) body.append('files', new File([file.bytes], file.name))
    return api(`/api/submit/${task.shareToken}`, { method: 'POST', body }, false)
  }
  const pdf = previewPdf(),
    png = previewPng()
  assert.equal(
    (
      await upload([
        { name: '预览.pdf', bytes: pdf },
        { name: '图片.png', bytes: png },
        { name: '伪装.pdf', bytes: Buffer.from('<html><script>alert(1)</script></html>') },
        { name: '矢量.svg', bytes: Buffer.from('<svg onload="alert(1)"></svg>') },
        { name: '说明.txt', bytes: Buffer.from('text') },
      ])
    ).status,
    200,
  )
  const detail = await (await api(`/api/tasks/${task.id}`)).json()
  const file = (name: string) => detail.submissions.find((s: any) => s.originalName === name)
  for (const [name, mime, bytes] of [
    ['预览.pdf', 'application/pdf', pdf],
    ['图片.png', 'image/png', png],
  ] as const) {
    const path = `/api/files/${file(name).id}`
    assert.equal((await api(path + '?preview=1', {}, false)).status, 401)
    const preview = await api(path + '?preview=1')
    assert.equal(preview.status, 200)
    assert.equal(preview.headers.get('content-type'), mime)
    assert(preview.headers.get('content-disposition')!.startsWith('inline;'))
    assert.equal(preview.headers.get('cache-control'), 'no-store')
    assert.equal(preview.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(preview.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert(preview.headers.get('content-security-policy')!.includes('sandbox'))
    assert(
      Buffer.from(await preview.arrayBuffer()).equals(bytes),
      'Preview must preserve the entire stream',
    )
    const download = await api(path)
    assert(download.headers.get('content-disposition')!.startsWith('attachment;'))
    assert.equal(download.headers.get('content-type'), 'application/octet-stream')
  }
  for (const name of ['伪装.pdf', '矢量.svg', '说明.txt']) {
    const path = `/api/files/${file(name).id}`
    assert.equal((await api(path + '?preview=1')).status, 415)
    assert.equal((await api(path)).status, 200)
  }
  assert.equal((await upload([{ name: '新版.pdf', bytes: pdf }])).status, 200)
  assert.equal((await api(`/api/files/${file('预览.pdf').id}?preview=1`)).status, 404)
  const version = (await (await api(`/api/tasks/${task.id}`)).json()).submissions[0]
  const student = await api(
    '/api/leave/session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '测试甲', studentId: '001' }),
    },
    false,
  )
  const cookie = student.headers.get('set-cookie')!.split(';')[0]!
  assert.equal(
    (await api(`/api/files/${version.id}?preview=1`, { headers: { cookie } }, false)).status,
    401,
    'Student identity must not grant access to homework files',
  )
  pass(
    'Private previews: PDF/PNG MIME and complete streams, attachment downloads, signature rejection, unsupported files, retired files and admin-only homework access',
  )
}
