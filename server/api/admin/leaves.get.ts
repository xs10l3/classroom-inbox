import { requireAdmin } from '../../utils/auth'
import { dailyEvening, requireDay } from '../../utils/evening'
import { shanghaiDate } from '../../../shared/evening'
export default defineEventHandler((event) => {
  requireAdmin(event)
  return dailyEvening(requireDay(getQuery(event).date || shanghaiDate()))
})
