import { requireLeaveStudent } from '../../../../utils/leave-auth'
import { rateLimit } from '../../../../utils/auth'
import { ownedLeave, parseProof, proofForm } from '../../../../utils/leave-files'
import { fail } from '../../../../utils/evening'
import { uploadObject, removeUploadedObject } from '../../../../utils/obs'
import { appConfig } from '../../../../utils/config'
import { db } from '../../../../utils/db'
export default defineEventHandler(async (event) => {
  const student = requireLeaveStudent(event),
    id = getRouterParam(event, 'id')!
  rateLimit(event, 'leave-proof', 60, 3600_000)
  if (ownedLeave(id, student.studentId).cancelledAt) fail('已取消的请假不能补交假条')
  const proof = await parseProof(await proofForm(event))
  if (!proof) fail('请选择假条文件')
  const key = `${appConfig().obsPrefix}/leave-proofs/${student.studentId}/${id}/${proof.id}/${proof.name}`
  try {
    await uploadObject(key, proof.bytes)
    db().transaction(() => {
      requireLeaveStudent(event)
      if (ownedLeave(id, student.studentId).cancelledAt) fail('请假已取消，无法补交')
      db()
        .query(
          'INSERT INTO leave_proofs(id,leaveId,name,objectKey,size,createdAt) VALUES(?,?,?,?,?,?)',
        )
        .run(proof.id, id, proof.name, key, proof.size, proof.createdAt)
      db().query('UPDATE leave_requests SET proofId=? WHERE id=?').run(proof.id, id)
    })()
  } catch (error) {
    await removeUploadedObject(key)
    throw error
  }
  return { ok: true }
})
