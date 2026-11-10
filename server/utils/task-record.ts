import { randomBytes, randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { Student } from '../../shared/types'
import { db } from './db'
import { taskSchema } from './validation'

// Caller owns the transaction so an affair and its collection commit together.
export function createTaskRecord(input: z.infer<typeof taskSchema>, students: Student[]) {
  const id = randomUUID()
  db()
    .prepare(
      `INSERT INTO tasks(id,title,subject,description,originalNotice,dueAt,createdAt,shareToken,extensions,maxSizeMb)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.title,
      input.subject,
      input.description,
      input.originalNotice,
      new Date(input.dueAt).toISOString(),
      new Date().toISOString(),
      randomBytes(24).toString('base64url'),
      JSON.stringify([...new Set(input.extensions)]),
      input.maxSizeMb,
    )
  const insert = db().prepare(
    'INSERT INTO task_students(taskId,studentId,name,gender) VALUES(?,?,?,?)',
  )
  for (const student of students) insert.run(id, student.studentId, student.name, student.gender)
  return id
}
