import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { createError } from 'h3'
import { appConfig, obsConfigured } from './config'

// Design reference: https://github.com/xs10l3/lrc/blob/main/server/utils/obs.ts
// Keep the compatible checksum settings; serve private homework through authenticated routes.
let cachedClient: S3Client | undefined

function client() {
  if (!obsConfigured())
    throw createError({ statusCode: 503, message: '文件存储尚未配置，请联系管理员' })
  if (!cachedClient) {
    const c = appConfig()
    const endpoint = new URL(c.obsEndpoint)
    const localTest =
      process.env.OBS_ALLOW_LOCAL_TEST_ENDPOINT === 'true' &&
      ['127.0.0.1', 'localhost'].includes(endpoint.hostname)
    if (endpoint.protocol !== 'https:' && !localTest)
      throw createError({ statusCode: 503, message: 'OBS_ENDPOINT 必须使用 HTTPS' })
    cachedClient = new S3Client({
      region: c.obsRegion,
      endpoint: c.obsEndpoint,
      credentials: {
        accessKeyId: c.obsAccessKey,
        secretAccessKey: c.obsSecretKey,
        sessionToken: c.obsToken || undefined,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      forcePathStyle: localTest,
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    })
  }
  return cachedClient
}

export async function uploadObject(key: string, data: Buffer) {
  try {
    await client().send(
      new PutObjectCommand({
        Bucket: appConfig().obsBucket,
        Key: key,
        Body: data,
        ContentType: 'application/octet-stream',
        ContentLength: data.length,
      }),
    )
  } catch (error) {
    rethrowStorage(error)
  }
}

export async function downloadObject(key: string): Promise<Readable> {
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: appConfig().obsBucket, Key: key }),
    )
    if (!result.Body) throw new Error('Empty storage response')
    return result.Body instanceof Readable
      ? result.Body
      : Readable.fromWeb(
          result.Body.transformToWebStream() as unknown as import('node:stream/web').ReadableStream,
        )
  } catch (error) {
    return rethrowStorage(error)
  }
}

export async function removeUploadedObject(key: string) {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: appConfig().obsBucket, Key: key }))
  } catch {
    console.error('[OBS] Upload rollback failed')
  }
}

export async function checkBucket() {
  try {
    await client().send(new HeadBucketCommand({ Bucket: appConfig().obsBucket }))
    return true
  } catch (error) {
    return rethrowStorage(error)
  }
}

function rethrowStorage(error: unknown): never {
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  const code = error instanceof Error ? error.name : 'UnknownError'
  console.error('[OBS] Request failed:', code)
  throw createError({ statusCode: 502, message: '云端存储操作失败，请检查桶权限、区域与网络连接' })
}
