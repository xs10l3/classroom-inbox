import type { Dashboard } from '../../shared/types'

export function useClassroom() {
  return useFetch<Dashboard>('/api/dashboard', { key: 'classroom-dashboard' })
}

export function useNotice() {
  const notice = useState<{ text: string; error: boolean } | null>('notice', () => null)
  let timer: ReturnType<typeof setTimeout>
  function notify(text: string, error = false) {
    clearTimeout(timer)
    notice.value = { text, error }
    timer = setTimeout(() => {
      notice.value = null
    }, 4500)
  }
  return { notice, notify }
}
