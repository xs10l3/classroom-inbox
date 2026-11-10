import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { listAffairs } from '../../utils/affairs'
export default defineEventHandler((event) => {
  requireAdmin(event)
  return { affairs: listAffairs() }
})
