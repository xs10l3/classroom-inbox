import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

if (existsSync('.env')) {
  console.log('.env 已存在，保留原配置。')
} else {
  const content = readFileSync('.env.example', 'utf8')
    .replace('replace-with-a-long-random-password', randomBytes(18).toString('base64url'))
    .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('base64url'))
  writeFileSync('.env', content, { mode: 0o600 })
  console.log('已生成 .env，内含随机管理员密码与会话密钥。请在编辑器中打开并填写 OBS 配置。')
}
