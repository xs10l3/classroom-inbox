import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { boundedJson, normalizeRoster } from '../../utils/validation'
import { db } from '../../utils/db'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await boundedJson(event, 512 * 1024)
  const students = normalizeRoster(body?.students)
  db().transaction(() => {
    db().query('DELETE FROM students').run()
    const insert = db().prepare('INSERT INTO students(studentId,name,gender) VALUES(?,?,?)')
    for (const s of students) insert.run(s.studentId, s.name, s.gender)
  })()
  return { ok: true, count: students.length }
})
