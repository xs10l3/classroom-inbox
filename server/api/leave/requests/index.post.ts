import { requireLeaveStudent } from '../../../utils/leave-auth'
import { rateLimit } from '../../../utils/auth'
import { db } from '../../../utils/db'
import { appConfig } from '../../../utils/config'
import { proofForm, parseProof, parseLeave } from '../../../utils/leave-files'
import { fail } from '../../../utils/evening'
import { uploadObject, removeUploadedObject } from '../../../utils/obs'
export default defineEventHandler(async (event) => {
  const student = requireLeaveStudent(event)
  rateLimit(event, 'leave-submit', 60, 3600_000)
  const form = await proofForm(event),
    input = parseLeave(form, student),
    proof = await parseProof(form)
  if (!proof && input.deferProof !== 'true') fail('请上传假条，或明确选择以后补交')
  const id = crypto.randomUUID(),
    key = proof
      ? `${appConfig().obsPrefix}/leave-proofs/${student.studentId}/${id}/${proof.id}/${proof.name}`
      : ''
  try {
    if (proof) await uploadObject(key, proof.bytes)
    db().transaction(() => {
      requireLeaveStudent(event)
      const current = parseLeave(form, student)
      db()
        .query(
          `INSERT INTO leave_requests(id,studentId,studentName,kind,date,courseName,startAt,endAt,reason,createdAt,proofId) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          student.studentId,
          student.name,
          current.kind,
          current.date,
          current.courseName,
          current.startAt,
          current.endAt,
          current.reason,
          new Date().toISOString(),
          proof?.id || null,
        )
      if (proof)
        db()
          .query(
            'INSERT INTO leave_proofs(id,leaveId,name,objectKey,size,createdAt) VALUES(?,?,?,?,?,?)',
          )
          .run(proof.id, id, proof.name, key, proof.size, proof.createdAt)
    })()
  } catch (error) {
    if (proof) await removeUploadedObject(key)
    throw error
  }
  return { ok: true, id }
})
