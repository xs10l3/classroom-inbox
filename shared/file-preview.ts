export type FilePreviewKind = 'pdf' | 'image'

export function filePreviewKind(name: string): FilePreviewKind | null {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'pdf'
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension || '') ? 'image' : null
}
