import { requireAdmin } from '../../../utils/auth'
import { eveningSettings, adjustments } from '../../../utils/evening'
import { listStudents } from '../../../utils/db'
export default defineEventHandler((event) => {
  requireAdmin(event)
  return { settings: eveningSettings(), adjustments: adjustments(), students: listStudents() }
})
