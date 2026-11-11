import { isAdmin } from '../../../utils/auth'
import { requireLeaveStudent } from '../../../utils/leave-auth'
import { db } from '../../../utils/db'
import { sendPrivateFile } from '../../../utils/private-file'
export default defineEventHandler(async (event) => {
  const student = isAdmin(event) ? null : requireLeaveStudent(event)
  const proof = db()
    .query<{ name: string; objectKey: string; studentId: string }, [string]>(
      `SELECT p.name,p.objectKey,l.studentId FROM leave_proofs p JOIN leave_requests l ON l.proofId=p.id WHERE p.id=?`,
    )
    .get(getRouterParam(event, 'id')!)
  if (!proof || (student && student.studentId !== proof.studentId))
    throw createError({ statusCode: 404, message: '假条不存在' })
  return sendPrivateFile(event, proof)
})
