import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { findAffair, affairStudents, affairResponses } from '../../utils/affairs'
export default defineEventHandler((event) => {
  requireAdmin(event)
  const affair = findAffair(getRouterParam(event, 'id')!)
  if (!affair) throw createError({ statusCode: 404, message: '事务不存在' })
  return { affair, students: affairStudents(affair.id), responses: affairResponses(affair.id) }
})
