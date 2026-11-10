import { createError } from 'h3'

export function appConfig() {
  return {
    className: process.env.CLASS_NAME || '我们的班级',
    appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
    dataDir: process.env.DATA_DIR || '.data',
    maxSizeMb: Math.min(100, Math.max(1, Number(process.env.UPLOAD_MAX_MB) || 50)),
    obsEndpoint: process.env.OBS_ENDPOINT || '',
    obsBucket: process.env.OBS_BUCKET || '',
    obsRegion: process.env.OBS_REGION || 'cn-east-3',
    obsAccessKey: process.env.OBS_ACCESS_KEY_ID || '',
    obsSecretKey: process.env.OBS_SECRET_ACCESS_KEY || '',
    obsToken: process.env.OBS_SECURITY_TOKEN || '',
    obsPrefix: (process.env.OBS_PREFIX || 'classroom').replace(/^\/+|\/+$/g, ''),
  }
}

export function obsConfigured() {
  const c = appConfig()
  return Boolean(c.obsEndpoint && c.obsBucket && c.obsAccessKey && c.obsSecretKey)
}

export function authConfig() {
  const password = process.env.ADMIN_PASSWORD || ''
  const secret = process.env.SESSION_SECRET || ''
  if (
    password.length < 10 ||
    secret.length < 32 ||
    password.startsWith('replace-') ||
    secret.startsWith('replace-')
  ) {
    throw createError({
      statusCode: 503,
      message: '请先在 .env 中设置管理员密码（至少 10 位）和会话密钥（至少 32 位）',
    })
  }
  return { password, secret }
}
