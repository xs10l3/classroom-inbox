import { createError } from 'h3'
import { normalizeRoster } from './validation'

export function parseCsv(source: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((v) => v.trim())) rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (quoted) throw createError({ statusCode: 400, message: 'CSV 中存在未闭合的引号' })
  row.push(field)
  if (row.some((v) => v.trim())) rows.push(row)
  const headers = rows.shift()?.map((v) => v.trim()) || []
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, i) => [header, cells[i]?.trim() || ''])),
  )
}

export async function parseRosterFile(file: File) {
  if (file.size > 5 * 1024 * 1024)
    throw createError({ statusCode: 413, message: '名单文件请控制在 5 MB 以内' })
  const extension = file.name.split('.').pop()?.toLowerCase()
  let rows: unknown
  if (extension === 'json') {
    try {
      rows = JSON.parse(await file.text())
    } catch {
      throw createError({ statusCode: 400, message: 'JSON 文件格式不正确' })
    }
  } else if (extension === 'csv') rows = parseCsv(await file.text())
  else if (extension === 'xlsx') {
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]
      if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 30)
        throw new Error('Invalid sheet size')
      const headers: string[] = []
      sheet.getRow(1).eachCell((cell, col) => {
        headers[col] = cell.text.trim()
      })
      const records: Record<string, string>[] = []
      sheet.eachRow((row, number) => {
        if (number === 1) return
        const record: Record<string, string> = {}
        row.eachCell((cell, col) => {
          if (headers[col]) record[headers[col]!] = cell.text.trim()
        })
        if (Object.values(record).some(Boolean)) records.push(record)
      })
      rows = records
    } catch {
      throw createError({
        statusCode: 400,
        message: '无法读取 Excel，请使用含表头的 .xlsx 文件（最多 1000 人、30 列）',
      })
    }
  } else throw createError({ statusCode: 400, message: '请上传 .xlsx、.csv 或 .json 文件' })
  return normalizeRoster(rows)
}

export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function makeCsv(rows: unknown[][]) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
