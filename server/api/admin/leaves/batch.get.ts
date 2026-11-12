import { requireAdmin } from '../../../utils/auth'
import { listStudents } from '../../../utils/db'
import { dailyEvening } from '../../../utils/evening'
import { proofLimitMb } from '../../../utils/leave-files'
import { batchDates } from '../../../utils/leave-batch'

export default defineEventHandler((event) => {
  requireAdmin(event)
  const rawDates = getQuery(event).dates
  const dates = batchDates(
    typeof rawDates === 'string' && rawDates.length <= 400 ? rawDates.split(',') : [],
  )
  const reports = dates.map(dailyEvening)
  return {
    students: listStudents(),
    dates,
    settings: reports[0]!.settings,
    expectedIds: Object.fromEntries(
      reports.map((report) => [report.date, report.expected.map((student) => student.studentId)]),
    ),
    activeLeaves: reports.flatMap((report) =>
      report.leaves
        .filter((leave) => !leave.cancelledAt)
        .map((leave) => ({
          date: leave.date,
          studentId: leave.studentId,
          kind: leave.kind,
          startAt: leave.startAt,
          endAt: leave.endAt,
        })),
    ),
    proofLimitMb: proofLimitMb(),
  }
})
