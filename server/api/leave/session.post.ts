import { z } from 'zod'
import { rateLimit } from '../../utils/auth'
import { boundedJson, validate } from '../../utils/validation'
import { currentStudent } from '../../utils/evening'
import { setLeaveSession } from '../../utils/leave-auth'
export default defineEventHandler(async (event) => {
  rateLimit(event, 'leave-identity', 30, 15 * 60_000)
  const input = validate(
    z.object({
      name: z.string().trim().min(1).max(40),
      studentId: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{1,32}$/),
    }),
    await boundedJson(event),
  )
  const student = currentStudent(input.studentId)
  if (!student || student.name !== input.name)
    throw createError({ statusCode: 400, message: '姓名或学号不匹配当前班级名单' })
  setLeaveSession(event, student)
  return { student }
})
