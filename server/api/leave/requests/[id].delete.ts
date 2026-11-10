import { requireLeaveStudent } from '../../../utils/leave-auth'
import { ownedLeave } from '../../../utils/leave-files'
import { db } from '../../../utils/db'
export default defineEventHandler((event) => {
  const student = requireLeaveStudent(event),
    id = getRouterParam(event, 'id')!
  const leave = ownedLeave(id, student.studentId)
  if (!leave.cancelledAt)
    db()
      .query(
        "UPDATE leave_requests SET cancelledAt=? WHERE id=? AND studentId=? AND cancelledAt=''",
      )
      .run(new Date().toISOString(), id, student.studentId)
  return { ok: true }
})
