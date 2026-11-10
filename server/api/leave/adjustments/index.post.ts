import { requireLeaveStudent } from '../../../utils/leave-auth'
import { rateLimit } from '../../../utils/auth'
import { boundedJson } from '../../../utils/validation'
import { createAdjustment } from '../../../utils/evening'
export default defineEventHandler(async (event) => {
  const student = requireLeaveStudent(event)
  rateLimit(event, 'leave-adjustment', 40, 3600_000)
  const input = await boundedJson(event)
  return { adjustment: createAdjustment(input, student, 'student') }
})
