import { test, expect } from 'bun:test'
import { filePreviewKind } from '../../shared/file-preview'
import { previewMime } from '../../server/utils/private-file'
import { previewPdf, previewPng } from '../preview-fixtures'
test('inline previews require an allowed extension and matching file signature', () => {
  expect(filePreviewKind('材料.PDF')).toBe('pdf')
  expect(filePreviewKind('假条.jpeg')).toBe('image')
  expect(filePreviewKind('x.svg')).toBeNull()
  expect(filePreviewKind('x.html')).toBeNull()
  expect(previewMime('x.pdf', previewPdf().subarray(0, 16))).toBe('application/pdf')
  expect(previewMime('x.png', previewPng().subarray(0, 16))).toBe('image/png')
  expect(previewMime('x.pdf', Buffer.from('<html>bad</html>'))).toBeNull()
  expect(previewMime('x.svg', Buffer.from('<svg onload="alert(1)">'))).toBeNull()
  expect(previewMime('x.png', previewPdf().subarray(0, 16))).toBeNull()
  expect(previewMime('x.jpg', Buffer.from([255, 216, 255, 0]))).toBe('image/jpeg')
  expect(previewMime('x.gif', Buffer.from('GIF89a\0\0'))).toBe('image/gif')
  expect(previewMime('x.webp', Buffer.from('RIFF1234WEBP'))).toBe('image/webp')
  expect(previewMime('x.webp', Buffer.from('RIFF1234AVI '))).toBeNull()
})
