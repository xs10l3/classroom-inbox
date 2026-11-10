import { requireAdmin } from '../../../utils/auth'
import { boundedJson, validate } from '../../../utils/validation'
import { settingsSchema, validateSchedule, adjustments } from '../../../utils/evening'
import { db } from '../../../utils/db'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const settings = validate(settingsSchema, await boundedJson(event, 96 * 1024))
  validateSchedule(settings, adjustments())
  db()
    .query(
      'INSERT INTO evening_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
    )
    .run(JSON.stringify(settings))
  return { ok: true, settings }
})
