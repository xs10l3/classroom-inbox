import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { boundedJson } from '../../utils/validation'
import { normalizeAffairs } from '../../utils/affair-input'
import { checkAffairImports } from '../../utils/affairs'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const affairs = normalizeAffairs(await boundedJson(event, 512 * 1024))
  checkAffairImports(affairs)
  return { affairs }
})
