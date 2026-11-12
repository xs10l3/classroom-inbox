export interface DownloadFile {
  name: string
  size: number | null
  status: 'pending' | 'preparing' | 'ready' | 'failed'
  preparedBytes: number
}

export interface PreparedDownload {
  id: string
  name: string
  status: 'preparing' | 'ready' | 'failed'
  phase: 'queued' | 'preparing' | 'packing' | 'ready' | 'failed'
  files: DownloadFile[]
  size: number
  expiresAt: string
  error?: string
  url: string | null
}
