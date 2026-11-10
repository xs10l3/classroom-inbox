import { defineEventHandler, setHeaders, getHeader, getRequestURL, createError } from 'h3'

export default defineEventHandler((event) => {
  setHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  if (!event.path.startsWith('/api/')) return
  setHeaders(event, { 'Cache-Control': 'no-store' })
  if (['GET', 'HEAD', 'OPTIONS'].includes(event.method)) return
  const origin = getHeader(event, 'origin')
  const allowed = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : getRequestURL(event).origin
  if (getHeader(event, 'sec-fetch-site') === 'cross-site' || (origin && origin !== allowed)) {
    throw createError({ statusCode: 403, message: '不允许跨站提交' })
  }
})
