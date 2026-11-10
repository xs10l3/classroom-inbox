import { requireLeaveStudent } from '../../utils/leave-auth'
import { eveningSettings, adjustments, leaveRecords } from '../../utils/evening'
import { addDays, isEveningScheduled, shanghaiDate } from '../../../shared/evening'
export default defineEventHandler((event) => {
  const student = requireLeaveStudent(event),
    settings = eveningSettings(),
    entries = adjustments(student.studentId),
    upcoming: string[] = []
  for (let i = 0; i < 42; i++) {
    const day = addDays(shanghaiDate(), i)
    if (isEveningScheduled(settings, entries, student.studentId, day)) upcoming.push(day)
  }
  return { student, leaves: leaveRecords(student.studentId), adjustments: entries, upcoming }
})
