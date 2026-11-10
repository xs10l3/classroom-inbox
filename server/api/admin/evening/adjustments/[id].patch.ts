import { z } from 'zod'
import { requireAdmin } from '../../../../utils/auth'
import { boundedJson, validate } from '../../../../utils/validation'
import { db } from '../../../../utils/db'
import {
  fail,
  validateNewAdjustment,
  validateSchedule,
  eveningSettings,
  adjustments,
} from '../../../../utils/evening'
import { shanghaiDate } from '../../../../../shared/evening'
import type { EveningAdjustment } from '../../../../../shared/types'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const input = validate(
    z.object({
      action: z.enum(['approve', 'reject', 'revoke']),
      reviewNote: z.string().trim().max(1000).default(''),
    }),
    await boundedJson(event),
  )
  const entry = db()
    .query<EveningAdjustment, [string]>('SELECT * FROM evening_adjustments WHERE id=?')
    .get(getRouterParam(event, 'id')!)
  if (!entry) throw createError({ statusCode: 404, message: '调整记录不存在' })
  if (input.action === 'revoke') {
    if (entry.status !== 'approved') fail('只能撤销已通过的调整')
    if (
      entry.kind === 'dates' &&
      (entry.sourceDate < shanghaiDate() || entry.targetDate < shanghaiDate())
    )
      fail('该日期调整已开始，不能撤销历史安排')
    validateSchedule(
      eveningSettings(),
      adjustments().map((a) =>
        a.id === entry.id ? { ...a, status: 'revoked', inactiveFrom: shanghaiDate() } : a,
      ),
    )
  } else {
    if (entry.status !== 'pending') fail('该申请已经处理')
    if (input.action === 'approve') validateNewAdjustment(entry)
  }
  const status =
    input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'revoked'
  db()
    .query(
      'UPDATE evening_adjustments SET status=?,reviewedAt=?,reviewNote=?,inactiveFrom=? WHERE id=?',
    )
    .run(
      status,
      new Date().toISOString(),
      input.reviewNote,
      input.action === 'revoke' ? shanghaiDate() : '',
      entry.id,
    )
  return { ok: true }
})
