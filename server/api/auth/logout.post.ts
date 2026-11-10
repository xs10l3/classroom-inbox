import { defineEventHandler, deleteCookie } from 'h3'
export default defineEventHandler((event) => {
  deleteCookie(event, 'classroom_session', { path: '/' })
  return { ok: true }
})
