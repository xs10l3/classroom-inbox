import { expect, test } from 'bun:test'
import { classBoardItems } from '../../server/utils/class-board'
import type { Task, Affair } from '../../shared/types'

const task = (id: string, changes: Partial<Task> = {}): Task => ({
  id,
  title: id,
  subject: '课程',
  description: '',
  originalNotice: '原文',
  dueAt: '2030-12-01T00:00:00Z',
  createdAt: '',
  shareToken: `token-${id}`,
  extensions: ['pdf'],
  maxSizeMb: 20,
  closed: false,
  submittedCount: 0,
  totalStudents: 2,
  fileCount: 0,
  ...changes,
})
const affair = (id: string, changes: Partial<Affair> = {}): Affair => ({
  id,
  title: id,
  category: '班级',
  description: '',
  originalNotice: '原文',
  dueAt: '2030-12-01T00:00:00Z',
  createdAt: '',
  shareToken: `token-${id}`,
  closed: false,
  completed: false,
  mode: 'form',
  url: '',
  taskId: null,
  fields: [],
  responseCount: 0,
  totalStudents: 2,
  taskShareToken: null,
  ...changes,
})
test('class board filters unavailable items, deduplicates collections and sorts by deadline', () => {
  const items = classBoardItems(
    [
      affair('first', { dueAt: '2030-11-30T00:00:00Z' }),
      affair('collection', { mode: 'files', taskId: 'linked', taskShareToken: 'token-linked' }),
      affair('duplicate', { mode: 'files', taskId: 'linked', taskShareToken: 'token-linked' }),
      affair('closed', { closed: true }),
      affair('expired', { dueAt: '2020-01-01T00:00:00Z' }),
      affair('done', { mode: 'link', completed: true, url: 'https://example.com' }),
    ],
    [task('linked'), task('unlinked'), task('closed-task', { closed: true })],
    Date.parse('2026-11-10T00:00:00Z'),
  )
  expect(items.map((item) => item.title)).toEqual(['first', 'collection', 'unlinked'])
  expect(items[0]!.originalNotice).toBe('原文')
  expect(items[0]).not.toHaveProperty('totalStudents')
})
