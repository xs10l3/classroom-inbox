import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { appConfig } from './config'
import type { Student, Task, Submission } from '../../shared/types'

let database: Database | undefined

export function db() {
  if (database) return database
  const dir = appConfig().dataDir
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  database = new Database(join(dir, 'classroom.sqlite'), { create: true })
  database.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS students (
      studentId TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
      description TEXT NOT NULL, originalNotice TEXT NOT NULL DEFAULT '', dueAt TEXT NOT NULL, createdAt TEXT NOT NULL,
      shareToken TEXT NOT NULL UNIQUE, extensions TEXT NOT NULL,
      maxSizeMb INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS task_students (
      taskId TEXT NOT NULL REFERENCES tasks(id), studentId TEXT NOT NULL,
      name TEXT NOT NULL, gender TEXT,
      PRIMARY KEY (taskId, studentId)
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
      studentId TEXT NOT NULL, studentName TEXT NOT NULL, originalName TEXT NOT NULL,
      storedName TEXT NOT NULL, objectKey TEXT NOT NULL UNIQUE, size INTEGER NOT NULL,
      submittedAt TEXT NOT NULL, late INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_submission_active ON submissions(taskId, studentId, active);
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS affairs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, originalNotice TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL, dueAt TEXT NOT NULL,
      createdAt TEXT NOT NULL, shareToken TEXT NOT NULL UNIQUE,
      closed INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '', taskId TEXT REFERENCES tasks(id), fields TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS affair_students (
      affairId TEXT NOT NULL REFERENCES affairs(id), studentId TEXT NOT NULL,
      name TEXT NOT NULL, gender TEXT, PRIMARY KEY(affairId,studentId)
    );
    CREATE TABLE IF NOT EXISTS form_responses (
      affairId TEXT NOT NULL REFERENCES affairs(id), studentId TEXT NOT NULL,
      studentName TEXT NOT NULL, answers TEXT NOT NULL, submittedAt TEXT NOT NULL,
      PRIMARY KEY(affairId,studentId)
    );
  `)
  // Additive migration preserves installations created before original notices were introduced.
  for (const table of ['tasks', 'affairs']) {
    const columns = database.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all()
    if (!columns.some((column) => column.name === 'originalNotice'))
      database.exec(`ALTER TABLE ${table} ADD COLUMN originalNotice TEXT NOT NULL DEFAULT ''`)
  }
  return database
}

type TaskRow = Omit<Task, 'extensions' | 'closed'> & { extensions: string; closed: number }

export function listStudents(): Student[] {
  return db().query<Student, []>('SELECT * FROM students ORDER BY studentId').all()
}

export function taskStudents(taskId: string): Student[] {
  return db()
    .query<Student, [string]>(
      'SELECT studentId, name, gender FROM task_students WHERE taskId = ? ORDER BY studentId',
    )
    .all(taskId)
}

export function listTasks(): Task[] {
  return db()
    .query<TaskRow, []>(
      `
    SELECT t.*,
      (SELECT COUNT(*) FROM task_students WHERE taskId=t.id) AS totalStudents,
      (SELECT COUNT(DISTINCT studentId) FROM submissions WHERE taskId=t.id AND active=1) AS submittedCount,
      (SELECT COUNT(*) FROM submissions WHERE taskId=t.id AND active=1) AS fileCount
    FROM tasks t ORDER BY t.createdAt DESC, t.id DESC
  `,
    )
    .all()
    .map((t) => ({ ...t, closed: Boolean(t.closed), extensions: JSON.parse(t.extensions) }))
}

export function findTask(id: string): Task | undefined {
  return listTasks().find((t) => t.id === id)
}

export function findPublicTask(token: string): Task | undefined {
  return listTasks().find((t) => t.shareToken === token)
}

export function taskSubmissions(taskId: string): Submission[] {
  return db()
    .query<Omit<Submission, 'late'> & { late: number }, [string]>(
      'SELECT * FROM submissions WHERE taskId=? AND active=1 ORDER BY studentId, submittedAt DESC',
    )
    .all(taskId)
    .map((s) => ({ ...s, late: Boolean(s.late) }))
}
