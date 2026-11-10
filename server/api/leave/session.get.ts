import { leaveStudent } from '../../utils/leave-auth'
export default defineEventHandler((event) => ({ student: leaveStudent(event) }))
