import type { EveningAdjustment, EveningSettings } from './types'

export const eveningWeekdays = [1, 2, 3, 4, 5, 7]
export const weekdayLabels: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

export function shanghaiDate(now: Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now)
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function isEveningScheduled(
  settings: EveningSettings,
  adjustments: EveningAdjustment[],
  studentId: string,
  date: string,
) {
  if (!settings.enabled || !validDate(date) || date < settings.startDate || date > settings.endDate)
    return false
  const weekday = weekdayOf(date)
  let scheduled = settings.weekdays.includes(weekday)
  const applicable = adjustments.filter(
    (entry) =>
      entry.studentId === studentId &&
      (entry.status === 'approved' || entry.status === 'revoked') &&
      (!entry.inactiveFrom || date < entry.inactiveFrom),
  )
  for (const entry of applicable.filter((item) => item.kind === 'permanent')) {
    if (date < entry.effectiveFrom) continue
    if (weekday === entry.sourceWeekday) scheduled = false
    if (weekday === entry.targetWeekday) scheduled = true
  }
  // Specific-date changes are applied after recurring changes.
  for (const entry of applicable.filter((item) => item.kind === 'dates')) {
    if (date === entry.sourceDate) scheduled = false
    if (date === entry.targetDate) scheduled = true
  }
  return scheduled
}

export function adjustmentLabel(entry: EveningAdjustment) {
  return entry.kind === 'permanent'
    ? `${weekdayLabels[entry.sourceWeekday!] || ''} → ${weekdayLabels[entry.targetWeekday!] || ''}（每周，${entry.effectiveFrom}起）`
    : `${entry.sourceDate} → ${entry.targetDate}`
}

export const adjustmentStatuses: Record<EveningAdjustment['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  revoked: '已撤销',
  withdrawn: '已撤回',
}
