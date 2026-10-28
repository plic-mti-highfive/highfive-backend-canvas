import type { S3 } from '@hocuspocus/extension-s3'
import { env } from '../env'

export type S3Config = ConstructorParameters<typeof S3>[0]

/** Configuration S3/MinIO partagee par l'extension Hocuspocus et le controle du bucket. */
export const buildS3Config = (): S3Config => {
  if (env.ENV === 'dev') {
    return {
      bucket: env.BUCKET_NAME,
      endpoint: env.MINIO_ENDPOINT,
      credentials: {
        accessKeyId: env.MINIO_USERNAME,
        secretAccessKey: env.MINIO_PASSWORD,
      },
      forcePathStyle: true,
    }
  }
  return { bucket: env.BUCKET_NAME }
}

export const s3Config: S3Config = buildS3Config()
