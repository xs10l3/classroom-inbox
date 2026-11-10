import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { boundedJson } from '../../utils/validation'
import { normalizeAffairs } from '../../utils/affair-input'
import { createAffairs } from '../../utils/affairs'
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  return { affairs: createAffairs(normalizeAffairs(await boundedJson(event, 512 * 1024))) }
})
