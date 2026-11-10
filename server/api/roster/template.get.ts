import { defineEventHandler, setHeaders } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { makeCsv } from '../../utils/roster-import'
export default defineEventHandler((event) => {
  requireAdmin(event)
  setHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="roster-template.csv"',
  })
  return makeCsv([
    ['学号', '姓名', '性别'],
    ['2026000000001', '示例同学甲', '女'],
    ['2026000000002', '示例同学乙', '男'],
  ])
})
