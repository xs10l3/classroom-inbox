export function formatDate(value: string, full = false) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(full ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value))
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function calendarDay(value: string) {
  return (
    new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', day: '2-digit' })
      .formatToParts(new Date(value))
      .find((part) => part.type === 'day')?.value || ''
  )
}

export function apiError(error: unknown) {
  const e = error as { data?: { message?: string; statusMessage?: string }; message?: string }
  return e?.data?.message || e?.data?.statusMessage || '操作失败，请稍后重试'
}

export function localDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return parts.replace(' ', 'T')
}

export function inputToIso(value: string) {
  return new Date(`${value}:00+08:00`).toISOString()
}
