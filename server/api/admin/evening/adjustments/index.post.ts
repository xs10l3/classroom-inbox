import { requireAdmin } from '../../../../utils/auth'
import { boundedJson } from '../../../../utils/validation'
import { createAdjustment, currentStudent, fail } from '../../../../utils/evening'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const input = await boundedJson(event)
  const student = typeof input?.studentId === 'string' ? currentStudent(input.studentId) : null
  if (!student) fail('请选择当前名单中的同学')
  return { adjustment: createAdjustment(input, student, 'admin') }
})
