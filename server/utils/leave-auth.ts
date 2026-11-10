import { createHmac } from 'node:crypto'
import { createError, getCookie, setCookie, deleteCookie, type H3Event } from 'h3'
import { authConfig } from './config'
import { constantEqual } from './auth'
import { currentStudent } from './evening'
import type { Student } from '../../shared/types'
const cookie = 'classroom_leave_session'
const sign = (payload: string) =>
  createHmac('sha256', authConfig().secret).update(`student-leave:${payload}`).digest('base64url')
export function leaveStudent(event: H3Event) {
  const token = getCookie(event, cookie)
  if (!token || token.length > 2048) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !constantEqual(sign(payload), sig)) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof value.studentId !== 'string' || value.exp <= Date.now()) return null
    const student = currentStudent(value.studentId)
    return student?.name === value.name ? student : null
  } catch {
    return null
  }
}
export function requireLeaveStudent(event: H3Event) {
  const student = leaveStudent(event)
  if (!student) throw createError({ statusCode: 401, message: '请先填写本人姓名和学号' })
  return student
}
export function setLeaveSession(event: H3Event, student: Student) {
  const payload = Buffer.from(
    JSON.stringify({
      studentId: student.studentId,
      name: student.name,
      exp: Date.now() + 2 * 3600_000,
    }),
  ).toString('base64url')
  setCookie(event, cookie, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7200,
    path: '/',
  })
}
export function clearLeaveSession(event: H3Event) {
  deleteCookie(event, cookie, { path: '/' })
}
