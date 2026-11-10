import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto'
import { createError, getCookie, setCookie, getRequestIP, type H3Event } from 'h3'
import { authConfig } from './config'
import { db } from './db'

const cookieName = 'classroom_session'

export function constantEqual(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  )
}

function signature(value: string) {
  const { secret, password } = authConfig()
  return createHmac('sha256', `${secret}:${password}`).update(value).digest('base64url')
}

export function isAdmin(event: H3Event) {
  const token = getCookie(event, cookieName)
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !constantEqual(signature(payload), sig)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.role === 'admin' && Number(data.exp) > Date.now()
  } catch {
    return false
  }
}

export function requireAdmin(event: H3Event) {
  if (!isAdmin(event)) throw createError({ statusCode: 401, message: '请先登录管理端' })
}

export function createAdminSession(event: H3Event) {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      exp: Date.now() + 12 * 3600_000,
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url')
  setCookie(event, cookieName, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 12 * 3600,
    path: '/',
  })
}

export function rateLimit(event: H3Event, scope: string, max: number, windowMs: number) {
  const ip = getRequestIP(event, { xForwardedFor: process.env.TRUST_PROXY === 'true' }) || 'unknown'
  const key = createHash('sha256').update(`${scope}:${ip}`).digest('hex')
  const now = Date.now()
  const record = db().transaction(() => {
    db().query('DELETE FROM rate_limits WHERE resetAt < ?').run(now)
    db()
      .query(
        `INSERT INTO rate_limits(key,count,resetAt) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1`,
      )
      .run(key, now + windowMs)
    return db()
      .query<{ count: number }, [string]>('SELECT count FROM rate_limits WHERE key=?')
      .get(key)!
  })()
  if (record.count > max) throw createError({ statusCode: 429, message: '操作太频繁，请稍后再试' })
}
