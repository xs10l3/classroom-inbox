import ExcelJS from 'exceljs'
import { createError } from 'h3'
import { adjustments, dailyEvening } from './evening'
import { adjustmentLabel } from '../../shared/evening'
import { db } from './db'
import { safeName } from './validation'

export interface ExportedLeaveProof {
  leaveId: string
  name: string
  objectKey: string
  size: number
}

export function dailyLeaveExport(day: string) {
  const report = dailyEvening(day)
  const files: ExportedLeaveProof[] = []
  for (const leave of report.leaves.filter((entry) => !entry.cancelledAt && entry.proof)) {
    const proof = db()
      .query<{ objectKey: string; size: number }, [string, string]>(
        'SELECT objectKey,size FROM leave_proofs WHERE id=? AND leaveId=?',
      )
      .get(leave.proof!.id, leave.id)
    if (!proof)
      throw createError({ statusCode: 500, message: '假条索引异常，请核对当日请假记录后重试' })
    const type = leave.kind === 'evening' ? '晚自习' : '普通课程'
    const extension = leave.proof!.name.split('.').pop()!.toLowerCase()
    // Limit each component to keep Chinese names within common filesystem byte limits.
    const part = (value: string, length: number) =>
      Array.from(safeName(value)).slice(0, length).join('')
    const time = `${leave.startAt.slice(11, 16)}-${leave.endAt.slice(11, 16)}`.replaceAll(':', '')
    const number = String(files.length + 1).padStart(3, '0')
    const name = `假条/${leave.date}_${part(leave.studentId, 32)}_${part(leave.studentName, 16)}_${type}_${part(leave.courseName, 12)}_${time}_${number}.${extension}`
    files.push({ leaveId: leave.id, name, objectKey: proof.objectKey, size: proof.size })
  }
  const book = new ExcelJS.Workbook()
  book.creator = '课代表'
  book.created = new Date()
  const normal = book.addWorksheet('正常晚自习')
  normal.addRow(['日期', '学号', '姓名', '开始时间', '结束时间'])
  for (const s of report.normal)
    normal.addRow([
      report.date,
      s.studentId,
      s.name,
      report.settings.startTime,
      report.settings.endTime,
    ])
  const leave = book.addWorksheet('请假名单')
  leave.addRow([
    '日期',
    '学号',
    '姓名',
    '类型',
    '课程',
    '开始时间',
    '结束时间',
    '原因',
    '假条状态',
    '假条文件',
    '当前是否应到',
    '提交时间',
    '导出假条文件',
  ])
  for (const l of report.leaves.filter((l) => !l.cancelledAt))
    leave.addRow([
      l.date,
      l.studentId,
      l.studentName,
      l.kind === 'evening' ? '晚自习' : '普通课程',
      l.courseName,
      l.startAt.slice(11, 16),
      l.endAt.slice(11, 16),
      l.reason,
      l.proof ? '已交' : '待补',
      l.proof?.name || '',
      l.kind === 'evening'
        ? report.expected.some((s) => s.studentId === l.studentId)
          ? '是'
          : '否（安排已变化）'
        : '—',
      new Date(l.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      files.find((file) => file.leaveId === l.id)?.name || '',
    ])
  const notes = book.addWorksheet('安排说明')
  notes.addRows([
    ['日期', report.date],
    ['本日应到人数', report.expected.length],
    ['正常晚自习人数', report.normal.length],
    [
      '有效晚自习请假人数',
      report.eveningLeaves.filter((l) => report.expected.some((s) => s.studentId === l.studentId))
        .length,
    ],
    ['安排起止日期', `${report.settings.startDate} 至 ${report.settings.endDate}`],
    ['原始通知', report.settings.originalNotice],
    ['已交假条数', files.length],
    ['待补假条数', report.leaves.filter((l) => !l.cancelledAt && !l.proof).length],
    [
      '附件导出说明',
      '压缩包的“假条”目录包含当日有效晚自习及普通课程请假的最新假条，按日期、学号、姓名、类型、课程、时段及序号重命名；原文件名保留在请假名单中。已取消请假及历史假条不打包，待补假条只在名单中标注。',
    ],
    [
      '说明',
      '待补假条的请假立即生效；取消的请假不列入请假名单。普通课程请假单独标注，不扣减晚自习应到人数。',
    ],
    [],
    ['学号', '姓名', '个人调整', '状态'],
  ])
  for (const a of adjustments().filter((a) => ['approved', 'revoked'].includes(a.status)))
    notes.addRow([
      a.studentId,
      a.studentName,
      adjustmentLabel(a),
      a.inactiveFrom ? `${a.inactiveFrom}起撤销` : '已生效',
    ])
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).height = 26
    sheet.columns.forEach((c, i) => {
      c.width = i === 1 ? 23 : i === 7 ? 40 : 22
    })
    sheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true }
    })
  }
  return { report, book, files }
}
