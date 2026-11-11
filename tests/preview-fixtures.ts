// Small, valid documents used to verify real canvas/image rendering without external files.
export function previewPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...[1, 2].map((n) => {
      const commands = `0.92 0.96 0.9 rg 20 20 360 460 re f\n0.15 0.35 0.25 rg BT /F1 22 Tf 40 420 Td (File preview - page ${n}) Tj ET\n0.3 0.55 0.4 rg 40 280 320 80 re f\n`
      return `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}endstream`
    }),
  ]
  let result = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result))
    result += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(result)
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) result += `${String(offset).padStart(10, '0')} 00000 n \n`
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(result)
}
export const previewPng = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAABz0lEQVR4nO3SwQmAMADAwK7mGm7izOLPATqDUKiEgxsgj4z7fSBjbC+AhQxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNyuKhj+uErwxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJ+e/QsJehSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSZktn75hD5LpBAAAAABJRU5ErkJggg==',
    'base64',
  )
