import { defineEventHandler, setHeaders } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { listStudents } from '../../utils/db'
import { makeCsv } from '../../utils/roster-import'
export default defineEventHandler((event) => {
  requireAdmin(event)
  setHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="roster.csv"',
  })
  return makeCsv([
    ['学号', '姓名', '性别'],
    ...listStudents().map((s) => [
      s.studentId,
      s.name,
      s.gender === 'F' ? '女' : s.gender === 'M' ? '男' : '',
    ]),
  ])
})
