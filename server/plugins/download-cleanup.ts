import { cleanupDownloads } from '../utils/downloads'
export default defineNitroPlugin((nitro) => {
  let cleaning = false
  const clean = async () => {
    if (cleaning) return
    cleaning = true
    try {
      await cleanupDownloads()
    } catch {
      console.error('[Download] Temporary cleanup failed')
    } finally {
      cleaning = false
    }
  }
  void clean()
  const timer = setInterval(() => void clean(), 60_000)
  timer.unref()
  nitro.hooks.hook('close', () => clearInterval(timer))
})
