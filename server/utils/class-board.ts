import type { Affair, ClassBoardItem, Task } from '../../shared/types'

export function classBoardItems(
  affairs: Affair[],
  tasks: Task[],
  now = Date.now(),
): ClassBoardItem[] {
  const items: ClassBoardItem[] = []
  const shownTasks = new Set<string>()
  for (const affair of affairs) {
    if (
      affair.closed ||
      Date.parse(affair.dueAt) <= now ||
      (affair.mode === 'link' && affair.completed)
    )
      continue
    if (affair.mode === 'files') {
      if (!affair.taskId || !affair.taskShareToken || shownTasks.has(affair.taskId)) continue
      shownTasks.add(affair.taskId)
    }
    items.push({
      key: `affair-${affair.id}`,
      title: affair.title,
      category: affair.category,
      description: affair.description,
      originalNotice: affair.originalNotice,
      kind: affair.mode,
      dueAt: affair.dueAt,
      url:
        affair.mode === 'link'
          ? affair.url
          : affair.mode === 'form'
            ? `/fill/${affair.shareToken}`
            : `/submit/${affair.taskShareToken}`,
    })
  }
  for (const task of tasks) {
    if (task.closed || Date.parse(task.dueAt) <= now || shownTasks.has(task.id)) continue
    items.push({
      key: `task-${task.id}`,
      title: task.title,
      category: task.subject,
      description: task.description,
      originalNotice: task.originalNotice,
      kind: 'files',
      dueAt: task.dueAt,
      url: `/submit/${task.shareToken}`,
    })
  }
  return items.sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.title.localeCompare(b.title, 'zh-CN'),
  )
}
