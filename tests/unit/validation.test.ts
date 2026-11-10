import { describe, expect, test } from 'bun:test'
import { normalizeRoster, safeName, taskSchema } from '../../server/utils/validation'
import { parseCsv, makeCsv } from '../../server/utils/roster-import'

describe('roster validation', () => {
  test('preserves leading zeroes and accepts the supplied JSON field convention', () => {
    expect(normalizeRoster([{ name: '测试同学', student_id: '00123', gender: 'F' }])).toEqual([
      { name: '测试同学', studentId: '00123', gender: 'F' },
    ])
  })
  test('rejects duplicate or missing IDs instead of guessing', () => {
    expect(() =>
      normalizeRoster([
        { name: '甲', student_id: '1' },
        { name: '乙', student_id: '1' },
      ]),
    ).toThrow('重复')
    expect(() => normalizeRoster([{ name: '甲' }])).toThrow('学号')
    expect(() => normalizeRoster([])).toThrow()
  })
  test('parses BOM, commas, escaped quotes and line breaks in CSV', () => {
    const csv = '\uFEFF学号,姓名,性别\r\n001,"测,试",女\r\n002,"带""引号",男'
    expect(normalizeRoster(parseCsv(csv))).toEqual([
      { studentId: '001', name: '测,试', gender: 'F' },
      { studentId: '002', name: '带"引号', gender: 'M' },
    ])
    expect(() => parseCsv('name\n"abc')).toThrow()
  })
  test('uses text-only gender as optional metadata', () => {
    expect(normalizeRoster([{ 姓名: '甲', 学号: '123' }])[0]?.gender).toBeNull()
    expect(() => normalizeRoster([{ name: '甲', studentId: '123', gender: 'invalid' }])).toThrow(
      '性别',
    )
  })
})

describe('export and file safeguards', () => {
  test('neutralizes spreadsheet formulas in exported CSV', () => {
    expect(makeCsv([['=HYPERLINK("bad")', '+cmd', '@x', '普通文本']])).toContain(
      '"\'=HYPERLINK(""bad"")"',
    )
  })
  test('removes traversal and control characters from generated filenames', () => {
    expect(safeName('../../甲\\乙\u0000.pdf')).not.toMatch(/[\\/\u0000]/)
    expect(safeName('../../甲.pdf')).not.toContain('..')
  })
  test('rejects ambiguous deadlines and unsafe extensions', () => {
    const valid = {
      title: '习题',
      subject: '数学',
      originalNotice: '请按时完成本次习题。',
      dueAt: '2030-01-01T12:00:00+08:00',
      extensions: ['pdf'],
      maxSizeMb: 20,
    }
    expect(taskSchema.safeParse(valid).success).toBe(true)
    expect(taskSchema.safeParse({ ...valid, dueAt: '2030-01-01T12:00' }).success).toBe(false)
    expect(taskSchema.safeParse({ ...valid, extensions: ['../pdf'] }).success).toBe(false)
  })
})
