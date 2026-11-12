import { Readable } from 'node:stream'
import { createError, getQuery, sendStream, setHeaders, type H3Event } from 'h3'
import { downloadObject } from './obs'
import { directDownload } from './downloads'
import { filePreviewKind } from '../../shared/file-preview'

// Only inert raster formats and PDF may be served inline. Never render SVG or HTML.
export function previewMime(name: string, header: Buffer): string | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' && header.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  if (
    ['jpg', 'jpeg'].includes(ext || '') &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  )
    return 'image/jpeg'
  if (ext === 'png' && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (ext === 'gif' && ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString()))
    return 'image/gif'
  if (
    ext === 'webp' &&
    header.subarray(0, 4).toString() === 'RIFF' &&
    header.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp'
  if (ext === 'bmp' && header.subarray(0, 2).toString() === 'BM') return 'image/bmp'
  return null
}

// Call only after the route has checked the current file and its owner's permissions.
export async function sendPrivateFile(event: H3Event, file: { objectKey: string; name: string }) {
  const preview = getQuery(event).preview === '1'
  if (!preview) return directDownload(event, event.path)
  if (preview && !filePreviewKind(file.name))
    throw createError({ statusCode: 415, message: '此文件格式暂不支持预览，请下载查看' })
  const source = await downloadObject(file.objectKey)
  let stream = source
  let mime = 'application/octet-stream'
  if (preview) {
    const iterator = source[Symbol.asyncIterator]()
    const chunks: Buffer[] = []
    let size = 0
    try {
      while (size < 16) {
        const item = await iterator.next()
        if (item.done) break
        const chunk = Buffer.from(item.value)
        chunks.push(chunk)
        size += chunk.length
      }
      const detected = previewMime(file.name, Buffer.concat(chunks).subarray(0, 16))
      if (!detected)
        throw createError({
          statusCode: 415,
          message: '文件内容与格式不符，无法预览，请下载后检查',
        })
      mime = detected
    } catch (error) {
      source.destroy()
      throw error
    }
    stream = Readable.from(
      (async function* () {
        try {
          for (const chunk of chunks) yield chunk
          while (true) {
            const item = await iterator.next()
            if (item.done) break
            yield item.value
          }
        } finally {
          source.destroy()
        }
      })(),
    )
  }
  setHeaders(event, {
    'Content-Type': mime,
    'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...(preview ? { 'Content-Security-Policy': "default-src 'none'; sandbox" } : {}),
  })
  return sendStream(event, stream)
}
