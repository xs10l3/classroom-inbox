import { defineEventHandler } from 'h3'
import { requireAdmin } from '../utils/auth'
import { db, listStudents, listTasks } from '../utils/db'
import { appConfig, obsConfigured } from '../utils/config'
import type { Dashboard, Submission } from '../../shared/types'
export default defineEventHandler((event) => {
  requireAdmin(event)
  const config = appConfig()
  const recent = db()
    .query<Submission & { taskTitle: string }, []>(
      `
    SELECT s.*, t.title AS taskTitle FROM submissions s JOIN tasks t ON t.id=s.taskId
    WHERE s.active=1 ORDER BY s.submittedAt DESC LIMIT 8
  `,
    )
    .all()
  return {
    className: config.className,
    students: listStudents(),
    tasks: listTasks(),
    recentSubmissions: recent,
    storage: { configured: obsConfigured(), maxSizeMb: config.maxSizeMb },
    appUrl: config.appUrl,
    totalSize: db()
      .query<{ total: number }, []>('SELECT COALESCE(SUM(size),0) AS total FROM submissions')
      .get()!.total,
  } satisfies Dashboard
})
