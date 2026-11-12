import { requireAdmin, rateLimit } from '../../../utils/auth'
import { db } from '../../../utils/db'
import { appConfig } from '../../../utils/config'
import { proofForm, parseProof } from '../../../utils/leave-files'
import { batchStudentIds, batchDates, validateBatchLeaves } from '../../../utils/leave-batch'
import { fail } from '../../../utils/evening'
import { uploadObject, removeUploadedObject } from '../../../utils/obs'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  rateLimit(event, 'admin-batch-leave', 30, 3600_000)
  const form = await proofForm(event)
  const ids = batchStudentIds(form)
  const dates = batchDates(form.getAll('dates'))
  const initial = validateBatchLeaves(form, ids, dates)
  const proof = await parseProof(form)
  if (!proof && initial[0]!.input.deferProof !== 'true')
    fail('请上传本批适用的假条，或明确选择以后补交')
  const records = initial.map(({ student }) => {
    const id = crypto.randomUUID(),
      proofId = crypto.randomUUID()
    return {
      id,
      proofId,
      student,
      key: proof
        ? `${appConfig().obsPrefix}/leave-proofs/${student.studentId}/${id}/${proofId}/${proof.name}`
        : '',
    }
  })
  const uploaded: string[] = []
  try {
    if (proof) {
      // Give every student a separate proof object so later replacements remain independent.
      let next = 0
      let failure: { error: unknown } | undefined
      await Promise.all(
        Array.from({ length: Math.min(4, records.length) }, async () => {
          while (!failure && next < records.length) {
            const record = records[next++]!
            try {
              await uploadObject(record.key, proof.bytes)
              uploaded.push(record.key)
            } catch (error) {
              failure = { error }
            }
          }
        }),
      )
      if (failure) throw failure.error
    }
    db().transaction(() => {
      requireAdmin(event)
      const current = validateBatchLeaves(form, ids, dates)
      const createdAt = new Date().toISOString()
      for (const [index, { student, input }] of current.entries()) {
        const record = records[index]!
        if (student.name !== record.student.name) fail('班级名单已变化，本批未保存，请刷新后重试')
        db()
          .query(
            `INSERT INTO leave_requests(id,studentId,studentName,kind,date,courseName,startAt,endAt,reason,createdAt,proofId) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            record.id,
            student.studentId,
            student.name,
            input.kind,
            input.date,
            input.courseName,
            input.startAt,
            input.endAt,
            input.reason,
            createdAt,
            proof ? record.proofId : null,
          )
        if (proof)
          db()
            .query(
              'INSERT INTO leave_proofs(id,leaveId,name,objectKey,size,createdAt) VALUES(?,?,?,?,?,?)',
            )
            .run(record.proofId, record.id, proof.name, record.key, proof.size, createdAt)
      }
    })()
  } catch (error) {
    await Promise.all(uploaded.map((key) => removeUploadedObject(key)))
    throw error
  }
  return { ok: true, count: records.length, dates }
})
