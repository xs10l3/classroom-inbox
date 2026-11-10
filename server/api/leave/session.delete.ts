import { clearLeaveSession } from '../../utils/leave-auth'
export default defineEventHandler((event) => {
  clearLeaveSession(event)
  return { ok: true }
})
