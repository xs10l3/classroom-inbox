import ExcelJS from 'exceljs'
import { requireAdmin } from '../../../utils/auth'
import { dailyEvening, requireDay } from '../../../utils/evening'
import { shanghaiDate } from '../../../../shared/evening'
import { adjustmentLabel } from '../../../../shared/evening'
import { adjustments } from '../../../utils/evening'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const report = dailyEvening(requireDay(getQuery(event).date || shanghaiDate()))
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
  setHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`晚自习名单-${report.date}.xlsx`)}`,
  })
  return Buffer.from(await book.xlsx.writeBuffer())
})
