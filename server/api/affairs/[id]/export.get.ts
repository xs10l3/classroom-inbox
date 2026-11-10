import { defineEventHandler, createError, getRouterParam, setHeaders } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { affairResponses, affairStudents, findAffair } from '../../../utils/affairs'
import { makeCsv } from '../../../utils/roster-import'
export default defineEventHandler((event) => {
  requireAdmin(event)
  const affair = findAffair(getRouterParam(event, 'id')!)
  if (!affair || affair.mode !== 'form')
    throw createError({ statusCode: 404, message: '表单不存在' })
  const responses = new Map(affairResponses(affair.id).map((r) => [r.studentId, r]))
  setHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(affair.title + '_填写结果.csv')}`,
  })
  return makeCsv([
    ['学号', '姓名', '状态', '提交时间', ...affair.fields.map((f) => f.label)],
    ...affairStudents(affair.id).map((student) => {
      const response = responses.get(student.studentId)
      return [
        student.studentId,
        student.name,
        response ? '已填写' : '未填写',
        response
          ? new Date(response.submittedAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              hour12: false,
            })
          : '',
        ...affair.fields.map((f) => response?.answers[f.key] || ''),
      ]
    }),
  ])
})
