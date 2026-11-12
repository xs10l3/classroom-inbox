import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { downloadObject } from './obs'

export type ArchiveEntry =
  { name: string; objectKey: string; size: number } | { name: string; content: string | Buffer }

export type DownloadProgressEvent =
  | { type: 'start'; index: number }
  | { type: 'bytes'; index: number; bytes: number }
  | { type: 'complete'; index: number; size: number }
  | { type: 'packing' }
export type DownloadProgress = (event: DownloadProgressEvent) => void

export async function writeObjectFile(
  destination: string,
  objectKey: string,
  expectedSize: number,
  onBytes?: (bytes: number) => void,
) {
  const source = await downloadObject(objectKey)
  let bytes = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      onBytes?.(bytes)
      callback(null, chunk)
    },
  })
  await pipeline(source, counter, createWriteStream(destination, { mode: 0o600 }))
  if ((await stat(destination)).size !== expectedSize)
    throw new Error('Incomplete storage download')
}

export async function writeDownloadArchive(
  destination: string,
  entries: ArchiveEntry[],
  progress: DownloadProgress,
) {
  const staged: string[] = []
  try {
    for (const [index, entry] of entries.entries()) {
      progress({ type: 'start', index })
      if ('objectKey' in entry) {
        const path = join(dirname(destination), `part-${index}`)
        staged.push(path)
        await writeObjectFile(path, entry.objectKey, entry.size, (bytes) =>
          progress({ type: 'bytes', index, bytes }),
        )
        progress({ type: 'complete', index, size: entry.size })
      } else {
        progress({ type: 'complete', index, size: Buffer.byteLength(entry.content) })
      }
    }
    progress({ type: 'packing' })
    const archive = archiver('zip', { zlib: { level: 5 } })
    archive.on('warning', (error) => archive.destroy(error))
    const written = pipeline(archive, createWriteStream(destination, { mode: 0o600 }))
    for (const [index, entry] of entries.entries()) {
      if ('objectKey' in entry)
        archive.file(join(dirname(destination), `part-${index}`), { name: entry.name })
      else archive.append(entry.content, { name: entry.name })
    }
    void archive.finalize().catch((error) => archive.destroy(error))
    await written
  } finally {
    await Promise.all(staged.map((path) => rm(path, { force: true })))
  }
}
