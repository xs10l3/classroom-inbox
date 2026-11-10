import { describe, expect, test } from 'bun:test'
import { normalizeAffairs } from '../../server/utils/affair-input'
import { validateAnswers } from '../../server/utils/affairs'
import { affairExample } from '../../shared/affair-template'
import type { Affair } from '../../shared/types'

const sample = () => JSON.parse(JSON.stringify(affairExample))
describe('事务 JSON 校验', () => {
  test('normalizes all modes and creates file defaults', () => {
    const input = sample()
    delete input[1].collection
    input.push({
      title: '外部问卷',
      mode: 'link',
      original_notice: '通知原文',
      due_at: '2030-12-01T20:00:00+08:00',
      url: 'https://example.com/form',
    })
    const result = normalizeAffairs(input)
    expect(result[0]!.fields[1]!.options).toEqual([])
    expect(result[1]!.collection?.extensions).toContain('pdf')
    expect(result[2]!.category).toBe('班级事务')
  })
  test('requires and preserves the exact original notice', () => {
    const input = sample()
    input[0].original_notice = '  通知原文：\n请按时参加。\n  '
    expect(normalizeAffairs(input)[0]!.original_notice).toBe(input[0].original_notice)
    delete input[0].original_notice
    expect(() => normalizeAffairs(input)).toThrow()
  })
  test('rejects malformed imports, expired dates and invalid external URLs', () => {
    expect(() => normalizeAffairs({})).toThrow('数组')
    expect(() => normalizeAffairs(Array(51).fill(sample()[0]))).toThrow('50')
    const input = sample()
    input[0].due_at = '2020-01-01T00:00:00Z'
    expect(() => normalizeAffairs(input)).toThrow('第 1 条事务')
    for (const url of [
      'javascript:alert(1)',
      'http://example.com',
      'https://user:secret@example.com',
    ]) {
      expect(() =>
        normalizeAffairs([
          {
            title: '问卷',
            mode: 'link',
            original_notice: '通知原文',
            due_at: '2030-12-01T20:00:00+08:00',
            url,
          },
        ]),
      ).toThrow('HTTPS')
    }
  })
  test('rejects duplicate keys, missing choices and mixed modes', () => {
    const input = sample()
    input[0].fields[1].key = input[0].fields[0].key
    expect(() => normalizeAffairs(input)).toThrow('key 不能重复')
    input[0].fields[0].options = ['参加']
    expect(() => normalizeAffairs(input)).toThrow('两个选项')
    const files = sample()[1]
    files.task_id = 'existing-task'
    expect(() => normalizeAffairs([files])).toThrow('移除 collection')
  })
  test('validates response values against actual form fields', () => {
    const fields = normalizeAffairs(sample())[0]!.fields
    fields.push(
      { key: 'day', label: '日期', type: 'date', required: false, options: [] },
      { key: 'num', label: '数量', type: 'number', required: false, options: [] },
    )
    const affair = { fields } as Affair
    expect(validateAnswers(affair, { participation: '参加', num: 0 }).num).toBe('0')
    expect(() => validateAnswers(affair, {})).toThrow('请填写')
    expect(() => validateAnswers(affair, { participation: '随便' })).toThrow('有效选项')
    expect(() => validateAnswers(affair, { participation: '参加', num: 'Infinity' })).toThrow(
      '有效数字',
    )
    expect(() => validateAnswers(affair, { participation: '参加', day: '2030-02-30' })).toThrow(
      '有效日期',
    )
    expect(() =>
      validateAnswers(affair, { participation: '参加', remark: 'a'.repeat(2001) }),
    ).toThrow('2000')
    expect(() => validateAnswers(affair, { participation: '参加', extra: 'x' })).toThrow(
      '字段已变更',
    )
  })
})
