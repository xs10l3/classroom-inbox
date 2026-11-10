import { requireLeaveStudent } from '../../../utils/leave-auth'
import { db } from '../../../utils/db'
import { fail } from '../../../utils/evening'
export default defineEventHandler((event) => {
  const student = requireLeaveStudent(event)
  const result = db()
    .query(
      "UPDATE evening_adjustments SET status='withdrawn' WHERE id=? AND studentId=? AND status='pending'",
    )
    .run(getRouterParam(event, 'id')!, student.studentId)
  if (!result.changes) fail('只能撤回本人待审核的申请')
  return { ok: true }
})
