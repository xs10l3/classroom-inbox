import { defineEventHandler, createError } from 'h3'
import { z } from 'zod'
import { rateLimit, constantEqual, createAdminSession } from '../../utils/auth'
import { authConfig } from '../../utils/config'
import { boundedJson, validate } from '../../utils/validation'
export default defineEventHandler(async (event) => {
  rateLimit(event, 'login', 10, 15 * 60_000)
  const body = validate(z.object({ password: z.string().max(500) }), await boundedJson(event))
  if (!constantEqual(body.password, authConfig().password))
    throw createError({ statusCode: 401, message: '管理密码不正确' })
  createAdminSession(event)
  return { ok: true }
})
