export interface Student {
  studentId: string
  name: string
  gender: 'F' | 'M' | null
}

export interface Task {
  id: string
  title: string
  subject: string
  description: string
  originalNotice: string
  dueAt: string
  createdAt: string
  shareToken: string
  extensions: string[]
  maxSizeMb: number
  closed: boolean
  submittedCount: number
  totalStudents: number
  fileCount: number
}

export interface Submission {
  id: string
  taskId: string
  studentId: string
  studentName: string
  originalName: string
  storedName: string
  objectKey: string
  size: number
  submittedAt: string
  late: boolean
}

export interface Dashboard {
  className: string
  students: Student[]
  tasks: Task[]
  recentSubmissions: (Submission & { taskTitle: string })[]
  storage: { configured: boolean; maxSizeMb: number }
  appUrl: string
  totalSize: number
}

export interface FormField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'date'
  required: boolean
  options: string[]
}

export interface Affair {
  id: string
  title: string
  category: string
  description: string
  originalNotice: string
  mode: 'form' | 'link' | 'files'
  dueAt: string
  createdAt: string
  shareToken: string
  closed: boolean
  completed: boolean
  url: string
  taskId: string | null
  fields: FormField[]
  responseCount: number
  totalStudents: number
  taskShareToken: string | null
}

export interface FormResponse {
  affairId: string
  studentId: string
  studentName: string
  answers: Record<string, string>
  submittedAt: string
}

export interface ClassBoardItem {
  key: string
  title: string
  category: string
  description: string
  originalNotice: string
  kind: 'form' | 'link' | 'files'
  dueAt: string
  url: string
}

export interface EveningSettings {
  enabled: boolean
  weekdays: number[]
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  originalNotice: string
}

export interface EveningAdjustment {
  id: string
  studentId: string
  studentName: string
  kind: 'permanent' | 'dates'
  sourceWeekday: number | null
  targetWeekday: number | null
  effectiveFrom: string
  sourceDate: string
  targetDate: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'withdrawn'
  createdBy: 'student' | 'admin'
  createdAt: string
  reviewedAt: string
  reviewNote: string
  inactiveFrom: string
}

export interface LeaveRecord {
  id: string
  studentId: string
  studentName: string
  kind: 'evening' | 'course'
  date: string
  courseName: string
  startAt: string
  endAt: string
  reason: string
  createdAt: string
  cancelledAt: string
  proof: { id: string; name: string; size: number; createdAt: string } | null
}
