import { test, expect } from 'bun:test'
import {
  addDays,
  isEveningScheduled,
  shanghaiDate,
  validDate,
  weekdayOf,
} from '../../shared/evening'
import type { EveningSettings, EveningAdjustment } from '../../shared/types'
const settings: EveningSettings = {
  enabled: true,
  weekdays: [1, 3],
  startDate: '2030-01-01',
  endDate: '2030-02-01',
  startTime: '18:30',
  endTime: '20:30',
  originalNotice: '原文',
}
const adjustment = (changes: Partial<EveningAdjustment> = {}): EveningAdjustment => ({
  id: 'a',
  studentId: '001',
  studentName: '甲',
  kind: 'permanent',
  sourceWeekday: 1,
  targetWeekday: 2,
  effectiveFrom: '2030-01-07',
  sourceDate: '',
  targetDate: '',
  reason: '调整',
  status: 'approved',
  createdBy: 'student',
  createdAt: '',
  reviewedAt: '',
  reviewNote: '',
  inactiveFrom: '',
  ...changes,
})
test('schedule uses inclusive dates, Shanghai date and valid calendar days', () => {
  expect(shanghaiDate(new Date('2026-11-10T16:05:00Z'))).toBe('2026-11-11')
  expect(validDate('2030-02-30')).toBe(false)
  expect(validDate('2032-02-29')).toBe(true)
  expect(addDays('2030-01-31', 1)).toBe('2030-02-01')
  expect(weekdayOf('2030-01-06')).toBe(7)
  expect(
    isEveningScheduled(
      { ...settings, startDate: '2030-01-07', endDate: '2030-01-07' },
      [],
      '001',
      '2030-01-07',
    ),
  ).toBe(true)
  expect(isEveningScheduled(settings, [], '001', '2030-02-04')).toBe(false)
  expect(isEveningScheduled({ ...settings, enabled: false }, [], '001', '2030-01-07')).toBe(false)
})
test('only approved changes for that student alter recurring and dated schedules', () => {
  const pending = adjustment({ status: 'pending' })
  expect(isEveningScheduled(settings, [pending], '001', '2030-01-07')).toBe(true)
  expect(isEveningScheduled(settings, [pending], '001', '2030-01-08')).toBe(false)
  const permanent = adjustment()
  expect(isEveningScheduled(settings, [permanent], '001', '2030-01-07')).toBe(false)
  expect(isEveningScheduled(settings, [permanent], '001', '2030-01-08')).toBe(true)
  expect(isEveningScheduled(settings, [permanent], '002', '2030-01-07')).toBe(true)
  const dated = adjustment({
    id: 'b',
    kind: 'dates',
    sourceDate: '2030-01-08',
    targetDate: '2030-01-10',
  })
  expect(isEveningScheduled(settings, [permanent, dated], '001', '2030-01-08')).toBe(false)
  expect(isEveningScheduled(settings, [permanent, dated], '001', '2030-01-10')).toBe(true)
  expect(isEveningScheduled(settings, [permanent, dated], '001', '2030-01-15')).toBe(true)
})
test('revocation preserves preceding dates and stops on its effective date', () => {
  const revoked = adjustment({ status: 'revoked', inactiveFrom: '2030-01-14' })
  expect(isEveningScheduled(settings, [revoked], '001', '2030-01-08')).toBe(true)
  expect(isEveningScheduled(settings, [revoked], '001', '2030-01-14')).toBe(true)
  expect(isEveningScheduled(settings, [revoked], '001', '2030-01-15')).toBe(false)
})
